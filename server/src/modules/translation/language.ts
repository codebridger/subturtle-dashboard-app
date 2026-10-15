/**
 * Language plumbing for the translation and save-assistant requests (work list B-14, B-17).
 *
 * - `readTranslationLanguage`: the learner's own language from a request. The new name is
 *   `translationLanguage`; old extension and mobile builds still send `targetLanguage`.
 *   Every request that uses the old name is counted (`legacy_usage`), so the old name can
 *   be removed after 30 days with none.
 * - `loadLearnerLanguages`: the learner's active language and the languages in the profile,
 *   from the profile copy (a fast read; `language_profile` is the source of truth and
 *   `get-language-state` repairs the copy).
 * - `resolveLanguage`: which learning language a translated phrase belongs to. Detected
 *   language if the learner has it, then the active language, then "unknown".
 */
import { getCollection } from "@modular-rest/server";
import { DATABASE, DATABASE_SCHEDULE, LEGACY_USAGE_COLLECTION, PROFILE_COLLECTION } from "../../config";
import { DEFAULT_LANGUAGE, LangCode, UNKNOWN, isAutoOrUnknown, toCode } from "../../languages/helper";

export interface TranslationLanguageRead {
  /** The ISO code when the value names a language we know. */
  code?: LangCode;
  /**
   * The value to put in a prompt: the code when known, otherwise the raw text the client
   * sent (a language we have no code for still translates, as before).
   */
  value: string;
  /** True when the request used the old `targetLanguage` name. */
  usedOldName: boolean;
}

/**
 * The own language of a request: `translationLanguage`, or the old `targetLanguage`.
 * When both are sent, the new name wins. Counts old-name requests for `surface`.
 */
export function readTranslationLanguage(
  params: { translationLanguage?: unknown; targetLanguage?: unknown } | null | undefined,
  surface: string
): TranslationLanguageRead {
  const fresh = typeof params?.translationLanguage === "string" ? params.translationLanguage.trim() : "";
  const old = typeof params?.targetLanguage === "string" ? params.targetLanguage.trim() : "";
  const usedOldName = !fresh && !!old;
  if (usedOldName) countLegacyField("targetLanguage", surface);
  const raw = fresh || old;
  const code = toCode(raw);
  return { code, value: code ?? raw, usedOldName };
}

/** The UTC day, `YYYY-MM-DD`, a legacy counter row is kept for. */
export function usageDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Add one to the daily counter for an old field name. Fire and forget: a failed count
 * never fails the request it counts.
 */
export function countLegacyField(field: string, surface: string): void {
  try {
    const now = new Date();
    const collection = getCollection(DATABASE_SCHEDULE, LEGACY_USAGE_COLLECTION);
    Promise.resolve(
      collection.updateOne(
        { field, surface, day: usageDay(now) } as any,
        { $inc: { count: 1 }, $set: { lastSeenAt: now }, $setOnInsert: { firstSeenAt: now } } as any,
        { upsert: true }
      )
    ).catch((error: any) => console.warn(`[legacy-usage] count failed for ${field}/${surface}: ${error?.message || error}`));
  } catch (error: any) {
    console.warn(`[legacy-usage] count failed for ${field}/${surface}: ${error?.message || error}`);
  }
}

export interface LearnerLanguages {
  /** The active learning language; null for an anonymous caller or a profile not found. */
  active: LangCode | null;
  /** The learning languages the learner has (active and paused). */
  languages: LangCode[];
  /** The learner's own language from the profile, when set. */
  translationLanguage: LangCode | null;
}

const NO_LEARNER: LearnerLanguages = { active: null, languages: [], translationLanguage: null };

/**
 * The learner's languages from the profile copy. A profile from before multilingual has no
 * language fields: it studies English. An anonymous caller has none.
 */
export async function loadLearnerLanguages(userId: unknown): Promise<LearnerLanguages> {
  if (typeof userId !== "string" || !userId) return NO_LEARNER;
  let profile: any = null;
  try {
    profile = await getCollection(DATABASE, PROFILE_COLLECTION)
      .findOne({ refId: userId } as any, {
        learningLanguage: 1,
        learningLanguages: 1,
        pausedLanguages: 1,
        translationLanguage: 1,
      })
      .lean();
  } catch (error: any) {
    console.warn(`[translation] profile read failed for ${userId}: ${error?.message || error}`);
    return NO_LEARNER;
  }
  if (!profile) return NO_LEARNER;
  return learnerLanguagesOf(profile);
}

/** The languages of a profile document (exported for tests). */
export function learnerLanguagesOf(profile: any): LearnerLanguages {
  const list = [...(profile?.learningLanguages || []), ...(profile?.pausedLanguages || [])]
    .map((value: unknown) => toCode(value))
    .filter((code: LangCode | undefined): code is LangCode => Boolean(code));
  const active = toCode(profile?.learningLanguage) ?? null;
  const multilingual = active !== null || list.length > 0 || profile?.onboardingState !== undefined;
  // A profile from before multilingual studies English (languages/helper.ts).
  const languages = multilingual ? list : [DEFAULT_LANGUAGE];
  const resolvedActive = active ?? (multilingual ? languages[0] ?? null : DEFAULT_LANGUAGE);
  if (resolvedActive && !languages.includes(resolvedActive)) languages.unshift(resolvedActive);
  return {
    active: resolvedActive,
    languages: [...new Set(languages)],
    translationLanguage: toCode(profile?.translationLanguage) ?? null,
  };
}

export interface LanguageResolution {
  /** The language the model (or the client) says the text is in; "unknown" when unsure. */
  detectedLanguage: LangCode;
  /** The learning language the phrase belongs to; "unknown" when there is none. */
  resolvedLanguage: LangCode;
  /** True when the detected language is one the learner has. */
  inProfile: boolean;
}

/**
 * B-14 resolution: the detected language if the learner has it, then the active language,
 * then "unknown".
 */
export function resolveLanguage(detected: unknown, learner: LearnerLanguages): LanguageResolution {
  const detectedCode = isAutoOrUnknown(detected) ? undefined : toCode(detected);
  const inProfile = !!detectedCode && learner.languages.includes(detectedCode);
  return {
    detectedLanguage: detectedCode ?? UNKNOWN,
    resolvedLanguage: inProfile ? (detectedCode as LangCode) : learner.active ?? UNKNOWN,
    inProfile,
  };
}
