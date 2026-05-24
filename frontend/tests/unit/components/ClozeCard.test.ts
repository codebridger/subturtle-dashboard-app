import { describe, it, expect, vi } from 'vitest';
vi.mock('vue', async () => await vi.importActual('vue'));
import { mount } from '@vue/test-utils';
import ClozeCard from '~/components/widget/flashcard/ClozeCard.vue';

const props = {
    context: 'we had to decide quickly, right?',
    chunks: [
        { text: 'had to', type: 'collocation', confidence: 0.9, definition: 'obligation', transliteration: 'هَد تو' },
        { text: 'right?', type: 'discourse_marker', confidence: 0.8, definition: 'seeking agreement' },
    ],
    direction: { source: 'ltr' as const, target: 'ltr' as const },
    back: 'the meaning',
};

const checkButton = (w: ReturnType<typeof mount>) => w.findAll('button').find((b) => /Check|Recheck/.test(b.text()))!;

describe('ClozeCard', () => {
    it('renders one blank input per chunk found in the sentence', () => {
        const w = mount(ClozeCard, { props: { ...props, isFlipped: false } });
        expect(w.text()).toContain('Fill in the blanks');
        expect(w.findAll('input')).toHaveLength(2);
    });

    it('marks blanks correct/incorrect only after Check and reports the count', async () => {
        const w = mount(ClozeCard, { props: { ...props, isFlipped: false } });
        const inputs = w.findAll('input');
        await inputs[0].setValue('had to'); // correct
        await inputs[1].setValue('nope'); // wrong

        // No colouring before Check.
        expect(inputs[0].classes()).toContain('border-blue-500');

        await checkButton(w).trigger('click');

        expect(inputs[0].classes()).toContain('border-green-500');
        expect(inputs[1].classes()).toContain('border-red-500');
        expect(w.text()).toContain('1 to fix');
    });

    it('Clear wrong empties only the incorrect blanks and resets to a neutral state', async () => {
        const w = mount(ClozeCard, { props: { ...props, isFlipped: false } });
        const inputs = w.findAll('input');
        await inputs[0].setValue('had to');
        await inputs[1].setValue('nope');
        await checkButton(w).trigger('click');

        const clear = w.findAll('button').find((b) => b.text() === 'Clear wrong')!;
        await clear.trigger('click');

        expect((inputs[0].element as HTMLInputElement).value).toBe('had to'); // correct kept
        expect((inputs[1].element as HTMLInputElement).value).toBe(''); // wrong cleared
        expect(inputs[1].classes()).toContain('border-blue-500'); // back to neutral
        expect(checkButton(w).text()).toBe('Check'); // not "Recheck"
    });

    it('back side reveals the filled sentence and chunk definitions', () => {
        const w = mount(ClozeCard, { props: { ...props, isFlipped: true } });
        expect(w.text()).toContain('had to');
        expect(w.text()).toContain('Definition');
        expect(w.text()).toContain('obligation');
        expect(w.text()).toContain('the meaning');
        expect(w.findAll('input')).toHaveLength(0); // no inputs on the back
    });
});
