import { describe, it, expect, vi } from 'vitest';
vi.mock('vue', async () => await vi.importActual('vue'));
vi.mock('pilotui/elements', () => ({ Button: { template: '<button><slot /></button>' }, Icon: { template: '<i />' } }));
vi.mock('~/stores/language', () => ({ trackLanguageEvent: vi.fn() }));
vi.mock('~/types/database.type', () => ({}));
import { mount } from '@vue/test-utils';
import * as vue from 'vue';
Object.assign(globalThis, { ref: vue.ref, computed: vue.computed, onMounted: vue.onMounted, onUnmounted: vue.onUnmounted });
import LeitnerReviewSession from '~/components/practice/LeitnerReviewSession.vue';

describe('LeitnerReviewSession cloze cue (D-14)', () => {
    it('copies the review item cue onto the primary chunk when the chunk has none', () => {
        const phrase = { _id: 'p2', phrase: 'gegangen', context: 'Wir sind gestern gegangen.', chunks: [{ text: 'gegangen', type: 'other', confidence: 0.9 }] };
        const w = mount(LeitnerReviewSession, {
            props: { items: [{ phrase, boxLevel: 3, cue: { lemma: 'gehen', form: 'past participle' }, acceptedAnswers: ['gegangen'] }] as any, loading: false, title: 'Review' },
            global: { mocks: { $t: (k: string) => k }, stubs: { MaterialPracticeToolScaffold: { template: '<div><slot /></div>' }, WidgetFlashCard: { name: 'WidgetFlashCard', props: ['phrase', 'leitnerLevel'], template: '<div class="card" />' }, Transition: false } },
        });
        const chunk = (w.findComponent({ name: 'WidgetFlashCard' }).props('phrase') as any)?.chunks?.[0];
        expect(chunk).toMatchObject({ lemma: 'gehen', form: 'past participle', acceptedAnswers: ['gegangen'] });
    });
});
