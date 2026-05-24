<template>
    <div class="h-full w-full select-none">
        <Card :class="[!isFlipped ? 'bg-white' : 'bg-slate-100']"
            class="relative flex h-full flex-col overflow-hidden">
            <!-- One consistent flip control for every card type -->
            <FlashcardFlipToggle :is-flipped="isFlipped" @flip="flipCard" />

            <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
                <!-- ========== L3+ FILL-IN CLOZE PRESENTATION ========== -->
                <ClozeCard v-if="isClozeMode" :source-sentence="props.sourceSentence" :context="props.context"
                    :chunks="props.chunks" :direction="props.direction" :back="props.back" :is-flipped="isFlipped" />

                <!-- ========== NORMAL TYPE PHRASE PRESENTATION ========== -->
            <template v-else-if="phraseType === 'normal'">
                <div class="flex h-full flex-col">
                    <!-- Top row: (empty left), lang code badge right -->
                    <div class="flex w-full items-start justify-between px-6 pt-4">
                        <div></div>
                        <div v-if="isFlipped" class="flex flex-col items-end gap-1">
                            <div class="mb-0.5 pr-0.5 text-[10px] text-gray-400">Language</div>
                            <span
                                class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                                {{ props.translationLanguage || 'LANG' }}
                            </span>
                        </div>
                    </div>
                    <!-- Top empty div for spacing -->
                    <div class="flex-1"></div>
                    <!-- Center content div -->
                    <div class="flex flex-1 flex-col justify-center text-center">
                        <div :class="isFlipped ? 'mb-3 text-2xl font-medium' : 'mb-6 text-5xl font-medium'">
                            <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                            <span v-else>{{ props.back || 'Back' }}</span>
                        </div>
                        <div v-if="!isFlipped" class="text-lg text-gray-500">
                            <span>{{ props.context || '' }}</span>
                        </div>
                    </div>
                    <!-- Bottom empty div for spacing -->
                    <div class="flex-1"></div>
                </div>
            </template>

            <!-- ========== LINGUISTIC TYPE PHRASE PRESENTATION ========== -->
            <template v-else-if="phraseType === 'linguistic'">
                <div class="relative h-full w-full max-w-4xl">
                    <!-- Front Side: Source phrase with phonetic -->
                    <template v-if="!isFlipped">
                        <div class="flex h-full flex-col">
                            <!-- Top row: (empty left), lang code badge right -->
                            <div class="flex w-full items-start justify-between px-6 pt-4">
                                <div></div>
                                <div class="flex flex-col items-end gap-1">
                                    <div class="mb-0.5 pr-0.5 text-[10px] text-gray-400">Language</div>
                                    <span
                                        class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                                        {{ props.languageInfo?.source || 'SRC' }}
                                    </span>
                                </div>
                            </div>
                            <!-- Top empty div for spacing -->
                            <div class="flex-1"></div>
                            <!-- Center content div -->
                            <div class="flex flex-1 flex-col justify-center text-center">
                                <div class="mb-6 text-5xl font-medium" :dir="props.direction?.source || 'ltr'">
                                    {{ props.front || 'Front' }}
                                </div>
                                <!-- Phonetic (transliteration only) -->
                                <div v-if="props.linguisticData?.phonetic?.transliteration"
                                    class="flex items-center justify-center text-gray-600">
                                    <div class="text-lg font-medium" :dir="props.direction?.target || 'ltr'">
                                        {{ props.linguisticData.phonetic.transliteration }}
                                    </div>
                                </div>
                            </div>
                            <!-- Context div at bottom -->
                            <div class="flex flex-1 items-end justify-center pb-8">
                                <div v-if="props.context" class="max-w-2xl text-center text-sm italic text-gray-500"
                                    :dir="props.direction?.source || 'ltr'">
                                    {{ props.context }}
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- Back Side: Comprehensive linguistic information -->
                    <template v-else>
                        <div class="relative flex h-full w-full flex-col items-center justify-center">
                            <!-- Top row: badges (left, only for linguistic), lang code (right, always) -->
                            <div class="flex w-full items-start justify-between px-6 pt-4">
                                <div class="flex min-w-0 flex-col items-start gap-1">
                                    <template
                                        v-if="phraseType === 'linguistic' && (props.linguisticData?.type || props.linguisticData?.formality_level)">
                                        <div class="mb-0.5 pl-0.5 text-[10px] text-gray-400">Attributes</div>
                                        <div class="flex flex-wrap gap-2">
                                            <span v-if="props.linguisticData?.type"
                                                class="truncate rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase text-blue-800">
                                                {{ props.linguisticData.type }}
                                            </span>
                                            <span v-if="props.linguisticData?.formality_level"
                                                class="truncate rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase text-orange-800">
                                                {{ props.linguisticData.formality_level }}
                                            </span>
                                        </div>
                                    </template>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <div class="mb-0.5 pr-0.5 text-[10px] text-gray-400">Language</div>
                                    <span
                                        class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                                        {{ phraseType === 'linguistic' ? props.languageInfo?.target || 'TRG' :
                                            props.translationLanguage || 'LANG' }}
                                    </span>
                                </div>
                            </div>

                            <!-- Main Content (translation + per-chunk definitions, mirrors the extension) -->
                            <!-- Scroll-safe: the inner wrapper uses my-auto so it centers when it fits and -->
                            <!-- scrolls from the top (no clipping) when chunks/definitions overflow. -->
                            <div class="flex h-full w-full justify-center overflow-auto py-6">
                                <div class="my-auto flex w-full flex-col items-center gap-6">
                                    <!-- Translation -->
                                    <div class="text-center text-2xl font-medium" :dir="props.direction?.target || 'ltr'">
                                        {{ props.back || 'Translation' }}
                                    </div>

                                        <!-- Definition: one block per confirmed chunk -->
                                    <div v-if="props.chunks?.length" class="w-full max-w-2xl space-y-3">
                                        <div class="mb-1 text-center text-xs uppercase tracking-wide text-gray-400">
                                            Definition</div>
                                        <div v-for="(chunk, index) in props.chunks" :key="index"
                                            class="rounded-lg border-l-4 border-blue-200 bg-gray-50 p-3 text-left">
                                            <div class="flex items-baseline justify-between gap-3">
                                                <span class="font-medium" :dir="props.direction?.source || 'ltr'">
                                                    {{ chunk.text }}
                                                </span>
                                                <span v-if="chunk.transliteration" class="shrink-0 text-xs text-gray-400"
                                                    :dir="props.direction?.target || 'ltr'">
                                                    {{ chunk.transliteration }}
                                                </span>
                                            </div>
                                            <div v-if="chunk.definition" class="mt-1 text-sm text-gray-600"
                                                :dir="props.direction?.target || 'ltr'">
                                                {{ chunk.definition }}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </template>

            <!-- ========== FALLBACK FOR UNKNOWN TYPE ========== -->
                <template v-else>
                    <div class="text-center text-xl text-gray-500">
                        <span v-if="!isFlipped">{{ props.front || 'Front' }}</span>
                        <span v-else>{{ props.back || 'Back' }}</span>
                    </div>
                </template>
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
import FlashcardFlipToggle from './flashcard/FlashcardFlipToggle.vue';

// Define the props interface for better type safety
interface FlashCardProps {
    // Common props for both types
    front?: string;
    back?: string;
    phraseType?: 'normal' | 'linguistic';
    context?: string;

    // Normal type specific props
    translationLanguage?: string;

    // Linguistic type specific props
    direction?: {
        source: 'ltr' | 'rtl';
        target: 'ltr' | 'rtl';
    };
    languageInfo?: {
        source: string;
        target: string;
    };
    linguisticData?: LinguisticData;
    /** Confirmed reusable patterns; rendered as per-chunk definitions on the linguistic back. */
    chunks?: Chunk[];

    // Leitner L3+ fill-in cloze
    leitnerLevel?: number;
    confirmedChunk?: string | null;
    sourceSentence?: string | null;
}

const props = withDefaults(defineProps<FlashCardProps>(), {
    phraseType: 'normal',
    front: 'Front',
    back: 'Back',
});

// Flip state (resets to the front whenever the card changes).
const { isFlipped, flipCard } = useCardFlip(() => [props.front, props.sourceSentence]);

// L3+ fill-in card when the level is 3+ and at least one confirmed chunk lands in the sentence;
// otherwise fall back to the recognition card. The cloze exercise state lives inside ClozeCard.
const isClozeMode = computed(() => (props.leitnerLevel ?? 0) >= 3 && !!buildClozeData(props.sourceSentence || props.context, props.chunks));

defineExpose({
    flipCard,
});
</script>
