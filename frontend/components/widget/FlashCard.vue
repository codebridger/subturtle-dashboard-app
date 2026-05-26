<template>
    <div class="h-full w-full select-none">
        <Card :class="[!isFlipped ? 'bg-white' : 'bg-slate-100']"
            class="relative flex h-full flex-col overflow-hidden">
            <!-- One consistent flip control for every card type -->
            <FlashcardFlipToggle :is-flipped="isFlipped" @flip="flipCard" />

            <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
                <!-- L3+ fill-in cloze, else the recognition card -->
                <ClozeCard v-if="isClozeMode" :context="context" :chunks="chunks" :direction="direction" :back="back"
                    :is-flipped="isFlipped" />
                <RecognitionCard v-else :phrase-type="phraseType" :front="front" :back="back" :context="context"
                    :translation-language="translationLanguage" :direction="direction" :language-info="languageInfo"
                    :linguistic-data="linguisticData" :chunks="chunks" :is-flipped="isFlipped" />
            </div>
        </Card>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Card } from 'pilotui/elements';
import type { LinguisticData, Chunk } from '~/types/database.type';
import { useCardFlip } from '~/composables/useCardFlip';
import { buildClozeData } from '~/composables/useClozeBlanks';
import ClozeCard from './flashcard/ClozeCard.vue';
import RecognitionCard from './flashcard/RecognitionCard.vue';
import FlashcardFlipToggle from './flashcard/FlashcardFlipToggle.vue';

/** The fields FlashCard reads off a phrase document. Kept loose so callers can pass a PhraseType. */
interface FlashcardPhrase {
    type?: 'normal' | 'linguistic';
    phrase?: string;
    translation?: string;
    translation_language?: string;
    context?: string;
    direction?: { source: 'ltr' | 'rtl'; target: 'ltr' | 'rtl' };
    language_info?: { source: string; target: string };
    linguistic_data?: LinguisticData;
    chunks?: Chunk[];
}

const props = defineProps<{
    /** The phrase to show. FlashCard derives the front/back/context/etc. from it. */
    phrase?: FlashcardPhrase | null;
    /** Leitner box level — at 3+ (with a usable chunk) the card becomes a fill-in cloze. */
    leitnerLevel?: number;
}>();

// Derived view of the phrase.
const phraseType = computed(() => props.phrase?.type ?? 'normal');
const front = computed(() => props.phrase?.phrase ?? '');
const back = computed(() => props.phrase?.translation || props.phrase?.phrase || '');
const context = computed(() => props.phrase?.context ?? '');
const translationLanguage = computed(() => props.phrase?.translation_language);
const direction = computed(() => props.phrase?.direction);
const languageInfo = computed(() => props.phrase?.language_info);
const linguisticData = computed(() => props.phrase?.linguistic_data);
const chunks = computed(() => props.phrase?.chunks ?? []);

// Flip state (resets to the front whenever the card changes).
const { isFlipped, flipCard } = useCardFlip(() => [front.value, context.value]);

// L3+ fill-in card when the level is 3+ and at least one confirmed chunk lands in the source
// sentence; otherwise the recognition card. The cloze exercise state lives inside ClozeCard.
const isClozeMode = computed(() => (props.leitnerLevel ?? 0) >= 3 && !!buildClozeData(context.value, chunks.value));

defineExpose({
    flipCard,
});
</script>
