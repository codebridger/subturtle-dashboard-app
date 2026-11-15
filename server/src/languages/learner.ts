/**
 * Which languages one learner studies, read from the profile copy (ADR-006 point 1), and the
 * language a request is about. The per-language services (Leitner, Pool, board, sessions,
 * statistics) use this so that:
 * - a request with no `language` works on the learner's active language (old clients);
 * - the review reminder and the Pool age-out skip paused and removed languages (ADR-006
 *   point 7).
 *
 * A profile from before multilingual has none of the language fields: it studies English
 * only, which is what every stored document without a `language` is.
 */
import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, PHRASE_COLLECTION, PROFILE_COLLECTION } from "../config";
import { DEFAULT_LANGUAGE, LangCode, langOf, requestLanguage, toCode } from "./helper";

export interface LearnerLanguages {
  /** The active language: the one a request without `language` is about. */
  active: LangCode;
  /** Languages the learner studies now (active status). Paused and removed ones are not here. */
  studying: LangCode[];
  /** Languages kept after a downgrade: data kept, no reviews, no board. */
  paused: LangCode[];
}

interface ProfileLanguageFields {
  learningLanguage?: unknown;
  learningLanguages?: unknown;
  pausedLanguages?: unknown;
}

function codes(value: unknown): LangCode[] {
  if (!Array.isArray(value)) return [];
  const out: LangCode[] = [];
  for (const item of value) {
    const code = toCode(item);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** The learner's languages from a profile document (or null for a missing profile). */
export function learnerLanguagesFrom(profile: ProfileLanguageFields | null | undefined): LearnerLanguages {
  const active = requestLanguage(undefined, profile);
  const paused = codes(profile?.pausedLanguages);
  const listed = codes(profile?.learningLanguages);
  // No list yet (an account from before multilingual, or one the backfill has not reached):
  // the learner studies the active language only.
  const studying = (listed.length > 0 ? listed : [active]).filter((code) => !paused.includes(code));
  return { active, studying, paused };
}

async function loadProfile(userId: string): Promise<ProfileLanguageFields | null> {
  const col: any = await getCollection(DATABASE, PROFILE_COLLECTION);
  return ((await col.findOne({ refId: userId })) as any) || null;
}

/** The learner's languages, read from their profile. */
export async function getLearnerLanguages(userId: string): Promise<LearnerLanguages> {
  return learnerLanguagesFrom(await loadProfile(userId));
}

/**
 * The language a request is about: the `language` the client sent when it names a language,
 * otherwise the learner's active language, otherwise English. Reads the profile only when
 * the client sent no usable language.
 */
export async function resolveLanguage(userId: string, language?: unknown): Promise<LangCode> {
  const given = toCode(language);
  if (given) return given;
  if (!userId) return DEFAULT_LANGUAGE;
  return requestLanguage(undefined, await loadProfile(userId));
}

/** True when the learner studies the language now (not paused, not removed). */
export function isStudying(languages: LearnerLanguages, language: LangCode): boolean {
  return languages.studying.includes(language);
}

/**
 * The stored language of each of the learner's phrases, by phrase id (`langOf`: missing is
 * English). Phrases that do not exist, or belong to someone else, are not in the map.
 */
export async function phraseLanguages(userId: string, phraseIds: unknown[]): Promise<Map<string, LangCode>> {
  const ids = [...new Set(phraseIds.map((id) => String(id)))].filter((id) => Types.ObjectId.isValid(id));
  const out = new Map<string, LangCode>();
  if (ids.length === 0) return out;
  const col: any = await getCollection(DATABASE, PHRASE_COLLECTION);
  const phrases = ((await col.find({ _id: { $in: ids }, refId: userId }, { _id: 1, language: 1 })) as any[]) || [];
  for (const phrase of phrases) out.set(String(phrase._id), langOf(phrase));
  return out;
}

/**
 * The language of a phrase-scoped request (review a card, add or move one phrase): the
 * `language` the client sent, otherwise the phrase's own language, otherwise the active one.
 * A card always lives in its phrase's language, so an old client that sends no `language`
 * cannot file a German card under English.
 */
export async function resolvePhraseLanguage(userId: string, phraseId: unknown, language?: unknown): Promise<LangCode> {
  const given = toCode(language);
  if (given) return given;
  const stored = (await phraseLanguages(userId, [phraseId])).get(String(phraseId));
  return stored ?? resolveLanguage(userId);
}
