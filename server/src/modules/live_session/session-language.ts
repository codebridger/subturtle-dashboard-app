/**
 * The two languages a Coach session is about (ADR-006 point 4, work list B-13):
 * - `language`, the learning language: the client's `language`, else the active one;
 * - `explanationLanguage`, the language the Coach explains in: the client's
 *   `explanationLanguage`, else the old `metadata.nativeLanguage` (an English title such as
 *   "Spanish"), else the learner's setting for that language, else their own language.
 * Both are stored on voice and text session records so the history can be listed per
 * language. Old records have neither and read as English (`langOf`).
 */
import { getCollection } from "@modular-rest/server";
import { DATABASE, PROFILE_COLLECTION } from "../../config";
import { LangCode, toCode } from "../../languages/helper";
import { resolveLanguage } from "../../languages/learner";
import { findLanguageProfile } from "../../languages/language-settings";

export interface SessionLanguages {
  language: LangCode;
  explanationLanguage?: LangCode;
}

export async function sessionLanguages(
  userId: string,
  args: { language?: unknown; explanationLanguage?: unknown; metadata?: Record<string, any> | null }
): Promise<SessionLanguages> {
  const language = await resolveLanguage(userId, args.language ?? args.metadata?.language);
  const given =
    toCode(args.explanationLanguage) ?? toCode(args.metadata?.explanationLanguage) ?? toCode(args.metadata?.nativeLanguage);
  if (given) return { language, explanationLanguage: given };

  try {
    const languageProfile = await findLanguageProfile(userId, language);
    const fromSetting = toCode(languageProfile?.explanationLanguage);
    if (fromSetting) return { language, explanationLanguage: fromSetting };
    const profile: any = await (await getCollection(DATABASE, PROFILE_COLLECTION)).findOne({ refId: userId });
    const own = toCode(profile?.translationLanguage);
    return own ? { language, explanationLanguage: own } : { language };
  } catch (error) {
    // The explanation language is a label on the record; never fail a session for it.
    console.warn(`[live-session] explanation language lookup failed for ${userId}:`, error);
    return { language };
  }
}
