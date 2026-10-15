/**
 * Reads one learner's `language_profile` for one language (ADR-006 point 2): the start
 * level and the Coach's explanation language. A learner from before multilingual has none,
 * and a failed read must never stop a Coach session, so both give null.
 */
import { getCollection } from "@modular-rest/server";
import { DATABASE } from "../../../config";

// The collection srv-core defines in modules/language/db.ts (LANGUAGE_PROFILE_COLLECTION).
const LANGUAGE_PROFILE = "language_profile";

export async function readLanguageProfile(userId: string, language: string): Promise<{ startLevel?: string; explanationLanguage?: string } | null> {
  try {
    const collection = getCollection(DATABASE, LANGUAGE_PROFILE);
    if (!collection) return null;
    return ((await collection.findOne({ userId, language } as any, { startLevel: 1, explanationLanguage: 1, status: 1 }).lean()) as any) ?? null;
  } catch (error: any) {
    console.warn(`[coach] language profile read failed for ${userId}/${language}: ${error?.message || error}`);
    return null;
  }
}
