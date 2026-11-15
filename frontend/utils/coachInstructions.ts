import type { PhraseType } from '~/types/database.type';
import type { LiveSessionRequest } from '~/types/live-session-request';
import { buildInstructions, resolveNativeLanguage } from '~/utils/livePractice';
import { languageApi } from '~/utils/languageApi';

/**
 * The Coach prompt for a session (D-16, Q3). A multilingual request (it carries `language` and
 * `explanationLanguage`) asks the server, which builds the prompt for that learning language
 * with the own language filled in (B-19). Anything else — today's requests, the extension's
 * deep links, a server without `get-coach-instructions` — uses the client template as before.
 */
export async function resolveCoachInstructions(
    request: LiveSessionRequest | null,
    phrases: PhraseType[],
    mode: 'voice' | 'text'
): Promise<{ instructions: string; voiceName?: string }> {
    if (request?.language && request.explanationLanguage) {
        try {
            const res = await languageApi.getCoachInstructions({
                language: request.language,
                explanationLanguage: request.explanationLanguage,
                phraseIds: phrases.map((p) => p._id),
                mode,
            });
            if (res?.instructions) return { instructions: res.instructions, voiceName: res.voiceName || undefined };
        } catch (error) {
            console.warn('Coach prompt from the server failed; using the client prompt:', error);
        }
    }
    return { instructions: buildInstructions(phrases, resolveNativeLanguage(request, phrases)) };
}
