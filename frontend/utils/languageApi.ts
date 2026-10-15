import { authentication, functionProvider } from '@modular-rest/client';
import type {
    AddLanguageArgs,
    LangCode,
    LanguageCapabilities,
    LanguageSettingsArgs,
    LanguageState,
    LevelTestAnswer,
    LevelTestStart,
    ReviewResult,
    StarterPack,
} from '~/types/language.type';

/**
 * The thin client of the `language` module (multilingual-api.md, section 2) plus the new
 * review and Coach functions of section 3.
 *
 * Every call goes through `call()`, which turns a failure into a `LanguageApiError` with a
 * stable `code`. The server functions land on `dev` over several deploys, so `missing` (the
 * function is not there yet) is an expected answer, not a crash: callers fall back to
 * today's English-only behaviour.
 */

export type LanguageApiErrorCode = 'upgrade_needed' | 'not_available' | 'purging' | 'missing' | 'unknown';

/** The contract's named errors, as the server writes them into the error message. */
const NAMED_ERRORS: LanguageApiErrorCode[] = ['upgrade_needed', 'not_available', 'purging'];

export class LanguageApiError extends Error {
    constructor(
        public code: LanguageApiErrorCode,
        message: string,
        /** Extra fields the server sent with the error, e.g. `{ plan, maxLanguages }`. */
        public details: Record<string, any> = {}
    ) {
        super(message);
        this.name = 'LanguageApiError';
    }
}

/** The error text from any of the shapes modular-rest and axios produce. */
function errorText(error: any): string {
    const candidates = [error?.error, error?.message, error?.response?.data?.error, error?.response?.data?.message, error];
    for (const value of candidates) {
        if (typeof value === 'string' && value) return value;
        if (value && typeof value === 'object' && typeof value.message === 'string') return value.message;
    }
    return '';
}

/** Extra fields sent beside the error (the server may put them on the body or in JSON text). */
function errorDetails(error: any, text: string): Record<string, any> {
    const body = error?.response?.data ?? error;
    const details: Record<string, any> = {};
    for (const key of ['plan', 'maxLanguages', 'details', 'data']) {
        if (body && typeof body === 'object' && body[key] !== undefined) {
            if ((key === 'details' || key === 'data') && typeof body[key] === 'object') Object.assign(details, body[key]);
            else details[key] = body[key];
        }
    }
    const json = /\{.*\}/s.exec(text)?.[0];
    if (json) {
        try {
            Object.assign(details, JSON.parse(json));
        } catch {
            // Not JSON — the message is plain text.
        }
    }
    return details;
}

export function toLanguageApiError(error: any): LanguageApiError {
    if (error instanceof LanguageApiError) return error;
    const text = errorText(error);
    const lower = text.toLowerCase();
    const named = NAMED_ERRORS.find((code) => lower.includes(code));
    if (named) return new LanguageApiError(named, text, errorDetails(error, text));

    // modular-rest answers an unknown function name with "function not found" (and a 404 from
    // older routers); either way the server has not shipped this function yet.
    const status = error?.response?.status ?? error?.status;
    if (status === 404 || /function with name \S+ not found|unknown function/.test(lower)) {
        return new LanguageApiError('missing', text || 'function not found');
    }
    return new LanguageApiError('unknown', text || 'request failed', errorDetails(error, text));
}

async function call<T>(name: string, args: Record<string, any> = {}): Promise<T> {
    // modular-rest never hands a function its caller, so every user function reads `userId`
    // from its args; the server's functionCallerGuard pins it to the token.
    const userId = authentication.user?.id;
    try {
        return (await functionProvider.run<T>({ name, args: userId ? { userId, ...args } : args })) as T;
    } catch (error) {
        throw toLanguageApiError(error);
    }
}

/** Is this a real capabilities answer? An old server or a test stub may answer `{}`. */
export function isCapabilities(value: any): value is LanguageCapabilities {
    return !!value && Array.isArray(value.learning) && value.learning.length > 0 && Array.isArray(value.own);
}

/** Is this a real language state? */
export function isLanguageState(value: any): value is LanguageState {
    return !!value && Array.isArray(value.languages) && typeof value.maxLanguages === 'number';
}

/** Some functions answer `{ state }`, some the state itself; accept both. */
function unwrapState(value: any): LanguageState {
    return isLanguageState(value?.state) ? value.state : value;
}

export const languageApi = {
    getCapabilities: () => call<LanguageCapabilities>('get-language-capabilities'),
    getState: () => call<LanguageState>('get-language-state'),

    addLanguage: (args: AddLanguageArgs) => call<{ state: LanguageState }>('add-language', args).then(unwrapState),
    setActiveLanguage: (language: LangCode) => call<{ state: LanguageState }>('set-active-language', { language }).then(unwrapState),
    removeLanguage: (language: LangCode) =>
        call<{ state: LanguageState; purgeAt?: string }>('remove-language', { language }).then((res) => ({ state: unwrapState(res), purgeAt: res?.purgeAt })),
    pauseLanguages: (keep: LangCode[]) => call<{ state: LanguageState }>('pause-languages', { keep }).then(unwrapState),
    updateLanguageSettings: (args: LanguageSettingsArgs) => call<{ state: LanguageState }>('update-language-settings', args).then(unwrapState),
    setTranslationLanguage: (language: LangCode) => call<{ state: LanguageState }>('set-translation-language', { language }).then(unwrapState),
    setLanguageInterest: (language: LangCode, on: boolean) => call<{ on: boolean }>('set-language-interest', { language, on }),

    startLevelTest: (language: LangCode) => call<LevelTestStart>('start-level-test', { language }),
    answerLevelTest: (testId: string, text: string) => call<LevelTestAnswer>('answer-level-test', { testId, text }),
    finishLevelTest: (testId: string, accept: boolean) => call<{ state: LanguageState }>('finish-level-test', { testId, accept }).then(unwrapState),

    getStarterPack: (language: LangCode) => call<StarterPack>('get-starter-pack', { language }),
    completeStarterPackItems: (language: LangCode, itemIds: string[]) =>
        call<{ heard: number; total: number; done: boolean }>('complete-starter-pack-items', { language, itemIds }),
    skipStarterPack: (language: LangCode) => call<{ state: LanguageState }>('skip-starter-pack', { language }).then(unwrapState),

    checkClozeAnswer: (args: { phraseId: string; answer: string; language?: LangCode }) =>
        call<{ result: ReviewResult; expected: string }>('check-cloze-answer', args),
    getCoachInstructions: (args: { language: LangCode; explanationLanguage: LangCode; phraseIds: string[]; mode: 'voice' | 'text' }) =>
        call<{ instructions: string; voiceName: string }>('get-coach-instructions', args),
    flagCoachExplanation: (args: { sessionId: string; turnIndex: number; on: boolean }) => call<unknown>('flag-coach-explanation', args),
};
