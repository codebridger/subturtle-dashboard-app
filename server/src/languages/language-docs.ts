/**
 * Finds one learner's per-language document (Leitner, Pool, board row) on any database
 * (work list B-10, B-11, B-12).
 *
 * Why this exists: a document from before multilingual has no `language` and is English.
 * The first version matched it with one filter, `{ language: { $in: ["en", null] } }`.
 * On MongoDB `null` also matches a missing field, but Firestore with MongoDB compatibility
 * does not promise that. When the filter missed the old document, get-or-create made a new
 * empty `en` document, and from then on the learner's review read the empty one.
 *
 * So the language is never matched in the database here. We list the learner's documents
 * by owner (and type) only, with just `_id` and `language`, pick the ones whose language is
 * the one asked for in code (`langOf`: missing, null, a title or a code), and then load
 * those by `_id`. Plain equality and `_id` lookups work the same on every database.
 *
 * `resolveLanguageDoc` then makes the data right on the spot:
 * - an old document with no `language` is adopted: it gets `language` set;
 * - when there are two or more (the empty `en` copy the bug left, or two get-or-creates
 *   that raced before the unique index exists), they are merged into one and the extra
 *   copies are deleted.
 */
import { DEFAULT_LANGUAGE, LangCode, langOf, toCode } from "./helper";

type Doc = Record<string, any>;

/** The collection calls this needs (a Mongoose model, as `getCollection` returns). */
export interface LanguageDocCollection {
  find(filter: any, projection?: any): any;
  updateOne(filter: any, update: any, options?: any): any;
  deleteOne(filter: any): any;
}

export interface MergePlan {
  /** Sorts the copies: the first one stays. Must give the same order every time. */
  rank(a: Doc, b: Doc): number;
  /** Fields to `$set` on the kept copy, from all copies (kept one first). */
  merge(kept: Doc, others: Doc[]): Doc;
}

const plain = (doc: any): Doc => (doc && typeof doc.toObject === "function" ? doc.toObject() : doc);
const idOf = (doc: Doc) => String(doc._id);
const time = (value: unknown) => (value ? new Date(value as any).getTime() : 0);

async function toArray(result: any): Promise<Doc[]> {
  if (result && typeof result.toArray === "function") return result.toArray();
  return (await result) || [];
}

/**
 * Every document of the owner (`base`, for example `{ userId }`) that belongs to the
 * language, oldest `_id` first. Never matches the language in the database. `accept`
 * narrows the list in code (it sees `_id`, `language` and `refId`).
 */
export async function findLanguageDocs(col: LanguageDocCollection, base: Doc, language: LangCode, accept?: (head: Doc) => boolean): Promise<any[]> {
  const code = toCode(language) ?? DEFAULT_LANGUAGE;
  const heads = await toArray(col.find(base, { _id: 1, language: 1, refId: 1 }));
  const ids = heads.filter((doc) => langOf(doc) === code && (!accept || accept(doc))).map((doc) => doc._id);
  if (ids.length === 0) return [];
  const docs = ids.length === 1 ? await toArray(col.find({ _id: ids[0] })) : await toArray(col.find({ _id: { $in: ids } }));
  return docs.sort((a, b) => idOf(a).localeCompare(idOf(b)));
}

/**
 * The owner's one document for the language, or null. Adopts an old document (sets its
 * `language`) and merges duplicate copies into one, deleting the extra copies. Never
 * creates a document.
 */
export async function resolveLanguageDoc(
  col: LanguageDocCollection,
  base: Doc,
  language: LangCode,
  plan: MergePlan,
  accept?: (head: Doc) => boolean
): Promise<any | null> {
  const code = toCode(language) ?? DEFAULT_LANGUAGE;
  const docs = await findLanguageDocs(col, base, code, accept);
  if (docs.length === 0) return null;

  const [kept, ...others] = [...docs].sort((a, b) => plan.rank(plain(a), plain(b)) || idOf(a).localeCompare(idOf(b)));
  const set: Doc = {};
  if (kept.language !== code) set.language = code;
  if (others.length > 0) {
    Object.assign(set, plan.merge(plain(kept), others.map(plain)));
    console.warn(`[language-docs] merged ${others.length + 1} ${code} documents of ${JSON.stringify(base)} into ${idOf(kept)}`);
  }

  if (Object.keys(set).length > 0 || others.length > 0) {
    if (Object.keys(set).length > 0) await col.updateOne({ _id: kept._id }, { $set: set });
    for (const doc of others) await col.deleteOne({ _id: doc._id });
    // Return what is stored now, so callers read the merged items.
    const [fresh] = await toArray(col.find({ _id: kept._id }));
    return fresh ?? null;
  }
  return kept;
}

// The item merge rules, shared with the migration (src/migrations/multilingual.ts).
function byPhrase(items: Doc[] | undefined): Map<string, Doc> {
  const map = new Map<string, Doc>();
  for (const item of items || []) if (item?.phraseId) map.set(String(item.phraseId), item);
  return map;
}

/** Merges Leitner items: the copy answered last wins. */
export function mergeLeitnerItems(primary: Doc[], others: Doc[][]): Doc[] {
  const merged = byPhrase(primary);
  for (const items of others) {
    for (const [id, item] of byPhrase(items)) {
      const kept = merged.get(id);
      if (!kept || time(item.lastAttemptDate) > time(kept.lastAttemptDate)) merged.set(id, item);
    }
  }
  return [...merged.values()];
}

/** Merges Pool items: the earliest `pooled_at` wins, and a phrase met in any copy is met. */
export function mergePoolItems(primary: Doc[], others: Doc[][]): Doc[] {
  const merged = byPhrase(primary);
  for (const items of others) {
    for (const [id, item] of byPhrase(items)) {
      const kept = merged.get(id);
      if (!kept) merged.set(id, item);
      else
        merged.set(id, {
          ...(time(item.pooled_at) < time(kept.pooled_at) ? item : kept),
          encountered: Boolean(kept.encountered || item.encountered),
        });
    }
  }
  return [...merged.values()];
}

const itemCount = (doc: Doc) => (Array.isArray(doc.items) ? doc.items.length : 0);

/** Keeps the copy with the most items (the old document, never the empty one). */
export function itemsPlan(mergeItems: (primary: Doc[], others: Doc[][]) => Doc[]): MergePlan {
  return {
    rank: (a, b) => itemCount(b) - itemCount(a),
    merge(kept, others) {
      // Only rewrite the items when another copy has some: the usual leftover is empty,
      // and leaving `items` alone cannot lose a card pushed in the meantime.
      if (others.every((doc) => itemCount(doc) === 0)) return {};
      return { items: mergeItems(kept.items || [], others.map((doc) => doc.items || [])) };
    },
  };
}

/** True for a row with no `refId` (a singleton board row). Checked in code, not in the query. */
export const withoutRefId = (head: Doc) => head.refId === undefined || head.refId === null || head.refId === "";

/** Board rows: keeps the latest row; it stays persistent if any copy was. */
export const boardPlan: MergePlan = {
  rank: (a, b) => time(b.lastUpdated) - time(a.lastUpdated),
  merge(kept, others) {
    const persistent = Boolean(kept.persistent) || others.some((doc) => doc.persistent);
    return persistent !== Boolean(kept.persistent) ? { persistent } : {};
  },
};
