import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('vue', async () => await vi.importActual('vue'));
const run = vi.hoisted(() => vi.fn());
vi.mock('@modular-rest/client', () => ({ functionProvider: { run }, authentication: { user: { id: 'u1' } } }));
vi.mock('~/plugins/mixpanel', () => ({ analytic: { track: vi.fn() }, registerLanguageAnalytics: vi.fn() }));

const vue = await vi.importActual<typeof import('vue')>('vue');
Object.assign(globalThis, { ref: vue.ref, computed: vue.computed, authUser: { value: { id: 'u1' } } });

const { analytic } = await import('~/plugins/mixpanel');
const { useLanguageStore, onLanguageSwitch, normalizeInterests } = await import('~/stores/language');
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
        vi.mocked(analytic.track).mockClear();
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

    it('sends no language analytics itself: the server sends them (B-28)', async () => {
        const two = { ...STATE, languages: [summary('en'), summary('de')] };
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': STATE,
            'set-active-language': ({ language }: any) => ({ state: { ...two, learningLanguage: language } }),
            'add-language': { state: two },
            'remove-language': { state: STATE, purgeAt: '2026-11-17T00:00:00.000Z' },
        });
        const store = useLanguageStore();
        await store.bootstrap();
        await store.addLanguage({ language: 'de', startLevel: 'A2', startLevelSource: 'test' });
        await store.switchLanguage('en');
        await store.removeLanguage('de');

        expect(analytic.track).not.toHaveBeenCalled();
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

describe('Tell me (B-06)', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        run.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('reads the presses from get-language-state, so "Got it" survives a reload', async () => {
        answer({ 'get-language-capabilities': CAPS, 'get-language-state': { ...STATE, interests: ['pt'] } });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.isInterested('pt')).toBe(true);
        expect(store.isInterested('ja')).toBe(false);
    });

    it('falls back to "Tell me" when the server sends no interests', async () => {
        answer({ 'get-language-capabilities': CAPS, 'get-language-state': STATE });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.enabled).toBe(true);
        expect(store.isInterested('pt')).toBe(false);
    });

    it('keeps a press made on this visit, and takes the server answer', async () => {
        answer({ 'get-language-capabilities': CAPS, 'get-language-state': STATE, 'set-language-interest': (args: any) => ({ on: args.on }) });
        const store = useLanguageStore();
        await store.bootstrap();
        await expect(store.setInterest('pt', true)).resolves.toBe(true);
        expect(store.isInterested('pt')).toBe(true);
        expect(run).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'set-language-interest', args: expect.objectContaining({ language: 'pt', on: true }) })
        );
        // A state refresh without the field does not flip it back.
        await store.refreshState();
        expect(store.isInterested('pt')).toBe(true);
    });

    it('rolls back when the server says no', async () => {
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, interests: ['pt'] },
            'set-language-interest': { reject: new Error('down') },
        });
        const store = useLanguageStore();
        await store.bootstrap();
        await expect(store.setInterest('pt', false)).rejects.toThrow('down');
        expect(store.isInterested('pt')).toBe(true);
    });

    it('normalizes codes and { language } rows, and ignores anything else', () => {
        expect(normalizeInterests(['pt', { language: 'ja' }, { code: 'ko' }, 3, null, ''])).toEqual(['pt', 'ja', 'ko']);
        expect(normalizeInterests(undefined)).toEqual([]);
        expect(normalizeInterests({ pt: true })).toEqual([]);
    });
});

describe('Starter holds a removed language\'s place (B-33)', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        run.mockReset();
    });

    const later = () => new Date(Date.now() + 86400000).toISOString();
    const earlier = () => new Date(Date.now() - 86400000).toISOString();

    it('blocks a new language but allows the restore', async () => {
        const state = { ...STATE, plan: 'starter', maxLanguages: 1, learningLanguage: null, languages: [summary('de', { status: 'removed', purgeAt: later() })] };
        answer({ 'get-language-capabilities': CAPS, 'get-language-state': state });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.heldSlots).toBe(1);
        expect(store.canAdd).toBe(false);
        expect(store.canRestore).toBe(true);
        expect(store.restorable.map((l) => l.code)).toEqual(['de']);
    });

    it('frees the place after the purge date, and on other plans at once', async () => {
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, plan: 'starter', maxLanguages: 1, languages: [summary('de', { status: 'removed', purgeAt: earlier() })] },
        });
        const store = useLanguageStore();
        await store.bootstrap();
        expect(store.canAdd).toBe(true);
        expect(store.restorable).toEqual([]);

        setActivePinia(createPinia());
        answer({
            'get-language-capabilities': CAPS,
            'get-language-state': { ...STATE, plan: 'reader', maxLanguages: 3, languages: [summary('en'), summary('de', { status: 'removed', purgeAt: later() })] },
        });
        const reader = useLanguageStore();
        await reader.bootstrap();
        expect(reader.heldSlots).toBe(0);
        expect(reader.canAdd).toBe(true);
    });
});
