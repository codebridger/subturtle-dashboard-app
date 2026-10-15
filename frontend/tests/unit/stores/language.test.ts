import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('vue', async () => await vi.importActual('vue'));
const run = vi.hoisted(() => vi.fn());
vi.mock('@modular-rest/client', () => ({ functionProvider: { run }, authentication: { user: { id: 'u1' } } }));
vi.mock('~/plugins/mixpanel', () => ({ analytic: { track: vi.fn() }, registerLanguageAnalytics: vi.fn() }));

const vue = await vi.importActual<typeof import('vue')>('vue');
Object.assign(globalThis, { ref: vue.ref, computed: vue.computed, authUser: { value: { id: 'u1' } } });

const { useLanguageStore, onLanguageSwitch } = await import('~/stores/language');
const { withLanguage } = await import('~/utils/languageScope');
const { LanguageApiError, toLanguageApiError } = await import('~/utils/languageApi');

const FEATURES = { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: true, map: false };

const CAPS = {
    learning: [
        { code: 'en', name: 'English', nativeName: 'English', rtl: false, ttsVoice: 'en', enabled: true, features: { ...FEATURES, starterPack: false } },
        { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false, ttsVoice: 'de', enabled: true, features: FEATURES },
        { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false, ttsVoice: 'pt', enabled: false, features: FEATURES },
    ],
    own: [{ code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true, explanationReviewed: 'teacher' }],
};

const summary = (code: string, extra = {}) => ({
    code,
    status: 'active',
    startLevel: 'A1',
    startLevelSource: 'default',
    dueCount: 0,
    phraseCount: 0,
    explanationLanguage: 'fa',
    starterPack: { state: 'none', heard: 0, total: 0 },
    ...extra,
});

const STATE = {
    translationLanguage: 'fa',
    learningLanguage: 'en',
    languages: [summary('en')],
    onboardingState: 'done',
    plan: 'reader',
    maxLanguages: 3,
    pending: [],
};

function answer(map: Record<string, any>) {
    run.mockImplementation(async ({ name, args }: any) => {
        const value = map[name];
        if (value instanceof Error || (value && value.reject)) throw value.reject ?? value;
        return typeof value === 'function' ? value(args) : value;
    });
}

const missing = { reject: { status: 'error', message: 'Function with name get-language-state not found' } };

describe('language store (D-01)', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        run.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('stays off, English-only, while the server has no language state', async () => {
        answer({ 'get-language-capabilities': CAPS, 'get-language-state': missing });
        const store = useLanguageStore();
        await store.bootstrap();

        expect(store.enabled).toBe(false);
        expect(store.activeLanguage).toBe('en');
        expect(store.features().review).toBe(true);
        // Nothing is added to today's requests.
        expect(withLanguage({ userId: 'u1' })).toEqual({ userId: 'u1' });
    });

    it('stays off when an old server or a stub answers {}', async () => {
        answer({ 'get-language-capabilities': {}, 'get-language-state': {} });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.enabled).toBe(false);
    });

    it('turns on when both calls answer, and scopes requests to the active language', async () => {
        answer({ 'get-language-capabilities': CAPS, 'get-language-state': STATE });
        const store = useLanguageStore();
        await store.bootstrap();

        expect(store.enabled).toBe(true);
        expect(store.ownLanguage).toBe('fa');
        expect(store.addable.map((c) => c.code)).toEqual(['de']);
        expect(store.comingLater.map((c) => c.code)).toEqual(['pt']);
        expect(store.canAdd).toBe(true);
        expect(withLanguage({ userId: 'u1' })).toEqual({ userId: 'u1', language: 'en' });
        // A caller's own language wins.
        expect(withLanguage({ language: 'de' })).toEqual({ language: 'de' });
        // Every language call carries the caller (modular-rest does not pass it).
        expect(run).toHaveBeenCalledWith({ name: 'get-language-state', args: { userId: 'u1' } });
    });

    it('switches language, then reloads every language-scoped store', async () => {
        const reset = vi.fn();
        onLanguageSwitch(reset);
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, languages: [summary('en'), summary('de')] },
            'set-active-language': ({ language }: any) => ({ state: { ...STATE, learningLanguage: language, languages: [summary('en'), summary('de')] } }),
        });
        const store = useLanguageStore();
        await store.bootstrap();
        await store.switchLanguage('de');

        expect(store.activeLanguage).toBe('de');
        expect(reset).toHaveBeenCalledTimes(1);
        expect(withLanguage({})).toEqual({ language: 'de' });
    });

    it('reports the plan limit as upgrade_needed with its details', async () => {
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, plan: 'starter', maxLanguages: 1 },
            'add-language': { reject: { status: 'error', message: 'upgrade_needed: {"plan":"starter","maxLanguages":1}' } },
        });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.atLimit).toBe(true);
        expect(store.canAdd).toBe(false);

        const error = await store.addLanguage({ language: 'de' }).catch((e) => e);
        expect(error).toBeInstanceOf(LanguageApiError);
        expect(error.code).toBe('upgrade_needed');
        expect(error.details).toMatchObject({ plan: 'starter', maxLanguages: 1 });
    });

    it('marks first run only for accounts the server flags', async () => {
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, learningLanguage: null, languages: [], onboardingState: 'needs_language' },
        });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.needsLanguage).toBe(true);
        expect(store.activeLanguage).toBe('en');
    });

    it('removes a language and keeps the purge date', async () => {
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, languages: [summary('en'), summary('de')] },
            'remove-language': {
                state: { ...STATE, languages: [summary('en'), summary('de', { status: 'removed', purgeAt: '2026-11-15T00:00:00Z' })] },
                purgeAt: '2026-11-15T00:00:00Z',
            },
        });
        const store = useLanguageStore();
        await store.bootstrap();
        const { purgeAt } = await store.removeLanguage('de');
        expect(purgeAt).toBe('2026-11-15T00:00:00Z');
        expect(store.languages.map((l) => l.code)).toEqual(['en']);
        expect(store.removedLanguages.map((l) => l.code)).toEqual(['de']);
    });
});

describe('toLanguageApiError', () => {
    it('reads the contract errors and a missing function', () => {
        expect(toLanguageApiError({ message: 'not_available' }).code).toBe('not_available');
        expect(toLanguageApiError({ error: 'purging' }).code).toBe('purging');
        expect(toLanguageApiError({ message: 'Function with name add-language not found' }).code).toBe('missing');
        expect(toLanguageApiError({ message: 'Phrase not found' }).code).toBe('unknown');
    });
});
