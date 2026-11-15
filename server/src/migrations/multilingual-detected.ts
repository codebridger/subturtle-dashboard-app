/**
 * Follow-up to the multilingual backfill (`multilingual.ts`, step 4): phrases that backfill
 * had to default to English although the translator detected another language
 * (`languageDetected`, e.g. a German word saved with Russian as the own language). Run it
 * right after `migrate:multilingual --apply` and before the indexes and the review-log
 * snapshot, so the moved Leitner cards are snapshotted under their new language.
 *
 * It is a dry run unless `apply` is true, and safe to run twice (a moved phrase no longer
 * matches). For every confirmed phrase it:
 *   1. gives the owner a language profile for the detected language, in the shape the
 *      language service writes (`LanguageService.create`), and, for an account that has no
 *      language profile at all, the English one the service's `adoptLegacyAccount` would make;
 *   2. adds the phrase to a bundle of that language with the same title (created if needed)
 *      and takes it out of the English bundle; an English bundle this empties is deleted,
 *      one that still has phrases is left alone;
 *   3. moves the phrase's Leitner card and Pool entry into the language's documents (the
 *      cards live per language), then
 *   4. sets `language` and `languageSource: "detected"` on the phrase, last, so a run that
 *      stopped half-way finds the phrase again and finishes.
 *
 * Only phrases backfill defaulted (`languageSource: "backfill"`) or that still have no
 * language are candidates: a phrase a learner saved as English on purpose is never moved.
 * A phrase is skipped, with a note, when its language is not offered, or the owner removed
 * that language (it is purged within 30 days) or it is being purged.
 */
import { BUNDLE_COLLECTION, LANGUAGE_PROFILE_COLLECTION, LEITNER_SYSTEM_COLLECTION, PHRASE_COLLECTION, POOL_COLLECTION, PROFILE_COLLECTION } from "../config";
import { DEFAULT_LANGUAGE, langOf, toCode } from "../languages/helper";
import { getLearningLanguage } from "../languages/registry";
import { forEachBatch, guessOwnLanguage, MigrationOptions, physicalName } from "./multilingual";

type Db = any;
type Doc = Record<string, any>;

export interface DetectedOptions extends MigrationOptions {
  /** Only these phrase ids (the confirmed ones). */
  ids?: string[];
  /** Never these phrase ids (a wrong guess). */
  exclude?: string[];
  /** Only these detected languages, e.g. ["de"]. */
  languages?: string[];
}

export interface DetectedReport {
  apply: boolean;
  /** Phrases that backfill defaulted to English with another language detected. */
  candidates: number;
  /** Phrases moved (or that would be moved in a dry run). */
  phrases: number;
  owners: number;
  byLanguage: Record<string, number>;
  languageProfilesCreated: number;
  /** English language profiles made for accounts that had no language profile at all. */
  englishProfilesCreated: number;
  profileDocsCreated: number;
  bundlesCreated: number;
  /** Bundles that already existed in the language and received phrases. */
  bundlesReused: number;
  /** English bundles this emptied (deleted). English bundles that keep phrases are left alone. */
  bundlesDeleted: number;
  bundlesKept: number;
  leitnerCardsMoved: number;
  poolItemsMoved: number;
  /** One line per phrase moved or skipped, and per decision about an owner. */
  notes: string[];
}

const col = (db: Db, collection: string) => db.collection(physicalName(collection));
const isEnglish = (doc: Doc) => langOf(doc) === DEFAULT_LANGUAGE;
const ENGLISH_OR_MISSING = { $or: [{ language: DEFAULT_LANGUAGE }, { language: null }, { language: { $exists: false } }] };

/** What backfill left, or (run before backfill) what it will leave: not English, not set. */
const CANDIDATES = {
  $or: [
    { language: DEFAULT_LANGUAGE, languageSource: "backfill", languageDetected: { $exists: true } },
    { language: null },
    { language: { $exists: false } },
  ],
};

/** The detected language of a candidate, or undefined when it is English or unknown. */
function detectedOf(doc: Doc): string | undefined {
  const code = toCode(doc.languageDetected) ?? (!doc.language ? toCode(doc.language_info?.source) : undefined);
  return code && code !== DEFAULT_LANGUAGE ? code : undefined;
}

function emptyReport(apply: boolean): DetectedReport {
  return {
    apply,
    candidates: 0,
    phrases: 0,
    owners: 0,
    byLanguage: {},
    languageProfilesCreated: 0,
    englishProfilesCreated: 0,
    profileDocsCreated: 0,
    bundlesCreated: 0,
    bundlesReused: 0,
    bundlesDeleted: 0,
    bundlesKept: 0,
    leitnerCardsMoved: 0,
    poolItemsMoved: 0,
    notes: [],
  };
}

/** The language profile the language service writes for a language the learner studies. */
function languageProfileDoc(userId: string, language: string, addedAt: Date, own?: string): Doc {
  const now = new Date();
  return {
    userId,
    language,
    status: "active",
    startLevel: "A1",
    startLevelSource: "default",
    goals: [],
    ...(own ? { explanationLanguage: own } : {}),
    // No starter pack: the learner already has phrases in this language.
    starterPack: { state: "none", heard: [], total: 0 },
    addedAt,
    createdAt: now,
    updatedAt: now,
  };
}

export async function moveDetectedPhrases(db: Db, opts: DetectedOptions = {}): Promise<DetectedReport> {
  const apply = opts.apply === true;
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? 500, 5000));
  const log = opts.log ?? ((line: string) => console.log(line));
  const out = emptyReport(apply);
  const only = opts.ids?.length ? new Set(opts.ids) : null;
  const exclude = new Set(opts.exclude ?? []);
  const languages = opts.languages?.length ? new Set(opts.languages.map((l) => toCode(l)).filter(Boolean) as string[]) : null;

  // owner -> detected language -> phrases
  const plan = new Map<string, Map<string, Doc[]>>();
  await forEachBatch(
    col(db, PHRASE_COLLECTION),
    CANDIDATES,
    batchSize,
    async (docs) => {
      for (const doc of docs) {
        const language = detectedOf(doc);
        if (!language || !doc.refId) continue;
        out.candidates++;
        const id = String(doc._id);
        if ((only && !only.has(id)) || exclude.has(id) || (languages && !languages.has(language))) continue;
        if (getLearningLanguage(language)?.enabled !== true) {
          out.notes.push(`${id}: left in English, ${language} is not offered`);
          continue;
        }
        const byLanguage = plan.get(doc.refId) ?? new Map<string, Doc[]>();
        byLanguage.set(language, [...(byLanguage.get(language) ?? []), doc]);
        plan.set(doc.refId, byLanguage);
      }
    },
    { refId: 1, language: 1, languageSource: 1, languageDetected: 1, language_info: 1, phrase: 1 }
  );

  for (const [userId, byLanguage] of plan) {
    const before = out.phrases;
    for (const [language, docs] of byLanguage) await moveGroup(db, userId, language, docs, apply, out);
    if (out.phrases > before) out.owners++; // an owner whose phrases were all skipped is not counted
  }
  log(
    `[detected] ${out.candidates} candidate(s), ${out.phrases} ${apply ? "moved" : "would be moved"} for ${out.owners} owner(s) ` +
      `(${Object.entries(out.byLanguage).map(([l, n]) => `${l} ${n}`).join(", ") || "none"})`
  );
  return out;
}

async function moveGroup(db: Db, userId: string, language: string, docs: Doc[], apply: boolean, out: DetectedReport): Promise<void> {
  const profiles = col(db, PROFILE_COLLECTION);
  const languageProfiles = col(db, LANGUAGE_PROFILE_COLLECTION);
  const label = `${userId} ${language}`;

  // 1. language profiles
  const owned: Doc[] = await languageProfiles.find({ userId }).toArray();
  const target = owned.find((lp) => lp.language === language);
  if (target && (target.status === "removed" || target.status === "purging")) {
    out.notes.push(`${label}: ${docs.length} phrase(s) left in English, the learner ${target.status === "purging" ? "is purging" : "removed"} ${language}`);
    return;
  }

  let profile: Doc | null = await profiles.findOne({ refId: userId });
  const own = toCode(profile?.translationLanguage) ?? (await guessOwnLanguage(db, userId));

  if (owned.length === 0) {
    // An account from before multilingual that was never opened since: it studies English.
    const first: Doc[] = await col(db, PHRASE_COLLECTION).find({ refId: userId }, { projection: { createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
    const since = first[0]?.createdAt ? new Date(first[0].createdAt) : profile?.createdAt ? new Date(profile.createdAt) : new Date();
    out.englishProfilesCreated++;
    out.notes.push(`${label}: no language profile yet, English one created too`);
    if (apply) {
      await languageProfiles.updateOne({ userId, language: DEFAULT_LANGUAGE }, { $setOnInsert: languageProfileDoc(userId, DEFAULT_LANGUAGE, since, own) }, { upsert: true });
    }
    if (!profile) {
      out.profileDocsCreated++;
      if (apply) {
        const now = new Date();
        await profiles.updateOne(
          { refId: userId },
          { $setOnInsert: { refId: userId, onboardingState: "done", learningLanguage: DEFAULT_LANGUAGE, learningLanguages: [DEFAULT_LANGUAGE], ...(own ? { translationLanguage: own } : {}), createdAt: now, updatedAt: now } },
          { upsert: true }
        );
        profile = await profiles.findOne({ refId: userId });
      }
    } else if (!profile.onboardingState && apply) {
      await profiles.updateOne({ refId: userId, onboardingState: { $exists: false } }, { $set: { onboardingState: "done", ...(profile.learningLanguage ? {} : { learningLanguage: DEFAULT_LANGUAGE }) } });
    }
  }

  if (!target) {
    out.languageProfilesCreated++;
    if (apply) await languageProfiles.updateOne({ userId, language }, { $setOnInsert: languageProfileDoc(userId, language, new Date(), own) }, { upsert: true });
  }
  // The profile lists what the learner studies; the language service repairs it by plan
  // limits on the next read, so this only keeps the two in step.
  if (apply && profile) await profiles.updateOne({ refId: userId }, { $addToSet: { learningLanguages: language } });

  const ids = docs.map((d) => d._id);
  const idStrings = ids.map(String);
  const idSet = new Set(idStrings);

  // 2. bundles, additions first
  const bundles = col(db, BUNDLE_COLLECTION);
  const sources: Doc[] = (await bundles.find({ refId: userId, phrases: { $in: [...ids, ...idStrings] } }).toArray()).filter(isEnglish);
  const emptied: Doc[] = [];
  for (const source of sources) {
    const moved = (source.phrases as any[]).filter((p) => idSet.has(String(p)));
    const existing = await bundles.findOne({ refId: userId, language, title: source.title });
    if (existing) out.bundlesReused++;
    else out.bundlesCreated++;
    if (apply) {
      const now = new Date();
      await bundles.updateOne(
        { refId: userId, language, title: source.title },
        {
          $setOnInsert: {
            refId: userId,
            language,
            title: source.title,
            ...(source.desc ? { desc: source.desc } : {}),
            ...(source.image ? { image: source.image } : {}),
            createdAt: now,
            updatedAt: now,
          },
          $addToSet: { phrases: { $each: moved } },
        },
        { upsert: true }
      );
    }
    if (source.phrases.length - moved.length === 0) emptied.push(source);
    else out.bundlesKept++;
    out.notes.push(`${label}: bundle "${source.title}" ${existing ? "gets" : "created with"} ${moved.length} phrase(s)`);
  }

  // 3. Leitner cards and Pool entries
  for (const [collection, counter] of [[LEITNER_SYSTEM_COLLECTION, "leitnerCardsMoved"], [POOL_COLLECTION, "poolItemsMoved"]] as const) {
    const documents = col(db, collection);
    const found: Doc[] = (await documents.find({ userId, items: { $exists: true } }).toArray()).filter(isEnglish);
    const items = found.flatMap((d) => (d.items as Doc[]).filter((i) => idSet.has(String(i.phraseId))));
    if (items.length === 0) continue;
    out[counter] += items.length;
    if (!apply) continue;
    const there: Doc | null = await documents.findOne({ userId, language });
    const have = new Set(((there?.items as Doc[]) ?? []).map((i) => String(i.phraseId)));
    const add = items.filter((i, at) => !have.has(String(i.phraseId)) && items.findIndex((o) => String(o.phraseId) === String(i.phraseId)) === at);
    const now = new Date();
    const settings = found.find((d) => d.settings)?.settings;
    await documents.updateOne(
      { userId, language },
      { $setOnInsert: { userId, language, ...(settings ? { settings } : {}), createdAt: now, updatedAt: now }, $push: { items: { $each: add } } },
      { upsert: true }
    );
    await documents.updateMany({ _id: { $in: found.map((d) => d._id) } }, { $pull: { items: { phraseId: { $in: [...idStrings, ...ids] } } } });
  }

  // English bundles: leave one that still has phrases as it is, delete one this emptied.
  for (const source of emptied) {
    out.bundlesDeleted++;
    out.notes.push(`${label}: English bundle "${source.title}" is empty now, deleted`);
    if (apply) await bundles.deleteOne({ _id: source._id });
  }
  if (apply) {
    for (const source of sources) {
      if (emptied.includes(source)) continue;
      await bundles.updateOne({ _id: source._id }, { $pull: { phrases: { $in: [...ids, ...idStrings] } } });
    }
  }

  // 4. the phrases, last
  if (apply) {
    await col(db, PHRASE_COLLECTION).updateMany(
      { _id: { $in: ids }, ...ENGLISH_OR_MISSING },
      { $set: { language, languageSource: "detected", languageDetected: language } }
    );
  }
  out.phrases += docs.length;
  out.byLanguage[language] = (out.byLanguage[language] ?? 0) + docs.length;
  for (const doc of docs) out.notes.push(`${label}: phrase ${doc._id} "${String(doc.phrase ?? "").slice(0, 40)}" -> ${language}`);
}
