import { describe, it, expect, vi } from 'vitest';
vi.mock('vue', async () => await vi.importActual('vue'));
// Avoid importing the real pilotui Card in jsdom; the stub below renders the slot.
vi.mock('pilotui/elements', () => ({ Card: { name: 'Card', template: '<div><slot /></div>' } }));
import { mount } from '@vue/test-utils';
import FlashCard from '~/components/widget/FlashCard.vue';

const mountCard = (props: Record<string, unknown>) =>
    mount(FlashCard, {
        props,
        global: {
            stubs: {
                Card: { template: '<div><slot /></div>' },
                FlashcardFlipToggle: true,
                ClozeCard: { template: '<div class="cloze-stub" />' },
                RecognitionCard: { template: '<div class="recognition-stub" />' },
            },
        },
    });

const linguisticPhrase = {
    type: 'linguistic' as const,
    phrase: 'we had to go',
    translation: 'مجبور بودیم برویم',
    context: 'we had to go quickly',
    chunks: [{ text: 'had to', type: 'collocation', confidence: 0.9 }],
};

describe('FlashCard dispatcher', () => {
    it('renders the recognition card below level 3', () => {
        const w = mountCard({ phrase: linguisticPhrase, leitnerLevel: 1 });
        expect(w.find('.recognition-stub').exists()).toBe(true);
        expect(w.find('.cloze-stub').exists()).toBe(false);
    });

    it('renders the cloze card at level 3 when a chunk lands in the sentence', () => {
        const w = mountCard({ phrase: linguisticPhrase, leitnerLevel: 3 });
        expect(w.find('.cloze-stub').exists()).toBe(true);
        expect(w.find('.recognition-stub').exists()).toBe(false);
    });

    it('falls back to recognition at level 3 when no chunk matches the sentence', () => {
        const noMatch = { ...linguisticPhrase, chunks: [{ text: 'not present here', type: 'other', confidence: 0.9 }] };
        const w = mountCard({ phrase: noMatch, leitnerLevel: 3 });
        expect(w.find('.recognition-stub').exists()).toBe(true);
        expect(w.find('.cloze-stub').exists()).toBe(false);
    });

    it('always renders the shared flip toggle', () => {
        const w = mountCard({ phrase: linguisticPhrase, leitnerLevel: 1 });
        expect(w.findComponent({ name: 'FlashcardFlipToggle' }).exists()).toBe(true);
    });
});
