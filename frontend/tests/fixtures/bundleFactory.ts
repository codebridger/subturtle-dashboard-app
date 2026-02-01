import type { PhraseBundleType, PhraseType, NewPhraseType } from '~/types/database.type';

export const createBundle = (overrides: Partial<PhraseBundleType> = {}): PhraseBundleType => ({
    _id: 'test-bundle-id',
    title: 'Test Bundle',
    desc: 'Test Description',
    refId: 'test-user-id',
    phrases: ['phrase1', 'phrase2', 'phrase3'],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
});

export const createPhrase = (overrides: Partial<PhraseType> = {}): PhraseType => ({
    _id: 'test-phrase-id',
    phrase: 'Hello world',
    translation: 'Hola mundo',
    refId: 'test-user-id',
    bundleId: 'test-bundle-id',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
});

export const createNewPhrase = (overrides: Partial<NewPhraseType> = {}): NewPhraseType => ({
    id: 'temp-phrase-id',
    phrase: 'New phrase',
    translation: 'Nueva frase',
    bundleId: 'test-bundle-id',
    ...overrides,
});

export const createBundleList = (count: number = 3): PhraseBundleType[] => {
    return Array.from({ length: count }, (_, index) =>
        createBundle({
            _id: `bundle-${index + 1}`,
            title: `Bundle ${index + 1}`,
            desc: `Description for bundle ${index + 1}`,
            phrases: [`phrase-${index + 1}-1`, `phrase-${index + 1}-2`],
        })
    );
};

export const createPhraseList = (count: number = 5): PhraseType[] => {
    return Array.from({ length: count }, (_, index) =>
        createPhrase({
            _id: `phrase-${index + 1}`,
            phrase: `Phrase ${index + 1}`,
            translation: `Translation ${index + 1}`,
            bundleId: 'test-bundle-id',
        })
    );
};
