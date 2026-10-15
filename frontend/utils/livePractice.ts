/**
 * Shared live-practice setup logic used by BOTH the voice and text practice
 * pages. Keeping the system instruction, tool definitions, and native-language
 * resolution here means the two transports can never silently drift apart — the
 * only thing that differs between them is the input UI and the underlying store.
 */
import type { PhraseType } from '~/types/database.type';
import type { LiveSessionRequest } from '~/types/live-session-request';
import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
import liveCoachSpec from '../../shared/live-practice/spec.json';

/**
 * Serialize a LiveSessionRequest to/from the base64 `?session=` payload. btoa()
 * only handles Latin-1, but a bundle title can be non-ASCII (Persian / Arabic /
 * CJK in a language-learning app) and would throw InvalidCharacterError, so we
 * UTF-8 encode the bytes first. encode/decode MUST stay mirror images; shared so
 * the bundle page, the Start-New page, and the dispatcher store never drift.
 */
export function encodeSessionRequest(request: LiveSessionRequest): string {
    const bytes = new TextEncoder().encode(JSON.stringify(request));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function decodeSessionRequest(raw: string): LiveSessionRequest {
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as LiveSessionRequest;
}

/**
 * The i18n key for the button that leaves a finished session (the recap, the
 * connection-lost state), named after where `returnTo` actually goes: the
 * extension's "Practice now" returns to /board, Start New to /sessions/new.
 */
export function returnToLabelKey(returnTo: string): string {
    // Compare the path only: a query (e.g. /sessions/new?bundle=…) does not change the destination.
    const path = (returnTo || '').split(/[?#]/)[0].replace(/\/+$/, '');
    if (/^\/bundles\/[^/]+$/.test(path)) return 'live-practice.recap.back-to-bundle';
    if (path === '/board') return 'live-practice.recap.back-to-board';
    if (path === '/sessions/new') return 'live-practice.recap.back-to-sessions';
    return 'live-practice.recap.done';
}

/**
 * The coach's prompt, tools, hidden messages and practice rules live in
 * `shared/live-practice/spec.json`, shared with the mobile app so the two never
 * drift. Change them there; the mobile app regenerates its copy from the file
 * (see `tests/unit/utils/liveCoachSpec.test.ts`).
 */
export const LIVE_PRACTICE = liveCoachSpec;

/**
 * The AI tutor system prompt. `[nativeLanguage]` and `[phrases]` are filled in
 * by `buildInstructions`. Transport-agnostic on purpose — never mention the
 * microphone or typing here; that belongs in the per-page opening nudge.
 */
export const INSTRUCTIONS_TEMPLATE = liveCoachSpec.instructionsTemplate;

/** Fills `{name}` placeholders of a spec string. */
export function fillSpec(text: string, values: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all));
}

/** Fill the template with the numbered phrase list and the resolved language. */
export function buildInstructions(selectedPhrases: PhraseType[], nativeLanguage: string): string {
    const phrases = selectedPhrases
        .map((p, i) => fillSpec(liveCoachSpec.phraseLine, { index: i + 1, phrase: p.phrase, translation: p.translation }))
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
        return fillSpec(liveCoachSpec.nativeLanguage.autoDetected, { language: [...langs][0] });
    }

    return liveCoachSpec.nativeLanguage.fallback;
}

/** The hidden first message that makes the coach say hello. */
export function welcomeMessage(mode: 'voice' | 'text', microphoneMuted = true): string {
    const m = liveCoachSpec.messages;
    const second = mode === 'voice' ? fillSpec(m.welcomeVoiceMic, { muted: microphoneMuted ? 'muted' : 'unmuted' }) : m.welcomeText;
    return `${m.welcome}\n${second}`;
}

/** The hidden message sent when the learner taps a phrase card. */
export function cardSelectedMessage(phrase: string): string {
    return fillSpec(liveCoachSpec.messages.cardSelected, { phrase });
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
    const definition = (name: string) => {
        const tool = liveCoachSpec.tools.find((t) => t.name === name)!;
        // A tool without parameters omits the key: Gemini rejects an OBJECT with empty `properties` (400).
        return { type: 'function', ...tool };
    };
    return {
        finish_practice: {
            handler: () => {
                cb.onFinish();
                return { success: true };
            },
            definition: definition('finish_practice'),
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
                        message: fillSpec(liveCoachSpec.messages.activateNotFound, { args: JSON.stringify(args) }),
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
            definition: definition('activate_phrase'),
        },
    };
}

/**
 * Resolve a live-session form selection (a contiguous range or a random sample)
 * into a concrete, ordered list of phrase ids, given the bundle's phrase ids in
 * display order. Resolving at the entry point keeps the session pages simple
 * (they just fetch ids) and makes a random pick stable across a refresh. Shared
 * by the bundle detail page and the standalone "Start New Session" page so the
 * two never drift.
 */
export function pickPhraseIds(orderedPhraseIds: string[], sel: LivePracticeSessionSetupType): string[] {
    const all = orderedPhraseIds ?? [];
    const picked: string[] = [];

    if (sel.selectionMode === 'random') {
        const total = sel.totalPhrases ?? 1;
        while (picked.length < total && picked.length < all.length) {
            const candidate = all[Math.floor(Math.random() * all.length)];
            if (candidate && !picked.includes(candidate)) picked.push(candidate);
        }
    } else {
        const from = sel.fromPhrase ?? 1;
        const to = sel.toPhrase ?? 2;
        for (let i = from - 1; i <= to - 1; i++) {
            const candidate = all[i];
            if (candidate && !picked.includes(candidate)) picked.push(candidate);
        }
    }

    return picked;
}
