/**
 * The starter pack (B-21, B-22): about 150 A1 chunks per learning language, each with a
 * translation per own language, a frequency band and a group. An offer, not a gate (Q5).
 *
 * - `getPack`: the items for the learner's own language, with audio when stored, and the ids
 *   already heard.
 * - `completeItems`: the items the learner heard join that language's starter bundle as
 *   phrases, at most the language's daily intake (`newPhrasesPerDay`, default 20) a day.
 *   Items over the cap are not marked heard and come back as `deferred`, so the client can
 *   offer them again tomorrow. The phrase insert triggers route new phrases into the Pool,
 *   like any save. Starter phrases do not count against the free saved-words cap: they are
 *   our content, not the learner's saves.
 * - `skip`: the learner skipped the pack; the offer goes away.
 * - `onLanguageAdded`: a new language with a pack gets its `total`.
 */
import { getCollection } from "@modular-rest/server";
import { BUNDLE_COLLECTION, DATABASE, LANGUAGE_PROFILE_COLLECTION, PHRASE_COLLECTION, PROFILE_COLLECTION } from "../../../config";
import { LangCode, requestLanguage, toCode, toTitle } from "../../../languages/helper";
import { hasFeature } from "../../../languages/registry";
import { DEFAULT_NEW_PHRASES_PER_DAY } from "../../../languages/language-settings";
import { StarterPackItem, audioUrlFor, getStarterPack, translationFor } from "../../../languages/starter-pack";
import { LanguageError, LanguageService } from "../service";
import type { LanguageProfile } from "../types";

/** New starter phrases a day when the language has no `newPhrasesPerDay`. */
export const DEFAULT_STARTER_INTAKE = DEFAULT_NEW_PHRASES_PER_DAY;

/** Most item ids one call takes. */
export const MAX_ITEMS_PER_CALL = 200;

/** How phrases from the pack are marked (`languageSource`). */
export const STARTER_SOURCE = "starter_pack";

const languageProfiles = () => getCollection<any>(DATABASE, LANGUAGE_PROFILE_COLLECTION);
const phrases = () => getCollection<any>(DATABASE, PHRASE_COLLECTION);
const bundles = () => getCollection<any>(DATABASE, BUNDLE_COLLECTION);
const profiles = () => getCollection<any>(DATABASE, PROFILE_COLLECTION);

function isDuplicateKeyError(error: any): boolean {
  return !!error && (error.code === 11000 || error.code === 11001);
}

/** The learner's language for this request, with its pack and language profile. */
async function resolve(userId: string, args: { language?: unknown }) {
  const profile: any = await profiles().findOne({ refId: userId }, { learningLanguage: 1, translationLanguage: 1 }).lean();
  const language = requestLanguage(args, profile);
  const pack = getStarterPack(language);
  if (!pack || !hasFeature(language, "starterPack")) throw new LanguageError("not_available", { language });
  const languageProfile = (await LanguageService.getLanguageProfile(userId, language)) as LanguageProfile | null;
  return { profile, language, pack, languageProfile };
}

function requireActive(languageProfile: LanguageProfile | null, language: LangCode): LanguageProfile {
  if (!languageProfile || languageProfile.status !== "active") throw new LanguageError("not_active", { language });
  return languageProfile;
}

export interface StarterPackView {
  language: LangCode;
  version: number;
  groups: { id: string; name: string }[];
  items: {
    id: string;
    text: string;
    translation: string;
    translationLanguage: LangCode;
    audioUrl?: string;
    band: 1 | 2 | 3;
    group: string;
    note?: string;
    lemma?: string;
    form?: string;
  }[];
  heard: string[];
  state: string;
  total: number;
}

/** `get-starter-pack`. */
export async function getPack(userId: string, args: { language?: unknown }): Promise<StarterPackView> {
  const { profile, language, pack, languageProfile } = await resolve(userId, args);
  const own = toCode(profile?.translationLanguage) ?? null;
  const items = pack.items.map((item) => {
    const { translation, translationLanguage } = translationFor(item, own);
    const audioUrl = audioUrlFor(language, item);
    return {
      id: item.id,
      text: item.text,
      translation,
      translationLanguage,
      ...(audioUrl ? { audioUrl } : {}),
      band: item.band,
      group: item.group,
      ...(item.note ? { note: item.note } : {}),
      ...(item.lemma ? { lemma: item.lemma, form: item.form } : {}),
    };
  });
  const known = new Set(pack.items.map((item) => item.id));
  return {
    language,
    version: pack.version,
    groups: pack.groups,
    items,
    heard: (languageProfile?.starterPack?.heard || []).filter((id) => known.has(id)),
    state: languageProfile?.starterPack?.state ?? "none",
    total: pack.items.length,
  };
}

/** The language's starter bundle, created on first use ("German starter pack"). */
async function starterBundle(userId: string, language: LangCode): Promise<any> {
  const base = `${toTitle(language)} starter pack`;
  const titles = [base, ...[2, 3, 4, 5].map((n) => `${base} (${n})`)];
  const found: any = await bundles()
    .findOne({ refId: userId, language, title: { $in: titles } }, { _id: 1 })
    .sort({ createdAt: 1 })
    .lean();
  if (found) return found._id;
  for (const title of titles) {
    try {
      const [created] = await bundles().insertMany([{ refId: userId, language, title, phrases: [] }]);
      return created._id;
    } catch (error) {
      // Bundle titles are unique per learner: another language may have this one.
      if (!isDuplicateKeyError(error)) throw error;
      const same: any = await bundles().findOne({ refId: userId, title, language }, { _id: 1 }).lean();
      if (same) return same._id;
    }
  }
  throw new Error(`Could not create the starter bundle for ${language}`);
}

/** Starter phrases this language took in today (UTC). */
async function addedToday(userId: string, language: LangCode): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return phrases().countDocuments({ refId: userId, language, languageSource: STARTER_SOURCE, createdAt: { $gte: start } });
}

/** The phrase document for one item. */
function phraseDoc(userId: string, language: LangCode, item: StarterPackItem, own: LangCode | null) {
  const { translation, translationLanguage } = translationFor(item, own);
  const doc: any = {
    refId: userId,
    type: "normal",
    phrase: item.text,
    translation,
    translation_language: translationLanguage,
    language,
    languageSource: STARTER_SOURCE,
  };
  // The pack's cloze target becomes the phrase's chunk, so fill-in-the-gap works (B-18).
  if (item.lemma && item.form) {
    doc.chunks = [{ text: item.form, type: "other", confidence: 1, lemma: item.lemma, form: "", acceptedAnswers: [item.form] }];
  }
  return doc;
}

/** `complete-starter-pack-items`. */
export async function completeItems(
  userId: string,
  args: { language?: unknown; itemIds?: unknown }
): Promise<{ heard: number; total: number; done: boolean; added: string[]; deferred: string[] }> {
  const { profile, language, pack, languageProfile } = await resolve(userId, args);
  const lp = requireActive(languageProfile, language);
  if (!Array.isArray(args.itemIds)) throw new LanguageError("invalid_argument", undefined, "itemIds must be a list");

  const byId = new Map(pack.items.map((item) => [item.id, item]));
  const already = new Set(lp.starterPack?.heard || []);
  const fresh: StarterPackItem[] = [];
  for (const id of args.itemIds.slice(0, MAX_ITEMS_PER_CALL)) {
    const item = typeof id === "string" ? byId.get(id) : undefined;
    if (item && !already.has(item.id) && !fresh.includes(item)) fresh.push(item);
  }

  const cap = Number.isInteger(lp.newPhrasesPerDay) && (lp.newPhrasesPerDay as number) > 0 ? (lp.newPhrasesPerDay as number) : DEFAULT_STARTER_INTAKE;
  const room = Math.max(0, cap - (await addedToday(userId, language)));
  const taking = fresh.slice(0, room);
  const deferred = fresh.slice(room).map((item) => item.id);

  if (taking.length) {
    const own = toCode(profile?.translationLanguage) ?? null;
    const bundleId = await starterBundle(userId, language);
    // A phrase the learner already has in this language is reused, not saved twice.
    const existing: any[] = await phrases()
      .find({ refId: userId, language, phrase: { $in: taking.map((item) => item.text) } }, { _id: 1, phrase: 1 })
      .lean();
    const existingByText = new Map(existing.map((doc) => [doc.phrase, doc._id]));
    const toInsert = taking.filter((item) => !existingByText.has(item.text)).map((item) => phraseDoc(userId, language, item, own));
    const inserted: any[] = toInsert.length ? await phrases().insertMany(toInsert) : [];
    const ids = [...existing.map((doc) => doc._id), ...inserted.map((doc) => doc._id)];
    await bundles().updateOne({ _id: bundleId, refId: userId }, { $addToSet: { phrases: { $each: ids } } });
  }

  const added = taking.map((item) => item.id);
  const total = pack.items.length;
  const update: any = { $set: { "starterPack.total": total } };
  if (added.length) update.$addToSet = { "starterPack.heard": { $each: added } };
  await languageProfiles().updateOne({ userId, language }, update);

  const after = (await LanguageService.getLanguageProfile(userId, language)) as LanguageProfile;
  const heard = (after?.starterPack?.heard || []).filter((id) => byId.has(id)).length;
  const done = heard >= total;
  const state = done ? "done" : heard > 0 ? "in_progress" : after?.starterPack?.state ?? "offered";
  // A skipped pack the learner opens again counts as in progress.
  if (state !== after?.starterPack?.state) await languageProfiles().updateOne({ userId, language }, { $set: { "starterPack.state": state } });

  return { heard, total, done, added, deferred };
}

/** `skip-starter-pack`. */
export async function skip(userId: string, args: { language?: unknown }) {
  const profile: any = await profiles().findOne({ refId: userId }, { learningLanguage: 1 }).lean();
  const language = requestLanguage(args, profile);
  const languageProfile = await LanguageService.getLanguageProfile(userId, language);
  requireActive(languageProfile, language);
  if (languageProfile!.starterPack?.state !== "done") {
    await languageProfiles().updateOne({ userId, language }, { $set: { "starterPack.state": "skipped" } });
  }
  return { state: await LanguageService.getState(userId) };
}

/** Sets the pack's size on a language that has one when it is added (srv-core's hook). */
export async function onAdded(event: { userId: string; language: LangCode; languageProfile: LanguageProfile }) {
  const pack = getStarterPack(event.language);
  if (!pack || !hasFeature(event.language, "starterPack")) return;
  await languageProfiles().updateOne(
    { userId: event.userId, language: event.language },
    { $set: { "starterPack.total": pack.items.length } }
  );
}
