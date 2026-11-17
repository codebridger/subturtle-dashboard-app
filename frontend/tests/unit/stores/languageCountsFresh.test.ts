import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('vue', async () => await vi.importActual('vue'));
const run = vi.hoisted(() => vi.fn());
const findByIds = vi.hoisted(() => vi.fn());
vi.mock('@modular-rest/client', () => ({
    functionProvider: { run },
    dataProvider: { findByIds },
    createPagination: () => ({ pages: 1 }),
    authentication: { user: { id: 'u1' } },
}));
// The real module re-exports the server's schemas, whose packages the frontend job does not install.
vi.mock('~/types/database.type', () => ({
    DATABASE: { USER_CONTENT: 'user_content' },
    COLLECTIONS: { PHRASE_BUNDLE: 'phrase_bundle', PHRASE: 'phrase' },
}));
vi.mock('~/plugins/mixpanel', () => ({ analytic: { track: vi.fn() }, registerLanguageAnalytics: vi.fn() }));
vi.mock('~/stores/profile', () => ({ useProfileStore: () => ({ isFreemium: false, freemiumAllocation: null }) }));

const vue = await vi.importActual<typeof import('vue')>('vue');
Object.assign(globalThis, { ref: vue.ref, computed: vue.computed, authUser: { value: { id: 'u1' } } });

const { useLanguageStore } = await import('~/stores/language');
const { useLeitnerStore } = await import('~/stores/leitner');
const { useBundleStore } = await import('~/stores/bundle');

/**
 * D-30: the "138 phrases · 20 due" line on the Languages page and the header menu read the
 * language state, which is loaded once. These cover the moments it has to be loaded again.
 */
const FEATURES = { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: false, map: false };
const CAPS = {
    learning: [{ code: 'en', name: 'English', nativeName: 'English', rtl: false, ttsVoice: 'en', enabled: true, features: FEATURES }],
    own: [{ code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true, explanationReviewed: 'teacher' }],
};
const stateWith = (phraseCount: number, dueCount: number) => ({
    translationLanguage: 'fa',
    learningLanguage: 'en',
    languages: [
        {
            code: 'en',
            status: 'active',
            startLevel: 'B1',
            startLevelSource: 'test',
            dueCount,
            phraseCount,
            explanationLanguage: 'fa',
            starterPack: { state: 'none', heard: 0, total: 0 },
        },
    ],
    onboardingState: 'done',
    plan: 'reader',
    maxLanguages: 3,
    pending: [],
});

/** The server's current numbers; the tests change them the way a save or a review would. */
let server = { phraseCount: 138, dueCount: 20 };
const calls = () => run.mock.calls.map(([arg]) => arg.name as string);

beforeEach(() => {
    setActivePinia(createPinia());
    run.mockReset();
    findByIds.mockReset();
    server = { phraseCount: 138, dueCount: 20 };
    run.mockImplementation(async ({ name }: any) => {
        if (name === 'get-language-capabilities') return CAPS;
        if (name === 'get-language-state') return stateWith(server.phraseCount, server.dueCount);
        if (name === 'createPhrase') {
            server.phraseCount++;
            return { _id: 'p-new', phrase: 'a', translation: 'b' };
        }
        if (name === 'removePhrase') {
            server.phraseCount--;
            return {};
        }
        if (name === 'submit-review') {
            server.dueCount--;
            return {};
        }
        return {};
    });
    findByIds.mockResolvedValue([{ _id: 'b1', title: 'Bundle', phrases: ['p1', 'p2'] }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function loadedLanguage() {
    const language = useLanguageStore();
    await language.bootstrap();
    expect(language.summaryFor('en')?.phraseCount).toBe(138);
    return language;
}

describe('language counts stay fresh (D-30)', () => {
    it('refreshState picks up numbers that changed on the server', async () => {
        const language = await loadedLanguage();
        server = { phraseCount: 150, dueCount: 3 };

        await language.refreshState();

        expect(language.summaryFor('en')).toMatchObject({ phraseCount: 150, dueCount: 3 });
    });

    it('reloads the counts after a phrase is saved', async () => {
        const language = await loadedLanguage();
        const bundle = useBundleStore();
        await bundle.fetchBundleDetail('b1');

        await bundle.createPhrase({ id: 'tmp', phrase: 'a', translation: 'b' });
        await vi.waitFor(() => expect(language.summaryFor('en')?.phraseCount).toBe(139));
    });

    it('reloads the counts after a phrase is deleted', async () => {
        const language = await loadedLanguage();
        const bundle = useBundleStore();
        await bundle.fetchBundleDetail('b1');
        bundle.phrases.push({ _id: 'p1' } as any);

        await bundle.removePhrase('p1');
        await vi.waitFor(() => expect(language.summaryFor('en')?.phraseCount).toBe(137));
    });

    it('reloads the counts once when a review session ends, after the last answer landed', async () => {
        const language = await loadedLanguage();
        const leitner = useLeitnerStore();
        run.mockClear();

        await leitner.submitReview('p1', true);
        await leitner.submitReview('p2', false);
        expect(language.summaryFor('en')?.dueCount).toBe(20); // nothing refreshed per answer

        await leitner.finishReviewSession();
        // A second call (the page unmounting after "end session") must not call again.
        await leitner.finishReviewSession();

        expect(calls().filter((n) => n === 'get-language-state')).toHaveLength(1);
        expect(calls().lastIndexOf('get-language-state')).toBeGreaterThan(calls().lastIndexOf('submit-review'));
        expect(language.summaryFor('en')?.dueCount).toBe(18);
    });

    it('does not reload anything when no card was answered', async () => {
        await loadedLanguage();
        const leitner = useLeitnerStore();
        run.mockClear();

        await leitner.finishReviewSession();

        expect(run).not.toHaveBeenCalled();
    });
});
