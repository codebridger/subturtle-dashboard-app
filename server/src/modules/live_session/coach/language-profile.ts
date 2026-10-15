/**
 * Reads one learner's `language_profile` for one language (ADR-006 point 2): the start
 * level and the Coach's explanation language. A learner from before multilingual has none,
 * and a failed read must never stop a Coach session, so both give null.
 */
import { LanguageService } from "../../language/service";

export async function readLanguageProfile(userId: string, language: string): Promise<{ startLevel?: string; explanationLanguage?: string } | null> {
  try {
    return ((await LanguageService.getLanguageProfile(userId, language)) as any) ?? null;
  } catch (error: any) {
    console.warn(`[coach] language profile read failed for ${userId}/${language}: ${error?.message || error}`);
    return null;
  }
}
