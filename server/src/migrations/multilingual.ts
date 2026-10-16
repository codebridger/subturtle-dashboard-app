/**
 * The multilingual migration (work list "Migration and backfill", B-27, B-30; ADR-006
 * point 11). Every step:
 * - is a **dry run unless `apply` is true**: it reads, counts and reports, and writes nothing;
 * - is safe to run twice: it only touches documents that still lack what it adds;
 * - walks the collection in `_id` order, `batchSize` documents at a time, so it never loads
 *   a whole collection and a Firestore request stays small.
 *
 * The code already works on today's data without any of this (a document with no
 * `language` reads as English), so the steps can run at any time, dev first. The CLI
 * wrappers are `scripts/multilingual-backfill.ts`, `scripts/multilingual-indexes.ts` and
 * `scripts/review-log-snapshot.ts`. Navid runs them; agents never run them on a real
 * database.
 *
 * Functions take the native driver `Db` (mongoose `connection.db`). Collection names are
 * the physical ones: modular-rest lets Mongoose pluralise the configured name
 * (`leitner_system` → `leitner_systems`).
 */
import mongoose from "mongoose";
import {
  BOARD_ACTIVITY_COLLECTION,
  BUNDLE_COLLECTION,
  LANGUAGE_PROFILE_COLLECTION,
  LEITNER_SYSTEM_COLLECTION,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  PHRASE_COLLECTION,
  POOL_COLLECTION,
  PROFILE_COLLECTION,
  REVIEW_LOG_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
} from "../config";
import { DEFAULT_LANGUAGE, langOf, toCode } from "../languages/helper";
import { getOwnLanguage } from "../languages/registry";
import { mergeLeitnerItems, mergePoolItems } from "../languages/language-docs";

export { mergeLeitnerItems, mergePoolItems };
import { pickPrimaryChunkText } from "../utils/chunk";

type Db = any; // mongodb Db: the driver types are not a direct dependency of the server
type Doc = Record<string, any>;

export interface MigrationOptions {
  /** Write the changes. False (the default) is a dry run. */
  apply?: boolean;
  batchSize?: number;
  log?: (line: string) => void;
}

export interface StepReport {
  step: string;
  apply: boolean;
  scanned: number;
  changed: number;
  /** Anything the step had to decide about: merged duplicates, renamed bundles, … */
  notes: string[];
}

const DEFAULT_BATCH = 500;
/** A stored document with no language: missing or null (both are English, `langOf`). */
// Both forms, not `{ language: null }` alone: on Firestore with MongoDB compatibility a null
// match is not promised to find a missing field.
const NO_LANGUAGE = { $or: [{ language: null }, { language: { $exists: false } }] };

const pluralize = mongoose.pluralize() as (name: string) => string;

/** The physical collection modular-rest stores a configured collection in. */
export function physicalName(collection: string): string {
  return pluralize ? pluralize(collection) : collection;
}

const col = (db: Db, collection: string) => db.collection(physicalName(collection));

function settings(opts: MigrationOptions) {
  return {
    apply: opts.apply === true,
    batchSize: Math.max(1, Math.min(opts.batchSize ?? DEFAULT_BATCH, 5000)),
    log: opts.log ?? ((line: string) => console.log(line)),
  };
}

function report(step: string, apply: boolean): StepReport {
  return { step, apply, scanned: 0, changed: 0, notes: [] };
}

/** Calls `fn` with each batch of matching documents, in `_id` order. */
async function forEachBatch(collection: any, filter: Doc, batchSize: number, fn: (docs: Doc[]) => Promise<void>, projection?: Doc) {
  let lastId: any = null;
  for (;;) {
    const query = lastId === null ? filter : { $and: [filter, { _id: { $gt: lastId } }] };
    const cursor = collection.find(query, projection ? { projection } : undefined).sort({ _id: 1 }).limit(batchSize);
    const docs: Doc[] = await cursor.toArray();
    if (docs.length === 0) return;
    await fn(docs);
    lastId = docs[docs.length - 1]._id;
    if (docs.length < batchSize) return;
  }
}

async function bulk(collection: any, ops: Doc[], apply: boolean): Promise<number> {
  if (ops.length === 0) return 0;
  if (!apply) return ops.length;
  const result = await collection.bulkWrite(ops, { ordered: false });
  return (result.modifiedCount ?? 0) + (result.upsertedCount ?? 0) + (result.deletedCount ?? 0) + (result.insertedCount ?? 0);
}

// ---------------------------------------------------------------------------------------
// Step 1 and 10: measure and check
// ---------------------------------------------------------------------------------------

/** The collections that carry `language` (ADR-006 point 4). */
export const LANGUAGE_COLLECTIONS = [
  PHRASE_COLLECTION,
  BUNDLE_COLLECTION,
  LEITNER_SYSTEM_COLLECTION,
  POOL_COLLECTION,
  BOARD_ACTIVITY_COLLECTION,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
];

export interface MeasureReport {
  /** Documents with no `language`, per collection (the Phase 0 gate is all zeros). */
  withoutLanguage: Record<string, number>;
  /** Users with more than one Leitner / Pool document for one language. */
  duplicates: Record<string, number>;
  /** How often each cleaned `language_info.source` appears on phrases with no language. */
  detectedSources: Record<string, number>;
  /** How often each cleaned own language (translation target) appears. */
  ownLanguages: Record<string, number>;
}

async function countDuplicates(db: Db, collection: string, key: (doc: Doc) => string, batchSize: number): Promise<number> {
  const seen = new Map<string, number>();
  await forEachBatch(col(db, collection), {}, batchSize, async (docs) => {
    for (const doc of docs) seen.set(key(doc), (seen.get(key(doc)) ?? 0) + 1);
  }, { userId: 1, language: 1, type: 1, refId: 1 });
  return [...seen.values()].filter((n) => n > 1).length;
}

/** Step 1 (and step 10, "check"): counts only, never writes. */
export async function measure(db: Db, opts: MigrationOptions = {}): Promise<MeasureReport> {
  const { batchSize } = settings(opts);
  const withoutLanguage: Record<string, number> = {};
  for (const collection of LANGUAGE_COLLECTIONS) {
    withoutLanguage[collection] = await col(db, collection).countDocuments(NO_LANGUAGE);
  }

  const detectedSources: Record<string, number> = {};
  const ownLanguages: Record<string, number> = {};
  await forEachBatch(col(db, PHRASE_COLLECTION), NO_LANGUAGE, batchSize, async (docs) => {
    for (const doc of docs) {
      const source = toCode(doc.language_info?.source) ?? "unknown";
      detectedSources[source] = (detectedSources[source] ?? 0) + 1;
      const own = toCode(doc.language_info?.target ?? doc.translation_language) ?? "unknown";
      ownLanguages[own] = (ownLanguages[own] ?? 0) + 1;
    }
  }, { language_info: 1, translation_language: 1 });

  const userLanguage = (doc: Doc) => `${doc.userId}|${langOf(doc)}`;
  const duplicates = {
    [LEITNER_SYSTEM_COLLECTION]: await countDuplicates(db, LEITNER_SYSTEM_COLLECTION, userLanguage, batchSize),
    [POOL_COLLECTION]: await countDuplicates(db, POOL_COLLECTION, userLanguage, batchSize),
    [BOARD_ACTIVITY_COLLECTION]: await countDuplicates(db, BOARD_ACTIVITY_COLLECTION, (d) => `${d.userId}|${d.type}|${langOf(d)}|${d.refId ?? ""}`, batchSize),
  };
  return { withoutLanguage, duplicates, detectedSources, ownLanguages };
}

// ---------------------------------------------------------------------------------------
// Step 3: profiles
// ---------------------------------------------------------------------------------------

/** The own language a learner translated into most, from their latest 200 phrases. */
async function guessOwnLanguage(db: Db, userId: string): Promise<string | undefined> {
  const phrases: Doc[] = await col(db, PHRASE_COLLECTION)
    .find({ refId: userId }, { projection: { language_info: 1, translation_language: 1 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    const code = toCode(phrase.language_info?.target ?? phrase.translation_language);
    if (code && getOwnLanguage(code)) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Step 3. Every profile from before multilingual (no `onboardingState`) studies English:
 * an `en` language profile (as the language module's own first read makes it), then
 * `learningLanguage: "en"`, `learningLanguages: ["en"]`, onboarding done, and the own
 * language guessed from the phrases when it is not set. New accounts (onboarding state set)
 * are not touched.
 */
export async function backfillProfiles(db: Db, opts: MigrationOptions = {}): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report("profiles", apply);
  const profiles = col(db, PROFILE_COLLECTION);
  const languageProfiles = col(db, LANGUAGE_PROFILE_COLLECTION);

  await forEachBatch(profiles, { onboardingState: { $exists: false } }, batchSize, async (docs) => {
    const profileOps: Doc[] = [];
    const languageOps: Doc[] = [];
    for (const profile of docs) {
      out.scanned++;
      const userId = profile.refId;
      if (!userId) continue;
      if (await languageProfiles.countDocuments({ userId }, { limit: 1 })) {
        out.notes.push(`${userId}: already has a language profile, left alone`);
        continue;
      }
      languageOps.push({
        updateOne: {
          filter: { userId, language: DEFAULT_LANGUAGE },
          update: {
            $setOnInsert: {
              userId,
              language: DEFAULT_LANGUAGE,
              status: "active",
              startLevel: "A1",
              startLevelSource: "default",
              goals: [],
              starterPack: { state: "none", heard: [], total: 0 },
              addedAt: profile.createdAt ? new Date(profile.createdAt) : new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
      const set: Doc = { onboardingState: "done" };
      if (!profile.learningLanguage) set.learningLanguage = DEFAULT_LANGUAGE;
      if (!Array.isArray(profile.learningLanguages) || profile.learningLanguages.length === 0) set.learningLanguages = [DEFAULT_LANGUAGE];
      if (!profile.translationLanguage) {
        const guess = await guessOwnLanguage(db, userId);
        if (guess) set.translationLanguage = guess;
      }
      profileOps.push({ updateOne: { filter: { _id: profile._id, onboardingState: { $exists: false } }, update: { $set: set } } });
    }
    await bulk(languageProfiles, languageOps, apply);
    out.changed += await bulk(profiles, profileOps, apply);
  });
  log(`[profiles] ${out.scanned} scanned, ${out.changed} ${apply ? "updated" : "would be updated"}`);
  return out;
}

// ---------------------------------------------------------------------------------------
// Step 4: phrases
// ---------------------------------------------------------------------------------------

/**
 * Step 4. Phrases with no language become `en` with `languageSource: "backfill"`. A phrase
 * whose detected source looks like another language keeps that guess in `languageDetected`
 * for review; it is not moved.
 */
export async function backfillPhrases(db: Db, opts: MigrationOptions = {}): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report("phrases", apply);
  const phrases = col(db, PHRASE_COLLECTION);
  let flagged = 0;
  await forEachBatch(phrases, NO_LANGUAGE, batchSize, async (docs) => {
    const ops = docs.map((doc) => {
      out.scanned++;
      const set: Doc = { language: DEFAULT_LANGUAGE, languageSource: "backfill" };
      const detected = toCode(doc.language_info?.source);
      if (detected && detected !== DEFAULT_LANGUAGE && !doc.languageDetected) {
        set.languageDetected = detected;
        flagged++;
      }
      return { updateOne: { filter: { _id: doc._id, ...NO_LANGUAGE }, update: { $set: set } } };
    });
    out.changed += await bulk(phrases, ops, apply);
  }, { language_info: 1, languageDetected: 1 });
  if (flagged) out.notes.push(`${flagged} phrase(s) look non-English; kept in languageDetected for review`);
  log(`[phrases] ${out.scanned} scanned, ${out.changed} ${apply ? "updated" : "would be updated"}, ${flagged} look non-English`);
  return out;
}

// ---------------------------------------------------------------------------------------
// Step 5: bundles
// ---------------------------------------------------------------------------------------

/**
 * Step 5. Bundles with no language become `en`. A bundle whose title an `en` bundle of the
 * same learner already has (made after multilingual started) is renamed "Title (2)", so the
 * unique `(refId, language, title)` index can be built.
 */
export async function backfillBundles(db: Db, opts: MigrationOptions = {}): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report("bundles", apply);
  const bundles = col(db, BUNDLE_COLLECTION);
  await forEachBatch(bundles, NO_LANGUAGE, batchSize, async (docs) => {
    for (const doc of docs) {
      out.scanned++;
      let title = doc.title;
      const taken = async (candidate: string) =>
        (await bundles.countDocuments({ refId: doc.refId, title: candidate, _id: { $ne: doc._id }, language: { $in: [DEFAULT_LANGUAGE, null] } }, { limit: 1 })) > 0;
      if (await bundles.countDocuments({ refId: doc.refId, title, language: DEFAULT_LANGUAGE }, { limit: 1 })) {
        let n = 2;
        while (await taken(`${doc.title} (${n})`)) n++;
        title = `${doc.title} (${n})`;
        out.notes.push(`${doc.refId}: bundle "${doc.title}" renamed "${title}" (an English bundle has that title)`);
      }
      const set: Doc = { language: DEFAULT_LANGUAGE };
      if (title !== doc.title) set.title = title;
      out.changed += await bulk(bundles, [{ updateOne: { filter: { _id: doc._id, ...NO_LANGUAGE }, update: { $set: set } } }], apply);
    }
  }, { refId: 1, title: 1 });
  log(`[bundles] ${out.scanned} scanned, ${out.changed} ${apply ? "updated" : "would be updated"}, ${out.notes.length} renamed`);
  return out;
}

// ---------------------------------------------------------------------------------------
// Step 6 and 7: Leitner, Pool and board (merge duplicates, then set the language)
// ---------------------------------------------------------------------------------------

/** Walks a per-user collection one user at a time (sorted by user, then `_id`). */
async function forEachUserGroup(collection: any, batchSize: number, fn: (userId: string, docs: Doc[]) => Promise<void>) {
  let current: string | null = null;
  let group: Doc[] = [];
  let lastKey: { userId: string; _id: any } | null = null;
  for (;;) {
    const query = lastKey
      ? { $or: [{ userId: { $gt: lastKey.userId } }, { userId: lastKey.userId, _id: { $gt: lastKey._id } }] }
      : {};
    const docs: Doc[] = await collection.find(query).sort({ userId: 1, _id: 1 }).limit(batchSize).toArray();
    for (const doc of docs) {
      if (current !== null && doc.userId !== current) {
        await fn(current, group);
        group = [];
      }
      current = doc.userId;
      group.push(doc);
    }
    if (docs.length < batchSize) break;
    lastKey = { userId: docs[docs.length - 1].userId, _id: docs[docs.length - 1]._id };
  }
  if (current !== null) await fn(current, group);
}

const time = (value: unknown) => (value ? new Date(value as any).getTime() : 0);

async function mergePerUserLanguage(
  db: Db,
  collection: string,
  merge: (primary: Doc[], others: Doc[][]) => Doc[],
  opts: MigrationOptions
): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report(collection, apply);
  const target = col(db, collection);
  await forEachUserGroup(target, batchSize, async (userId, docs) => {
    const byLanguage = new Map<string, Doc[]>();
    for (const doc of docs) {
      out.scanned++;
      const language = langOf(doc);
      byLanguage.set(language, [...(byLanguage.get(language) || []), doc]);
    }
    for (const [language, group] of byLanguage) {
      // The document with the most items stays; the others are folded into it.
      const sorted = [...group].sort((a, b) => (b.items?.length ?? 0) - (a.items?.length ?? 0) || String(a._id).localeCompare(String(b._id)));
      const [primary, ...rest] = sorted;
      const ops: Doc[] = [];
      const set: Doc = {};
      if (!primary.language) set.language = language;
      if (rest.length > 0) {
        set.items = merge(primary.items || [], rest.map((d) => d.items || []));
        out.notes.push(`${userId} ${language}: merged ${rest.length + 1} documents into ${primary._id} (${set.items.length} items)`);
        for (const doc of rest) ops.push({ deleteOne: { filter: { _id: doc._id } } });
      }
      if (Object.keys(set).length > 0) ops.unshift({ updateOne: { filter: { _id: primary._id }, update: { $set: set } } });
      out.changed += await bulk(target, ops, apply);
    }
  });
  log(`[${collection}] ${out.scanned} scanned, ${out.changed} ${apply ? "writes" : "writes planned"}, ${out.notes.length} merge(s)`);
  return out;
}

/** Step 6. Leitner: merge each user's duplicate documents per language, then set `language`. */
export const backfillLeitner = (db: Db, opts: MigrationOptions = {}) => mergePerUserLanguage(db, LEITNER_SYSTEM_COLLECTION, mergeLeitnerItems, opts);

/** Step 6. Pool: merge each user's duplicate documents per language, then set `language`. */
export const backfillPools = (db: Db, opts: MigrationOptions = {}) => mergePerUserLanguage(db, POOL_COLLECTION, mergePoolItems, opts);

/** Step 7. Board rows: keep the latest row per (user, type, language, refId), then set `language`. */
export async function backfillBoard(db: Db, opts: MigrationOptions = {}): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report(BOARD_ACTIVITY_COLLECTION, apply);
  const board = col(db, BOARD_ACTIVITY_COLLECTION);
  await forEachUserGroup(board, batchSize, async (userId, docs) => {
    const groups = new Map<string, Doc[]>();
    for (const doc of docs) {
      out.scanned++;
      const key = `${doc.type}|${langOf(doc)}|${doc.refId ?? ""}`;
      groups.set(key, [...(groups.get(key) || []), doc]);
    }
    for (const [key, group] of groups) {
      const [keep, ...rest] = [...group].sort((a, b) => time(b.lastUpdated) - time(a.lastUpdated) || String(a._id).localeCompare(String(b._id)));
      const ops: Doc[] = rest.map((doc) => ({ deleteOne: { filter: { _id: doc._id } } }));
      if (rest.length) out.notes.push(`${userId} ${key}: kept the latest of ${group.length} rows`);
      if (!keep.language) ops.unshift({ updateOne: { filter: { _id: keep._id }, update: { $set: { language: langOf(keep) } } } });
      out.changed += await bulk(board, ops, apply);
    }
  });
  log(`[board] ${out.scanned} scanned, ${out.changed} ${apply ? "writes" : "writes planned"}, ${out.notes.length} duplicate group(s)`);
  return out;
}

// ---------------------------------------------------------------------------------------
// Step 8: sessions
// ---------------------------------------------------------------------------------------

/**
 * Step 8. Voice and text Coach sessions get `language: "en"` and an `explanationLanguage`
 * from the old `metadata.nativeLanguage`; save-assistant sessions get `language: "en"` and
 * a `translationLanguage` code from their `targetLanguage`.
 */
export async function backfillSessions(db: Db, opts: MigrationOptions = {}): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report("sessions", apply);
  const plan: [string, (doc: Doc) => Doc][] = [
    [LIVE_SESSION_COLLECTION, coachSet],
    [LIVE_SESSION_TEXT_COLLECTION, coachSet],
    [SAVE_ASSISTANT_SESSION_COLLECTION, saveSet],
  ];
  for (const [collection, setFor] of plan) {
    const target = col(db, collection);
    await forEachBatch(target, NO_LANGUAGE, batchSize, async (docs) => {
      const ops = docs.map((doc) => {
        out.scanned++;
        return { updateOne: { filter: { _id: doc._id, ...NO_LANGUAGE }, update: { $set: setFor(doc) } } };
      });
      out.changed += await bulk(target, ops, apply);
    }, { metadata: 1, explanationLanguage: 1, targetLanguage: 1, translationLanguage: 1 });
  }
  log(`[sessions] ${out.scanned} scanned, ${out.changed} ${apply ? "updated" : "would be updated"}`);
  return out;

  function coachSet(doc: Doc): Doc {
    const set: Doc = { language: DEFAULT_LANGUAGE };
    const explanation = toCode(doc.metadata?.explanationLanguage) ?? toCode(doc.metadata?.nativeLanguage);
    if (!doc.explanationLanguage && explanation) set.explanationLanguage = explanation;
    return set;
  }
  function saveSet(doc: Doc): Doc {
    const set: Doc = { language: DEFAULT_LANGUAGE };
    const own = toCode(doc.targetLanguage);
    if (!doc.translationLanguage && own) set.translationLanguage = own;
    return set;
  }
}

// ---------------------------------------------------------------------------------------
// Step 9: review log snapshot (B-30)
// ---------------------------------------------------------------------------------------

/**
 * Step 9. One `snapshot` row in the review log per card that exists now: its language,
 * box and last review date. Keyed `snapshot:<language>:<phraseId>`, so a second run adds
 * only cards that are new since. Past answers cannot be recovered; they were never stored.
 */
export async function snapshotReviewLog(db: Db, opts: MigrationOptions = {}): Promise<StepReport> {
  const { apply, batchSize, log } = settings(opts);
  const out = report("review-log-snapshot", apply);
  const leitner = col(db, LEITNER_SYSTEM_COLLECTION);
  const phrases = col(db, PHRASE_COLLECTION);
  const reviewLog = col(db, REVIEW_LOG_COLLECTION);
  const ts = new Date();

  // Small batches: one Leitner document can hold thousands of cards.
  await forEachBatch(leitner, {}, Math.min(batchSize, 50), async (systems) => {
    for (const system of systems) {
      const language = langOf(system);
      const items: Doc[] = (system.items || []).filter((item: Doc) => item?.phraseId);
      for (let i = 0; i < items.length; i += batchSize) {
        const slice = items.slice(i, i + batchSize);
        const ids = slice.map((item) => String(item.phraseId)).filter((id) => mongoose.Types.ObjectId.isValid(id));
        const found: Doc[] = ids.length
          ? await phrases.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { chunks: 1, languageSource: 1 } }).toArray()
          : [];
        const byId = new Map(found.map((p) => [String(p._id), p]));
        const ops = slice.map((item) => {
          out.scanned++;
          const phraseId = String(item.phraseId);
          const phrase = byId.get(phraseId);
          const eventKey = `snapshot:${language}:${phraseId}`;
          return {
            updateOne: {
              filter: { userId: system.userId, eventKey },
              update: {
                $setOnInsert: {
                  userId: system.userId,
                  language,
                  languageSource: phrase?.languageSource ?? "backfill",
                  phraseId,
                  chunk: pickPrimaryChunkText(phrase?.chunks),
                  cardType: "snapshot",
                  kind: "snapshot",
                  result: null,
                  fromBox: item.boxLevel ?? null,
                  toBox: item.boxLevel ?? null,
                  lastAttemptDate: item.lastAttemptDate ?? null,
                  ts,
                  eventKey,
                  createdAt: ts,
                },
              },
              upsert: true,
            },
          };
        });
        if (apply) {
          const result = await reviewLog.bulkWrite(ops, { ordered: false });
          out.changed += result.upsertedCount ?? 0;
        } else {
          // A dry run counts the rows that do not exist yet.
          const existing = await reviewLog.countDocuments({ userId: system.userId, eventKey: { $in: ops.map((op) => op.updateOne.filter.eventKey) } });
          out.changed += ops.length - existing;
        }
      }
    }
  }, { userId: 1, language: 1, items: 1 });
  log(`[review-log] ${out.scanned} cards scanned, ${out.changed} snapshot row(s) ${apply ? "written" : "to write"}`);
  return out;
}

// ---------------------------------------------------------------------------------------
// Indexes (ADR-006 point 11)
// ---------------------------------------------------------------------------------------

export interface IndexPlan {
  collection: string;
  name: string;
  key: Doc;
  unique: boolean;
  /** Why it cannot be built yet, if it cannot. */
  blocked?: string;
}

export interface IndexReport {
  apply: boolean;
  created: string[];
  dropped: string[];
  blocked: string[];
  existing: string[];
}

export const INDEXES: Omit<IndexPlan, "blocked">[] = [
  { collection: LEITNER_SYSTEM_COLLECTION, name: "userId_1_language_1", key: { userId: 1, language: 1 }, unique: true },
  { collection: POOL_COLLECTION, name: "userId_1_language_1", key: { userId: 1, language: 1 }, unique: true },
  { collection: BOARD_ACTIVITY_COLLECTION, name: "userId_1_type_1_language_1_refId_1", key: { userId: 1, type: 1, language: 1, refId: 1 }, unique: true },
  { collection: BUNDLE_COLLECTION, name: "refId_1_language_1_title_1", key: { refId: 1, language: 1, title: 1 }, unique: true },
  { collection: PHRASE_COLLECTION, name: "refId_1_language_1", key: { refId: 1, language: 1 }, unique: false },
  { collection: REVIEW_LOG_COLLECTION, name: "userId_1_eventKey_1", key: { userId: 1, eventKey: 1 }, unique: true },
];

/** The bundle index ADR-006 replaces; dropped only after its replacement exists. */
export const OLD_BUNDLE_INDEX = "refId_1_title_1";

async function indexNames(collection: any): Promise<string[]> {
  try {
    return (await collection.indexes()).map((index: Doc) => index.name);
  } catch (error: any) {
    if (error?.codeName === "NamespaceNotFound" || error?.code === 26) return [];
    throw error;
  }
}

/**
 * Builds the per-language indexes, then drops the old bundle index. A unique Leitner, Pool
 * or board index is refused while documents without `language` or duplicates remain (run
 * the backfill first). The new bundle index is built before the old one is dropped: every
 * pair that passes `(refId, title)` also passes `(refId, language, title)`.
 */
export async function ensureIndexes(db: Db, opts: MigrationOptions = {}): Promise<IndexReport> {
  const { apply, batchSize, log } = settings(opts);
  const out: IndexReport = { apply, created: [], dropped: [], blocked: [], existing: [] };
  const counts = await measure(db, { batchSize });

  for (const plan of INDEXES) {
    const target = col(db, plan.collection);
    const label = `${physicalName(plan.collection)}.${plan.name}`;
    if ((await indexNames(target)).includes(plan.name)) {
      out.existing.push(label);
      continue;
    }
    const perUser = [LEITNER_SYSTEM_COLLECTION, POOL_COLLECTION, BOARD_ACTIVITY_COLLECTION].includes(plan.collection);
    if (perUser && counts.withoutLanguage[plan.collection] > 0) {
      out.blocked.push(`${label}: ${counts.withoutLanguage[plan.collection]} document(s) have no language yet`);
      continue;
    }
    if (perUser && counts.duplicates[plan.collection] > 0) {
      out.blocked.push(`${label}: ${counts.duplicates[plan.collection]} user(s) have duplicate documents`);
      continue;
    }
    if (apply) await target.createIndex(plan.key, { name: plan.name, unique: plan.unique });
    out.created.push(label);
  }

  const bundles = col(db, BUNDLE_COLLECTION);
  const bundleIndexes = await indexNames(bundles);
  const replacement = INDEXES.find((i) => i.collection === BUNDLE_COLLECTION)!.name;
  const replacementReady = bundleIndexes.includes(replacement) || (out.created.some((c) => c.endsWith(replacement)) && apply);
  if (bundleIndexes.includes(OLD_BUNDLE_INDEX)) {
    if (replacementReady || !apply) {
      if (apply) await bundles.dropIndex(OLD_BUNDLE_INDEX);
      out.dropped.push(`${physicalName(BUNDLE_COLLECTION)}.${OLD_BUNDLE_INDEX}`);
    } else {
      out.blocked.push(`${physicalName(BUNDLE_COLLECTION)}.${OLD_BUNDLE_INDEX}: kept until ${replacement} exists`);
    }
  }

  const verb = apply ? "" : " (dry run: nothing changed)";
  log(`[indexes] created ${out.created.length}, dropped ${out.dropped.length}, blocked ${out.blocked.length}, already there ${out.existing.length}${verb}`);
  for (const line of [...out.created.map((c) => `  + ${c}`), ...out.dropped.map((d) => `  - ${d}`), ...out.blocked.map((b) => `  ! ${b}`)]) log(line);
  return out;
}

// ---------------------------------------------------------------------------------------
// All steps, in order
// ---------------------------------------------------------------------------------------

export const BACKFILL_STEPS: Record<string, (db: Db, opts: MigrationOptions) => Promise<StepReport>> = {
  profiles: backfillProfiles,
  phrases: backfillPhrases,
  bundles: backfillBundles,
  leitner: backfillLeitner,
  pools: backfillPools,
  board: backfillBoard,
  sessions: backfillSessions,
};

/** Steps 3 to 8 in the work list's order. Indexes and the snapshot are separate scripts. */
export async function runBackfill(db: Db, opts: MigrationOptions = {}, only?: string[]): Promise<StepReport[]> {
  const reports: StepReport[] = [];
  for (const [name, step] of Object.entries(BACKFILL_STEPS)) {
    if (only && only.length > 0 && !only.includes(name)) continue;
    reports.push(await step(db, opts));
  }
  return reports;
}
