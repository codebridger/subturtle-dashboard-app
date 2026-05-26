import { describe, it, expect, vi } from 'vitest';
// The global setup mocks `vue`; restore the real implementation so SFC reactivity works.
vi.mock('vue', async () => await vi.importActual('vue'));
import { mount } from '@vue/test-utils';
import FlashcardFlipToggle from '~/components/widget/flashcard/FlashcardFlipToggle.vue';

describe('FlashcardFlipToggle', () => {
    it('renders the default Question / Answer labels', () => {
        const w = mount(FlashcardFlipToggle, { props: { isFlipped: false } });
        expect(w.text()).toContain('Question');
        expect(w.text()).toContain('Answer');
    });

    it('marks the active side and not the other', () => {
        const w = mount(FlashcardFlipToggle, { props: { isFlipped: false } });
        const [question, answer] = w.findAll('button');
        expect(question.classes()).toContain('bg-blue-100');
        expect(answer.classes()).not.toContain('bg-blue-100');
    });

    it('emits flip only when clicking the inactive side', async () => {
        const w = mount(FlashcardFlipToggle, { props: { isFlipped: false } });
        const [question, answer] = w.findAll('button');

        await question.trigger('click'); // already active → no flip
        expect(w.emitted('flip')).toBeFalsy();

        await answer.trigger('click'); // inactive → flip
        expect(w.emitted('flip')).toHaveLength(1);
    });

    it('supports custom labels', () => {
        const w = mount(FlashcardFlipToggle, { props: { frontLabel: 'Exercise', backLabel: 'Solution' } });
        expect(w.text()).toContain('Exercise');
        expect(w.text()).toContain('Solution');
    });
});
