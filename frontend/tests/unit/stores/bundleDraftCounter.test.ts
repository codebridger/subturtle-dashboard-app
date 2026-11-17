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

const vue = await vi.importActual<typeof import('vue')>('vue');
const profile = vue.reactive({ isFreemium: true, freemiumAllocation: { allowed_save_words: 200, allowed_save_words_used: 10 } as any });
vi.mock('~/stores/profile', () => ({ useProfileStore: () => profile }));
Object.assign(globalThis, { ref: vue.ref, computed: vue.computed, authUser: { value: { id: 'u1' } } });

const { useBundleStore } = await import('~/stores/bundle');

/**
 * D-31: "Add Phrase" used to push the "N of 200 saves used" counter up at once. The counter is
 * about saves, so it moves only when a phrase is actually saved.
 */
const used = () => profile.freemiumAllocation.allowed_save_words_used;

async function bundleStore() {
    const store = useBundleStore();
    await store.fetchBundleDetail('b1');
    return store;
}

beforeEach(() => {
    setActivePinia(createPinia());
    run.mockReset();
    findByIds.mockReset();
    profile.isFreemium = true;
    profile.freemiumAllocation = { allowed_save_words: 200, allowed_save_words_used: 10 };
    findByIds.mockResolvedValue([{ _id: 'b1', title: 'Bundle', phrases: [] }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('bundle drafts and the saves counter (D-31)', () => {
    it('does not count a draft that was only added', async () => {
        const store = await bundleStore();

        store.addEmptyTemporarilyPhrase();

        expect(store.tempPhrases).toHaveLength(1);
        expect(used()).toBe(10);
    });

    it('does not give a save back when a draft is dropped', async () => {
        const store = await bundleStore();
        store.addEmptyTemporarilyPhrase();

        store.removeTemporarilyPhrase(store.tempPhrases[0].id);

        expect(store.tempPhrases).toHaveLength(0);
        expect(used()).toBe(10);
    });

    it('counts the save once the phrase is actually saved', async () => {
        run.mockImplementation(async ({ name }: any) => (name === 'createPhrase' ? { _id: 'p1', phrase: 'hola', translation: 'hello' } : {}));
        const store = await bundleStore();
        store.addEmptyTemporarilyPhrase();
        const draft = store.tempPhrases[0];

        await store.createPhrase({ ...draft, phrase: 'hola', translation: 'hello' });

        expect(used()).toBe(11);
        expect(store.tempPhrases).toHaveLength(0);
    });

    it('does not count a save that failed, and keeps the draft', async () => {
        run.mockImplementation(async ({ name }: any) => {
            if (name === 'createPhrase') throw new Error('limit');
            return {};
        });
        const store = await bundleStore();
        store.addEmptyTemporarilyPhrase();
        const draft = store.tempPhrases[0];

        await expect(store.createPhrase({ ...draft, phrase: 'hola', translation: 'hello' })).rejects.toThrow('limit');

        expect(used()).toBe(10);
        expect(store.tempPhrases).toHaveLength(1);
    });

    it('leaves the counter alone on a paid plan', async () => {
        profile.isFreemium = false;
        profile.freemiumAllocation = null;
        run.mockImplementation(async ({ name }: any) => (name === 'createPhrase' ? { _id: 'p1' } : {}));
        const store = await bundleStore();
        store.addEmptyTemporarilyPhrase();

        await store.createPhrase({ ...store.tempPhrases[0], phrase: 'a', translation: 'b' });

        expect(profile.freemiumAllocation).toBeNull();
    });

    it('calls a draft unsaved only once it has text', async () => {
        const store = await bundleStore();
        store.addEmptyTemporarilyPhrase();
        expect(store.hasUnsavedDraft).toBe(false);

        store.updateTemporarilyPhrase(store.tempPhrases[0].id, { phrase: '  ', translation: '' });
        expect(store.hasUnsavedDraft).toBe(false);

        store.updateTemporarilyPhrase(store.tempPhrases[0].id, { phrase: 'hola', translation: '' });
        expect(store.hasUnsavedDraft).toBe(true);

        store.removeTemporarilyPhrase(store.tempPhrases[0].id);
        expect(store.hasUnsavedDraft).toBe(false);
    });
});
