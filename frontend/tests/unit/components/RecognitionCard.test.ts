import { describe, it, expect, vi } from 'vitest';
vi.mock('vue', async () => await vi.importActual('vue'));
import { mount } from '@vue/test-utils';
import RecognitionCard from '~/components/widget/flashcard/RecognitionCard.vue';

describe('RecognitionCard — normal', () => {
    const base = {
        phraseType: 'normal' as const,
        front: 'hello',
        back: 'سلام',
        context: 'a common greeting',
        translationLanguage: 'fa',
    };

    it('shows the front phrase and context, not the translation, when not flipped', () => {
        const w = mount(RecognitionCard, { props: { ...base, isFlipped: false } });
        expect(w.text()).toContain('hello');
        expect(w.text()).toContain('a common greeting');
        expect(w.text()).not.toContain('سلام');
    });

    it('shows the translation when flipped', async () => {
        const w = mount(RecognitionCard, { props: { ...base, isFlipped: true } });
        expect(w.text()).toContain('سلام');
    });
});

describe('RecognitionCard — linguistic', () => {
    const base = {
        phraseType: 'linguistic' as const,
        front: 'had to',
        back: 'مجبور بودن',
        context: 'we had to go',
        direction: { source: 'ltr' as const, target: 'rtl' as const },
        languageInfo: { source: 'en', target: 'fa' },
        linguisticData: {
            isValid: true,
            type: 'idiom',
            definition: '',
            phonetic: { transliteration: 'هَد تو' },
            formality_level: 'neutral' as const,
        },
        chunks: [{ text: 'had to', type: 'idiom', confidence: 0.9, definition: 'obligation', transliteration: 'هَد تو' }],
    };

    it('front shows phrase + transliteration + context', () => {
        const w = mount(RecognitionCard, { props: { ...base, isFlipped: false } });
        expect(w.text()).toContain('had to');
        expect(w.text()).toContain('هَد تو');
        expect(w.text()).toContain('we had to go');
    });

    it('back shows the translation and per-chunk definitions, not the linguistic_data.definition', async () => {
        const w = mount(RecognitionCard, { props: { ...base, isFlipped: true } });
        expect(w.text()).toContain('مجبور بودن'); // translation
        expect(w.text()).toContain('Definition');
        expect(w.text()).toContain('obligation'); // chunk definition
    });
});
