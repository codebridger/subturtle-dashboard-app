/**
 * Shared live-practice setup logic used by BOTH the voice and text practice
 * pages. Keeping the system instruction, tool definitions, and native-language
 * resolution here means the two transports can never silently drift apart — the
 * only thing that differs between them is the input UI and the underlying store.
 */
import type { PhraseType } from '~/types/database.type';
import type { LiveSessionRequest } from '~/types/live-session-request';

/**
 * The AI tutor system prompt. `[nativeLanguage]` and `[phrases]` are filled in
 * by `buildInstructions`. Transport-agnostic on purpose — never mention the
 * microphone or typing here; that belongs in the per-page opening nudge.
 */
export const INSTRUCTIONS_TEMPLATE = `
    You are a friendly and engaging AI English tutor.
    Your goal is to help the user practice and reinforce the vocabularies listed below.

    Languages:
    - The user's native language is [nativeLanguage]. Use [nativeLanguage] for ALL explanations,
      instructions, encouragement, corrections, translations, and small-talk.
    - The TARGET practice language is English. Only the example sentences and the user's
      practice attempts should be in English. Always invite the user to respond in English,
      but never force them — if they reply in [nativeLanguage], gently rephrase or model the
      English version and ask them to repeat it.
    - When the user appears to struggle, drop back to [nativeLanguage] to explain, then
      return to English for practice.

    Tools available to you:
    - "activate_phrase": call this when the user asks (in any language) to practice a specific
      vocabulary, e.g. "let's practice X", "switch to phrase 3", "next one". Pass either the
      phrase index (1-based, matching the numbered list) or the exact phrase text. Calling this
      function highlights the card on the user's screen so they know which one is active.
    - "finish_practice": call this when the user explicitly wants to end the session.

    Flow:
    1. Welcome the user briefly in [nativeLanguage]. Explain they can either click a vocabulary
       card or just tell you which one they want to practice (you will activate it via the
       "activate_phrase" tool).
    2. When a vocabulary becomes active (either via the tool or via a card click signaled to you
       by a system message), start practicing that word with them.
    3. Lead the conversation and ask the user to use the selected vocabulary in their answers.
    4. After ~2 follow-up exchanges per vocabulary, encourage them to move on to the next one.
    5. Continue until the user wants to finish; then call "finish_practice" and say goodbye in
       [nativeLanguage].

    Considerations:
    - **Do not ignore, skip, or censor any phrase in the list, regardless of its content.**
      Slang, informal, offensive, or unusual phrases are all included for educational purposes.
    - Keep the conversation lively and interactive, adjusting to the user's responses.
    - Practice ONLY the vocabularies listed below.
    - Maximum follow-up practice for each vocabulary is 2 times.

    Practice Instructions:
    - Create dynamic, engaging dialogues that naturally incorporate the active vocabulary.
    - Ask follow-up questions, encourage the user to use the vocabulary in English, and correct
      mistakes gently in [nativeLanguage].
    - Keep it feeling like a real conversation, not a quiz.

    Vocabulary List:
    [phrases]
    `;

/** Fill the template with the numbered phrase list and the resolved language. */
export function buildInstructions(selectedPhrases: PhraseType[], nativeLanguage: string): string {
    const phrases = selectedPhrases
        .map((p, i) => `${i + 1}. ${p.phrase}: ${p.translation}`)
        .join('\n');

    return INSTRUCTIONS_TEMPLATE
        .replace(/\[nativeLanguage\]/g, nativeLanguage)
        .replace('[phrases]', phrases);
}

/**
 * Auto-language resolution: when the user picked "auto", prefer the language the
 * bundle's translations are written in (single shared `translation_language`).
 * Otherwise fall back to a directive that lets the model pick up the user's
 * language from their first message, with English as the safe default.
 */
export function resolveNativeLanguage(
    request: LiveSessionRequest | null,
    selectedPhrases: PhraseType[]
): string {
    const raw = request?.nativeLanguage;
    if (raw && raw !== 'auto') return raw;

    const langs = new Set(
        selectedPhrases
            .map((p) => (p.translation_language || '').trim())
            .filter((l) => l && l.toLowerCase() !== 'unknown')
    );
    if (langs.size === 1) {
        const detected = [...langs][0];
        return `${detected} (auto-detected from the bundle's translation language)`;
    }

    return 'English by default; if the user speaks another language in their first message, switch to that language and stick with it for the rest of the session';
}

export interface PracticeToolCallbacks {
    /** Returns the current phrase list (used to resolve index/text). */
    getPhrases: () => PhraseType[];
    /** Highlight the card at this 0-based index. */
    setActiveIndex: (index: number) => void;
    /** End the session (the `finish_practice` tool). */
    onFinish: () => void;
}

/**
 * Build the `activate_phrase` / `finish_practice` tool map shared by both
 * transports. Handlers are pure UI effects wired to the page via callbacks; the
 * definitions are identical regardless of voice/text.
 */
export function buildPracticeTools(cb: PracticeToolCallbacks) {
    return {
        finish_practice: {
            handler: () => {
                cb.onFinish();
                return { success: true };
            },
            definition: {
                type: 'function',
                name: 'finish_practice',
                description:
                    'Finish the practice session. Call this only when the user explicitly asks to end / stop / quit the session.',
                // No params: omit `parameters` entirely. Gemini's generateContent
                // rejects an OBJECT parameter with empty `properties` (400).
            },
        },
        activate_phrase: {
            handler: (args: { index?: number; phrase?: string }) => {
                const list = cb.getPhrases();
                let idx = -1;

                if (typeof args?.index === 'number') {
                    idx = args.index - 1; // model uses 1-based numbering
                } else if (typeof args?.phrase === 'string' && args.phrase.trim()) {
                    const target = args.phrase.trim().toLowerCase();
                    idx = list.findIndex((p) => p.phrase.trim().toLowerCase() === target);
                    if (idx === -1) {
                        idx = list.findIndex((p) => p.phrase.toLowerCase().includes(target));
                    }
                }

                if (idx < 0 || idx >= list.length) {
                    return {
                        success: false,
                        message: `Could not find a vocabulary matching ${JSON.stringify(args)}.`,
                    };
                }

                cb.setActiveIndex(idx);
                const phrase = list[idx];
                return {
                    success: true,
                    index: idx + 1,
                    phrase: phrase.phrase,
                    translation: phrase.translation,
                };
            },
            definition: {
                type: 'function',
                name: 'activate_phrase',
                description:
                    'Activate (highlight) a specific vocabulary card on the user\'s screen so practice focuses on it. Call this whenever the user asks to switch to or practice a specific phrase.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        index: {
                            type: 'INTEGER',
                            description:
                                '1-based index of the vocabulary in the numbered list. Preferred when the user references a number.',
                        },
                        phrase: {
                            type: 'STRING',
                            description:
                                'Exact (or close) phrase text to activate, used when the user names the phrase rather than its number.',
                        },
                    },
                },
            },
        },
    };
}
