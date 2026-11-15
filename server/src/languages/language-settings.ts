/**
 * Per-language Pool settings (ADR-006 point 2). They move from the profile to the learner's
 * `language_profile` for that language. During the move a value missing there falls back to
 * the profile, then to the default, so learners whose data has not moved keep their settings.
 */
import { getCollection } from "@modular-rest/server";
import { DATABASE, LANGUAGE_PROFILE_COLLECTION, PROFILE_COLLECTION } from "../config";
import { LangCode } from "./helper";

// The language module's collection (modules/language/db.ts).
export const LANGUAGE_PROFILE = LANGUAGE_PROFILE_COLLECTION;

export const DEFAULT_POOL_AGE_CUTOFF_DAYS = 7;
export const DEFAULT_POOL_CHUNK_SIZE = 10;
/** New phrases a day taken in when the language profile sets no `newPhrasesPerDay`. */
export const DEFAULT_NEW_PHRASES_PER_DAY = 20;

export interface PoolSettings {
  poolAgeCutoffDays: number;
  poolChunkSize: number;
}

/** The learner's `language_profile` document for one language, or null. */
export async function findLanguageProfile(userId: string, language: LangCode): Promise<any | null> {
  let col: any;
  try {
    col = await getCollection(DATABASE, LANGUAGE_PROFILE);
  } catch {
    return null; // the language module is not loaded (tests, or a server without it)
  }
  if (!col || typeof col.findOne !== "function") return null;
  return ((await col.findOne({ userId, language })) as any) || null;
}

export function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The Pool settings of one language: language profile, then profile, then defaults. */
export async function poolSettings(userId: string, language: LangCode, profile?: any): Promise<PoolSettings> {
  const languageProfile = await findLanguageProfile(userId, language);
  const userProfile = profile !== undefined ? profile : await (await getCollection(DATABASE, PROFILE_COLLECTION)).findOne({ refId: userId });
  return {
    poolAgeCutoffDays:
      positive(languageProfile?.poolAgeCutoffDays) ?? positive((userProfile as any)?.poolAgeCutoffDays) ?? DEFAULT_POOL_AGE_CUTOFF_DAYS,
    poolChunkSize: positive(languageProfile?.poolChunkSize) ?? positive((userProfile as any)?.poolChunkSize) ?? DEFAULT_POOL_CHUNK_SIZE,
  };
}
