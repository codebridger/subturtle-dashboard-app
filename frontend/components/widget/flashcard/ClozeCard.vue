<template>
    <!-- Front: flex-grow content area + fixed-height action area, so the buttons/status never
         reflow the sentence. -->
    <div v-if="!isFlipped" class="flex h-full w-full flex-col">
        <!-- Content (grows, scrolls, vertically centered) -->
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-2 text-center">
            <div class="mb-4 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Fill in the blanks</div>
            <p v-if="clozeData" class="w-full max-w-2xl text-lg font-medium leading-loose md:text-xl"
                :dir="direction?.source || 'ltr'">
                <template v-for="(seg, i) in clozeData.segments" :key="i">
                    <span v-if="seg.type === 'text'">{{ seg.value }}</span>
                    <input v-else v-model="clozeAnswers[seg.blankIndex]" type="text" @click.stop
                        @keyup.enter="checkCloze" :style="{ width: Math.max(seg.answer.length, 5) + 'ch' }"
                        class="mx-1 border-b-2 bg-transparent text-center align-bottom outline-none"
                        :class="clozeChecked && checkResults[seg.blankIndex] !== undefined
                            ? (checkResults[seg.blankIndex] ? 'border-green-500 text-green-600' : 'border-red-500 text-red-500')
                            : 'border-blue-500 text-gray-800'" />
                </template>
            </p>
        </div>

        <!-- Action (fixed height) -->
        <div class="flex h-24 shrink-0 flex-col items-center justify-center gap-2">
            <div class="flex items-center justify-center gap-3">
                <button @click.stop="checkCloze"
                    class="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
                    {{ clozeChecked ? 'Recheck' : 'Check' }}
                </button>
                <button v-if="clozeChecked && !allBlanksCorrect" @click.stop="clearWrong"
                    class="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
                    Clear wrong
                </button>
            </div>
            <div class="h-5 overflow-hidden whitespace-nowrap text-sm font-medium"
                :class="allBlanksCorrect ? 'text-green-600' : 'text-gray-500'">
                <template v-if="clozeChecked">
                    {{ allBlanksCorrect ? 'All correct!' : wrongCount + ' to fix — edit and check again' }}
                </template>
            </div>
        </div>
    </div>

    <!-- Back: full sentence revealed + per-chunk definitions + meaning (scrolls within the card) -->
    <div v-else class="flex h-full w-full flex-col items-center overflow-auto text-center">
        <p v-if="clozeData" class="mb-4 w-full max-w-2xl text-lg font-medium leading-loose md:text-xl"
            :dir="direction?.source || 'ltr'">
            <template v-for="(seg, i) in clozeData.segments" :key="i">
                <span v-if="seg.type === 'text'">{{ seg.value }}</span>
                <span v-else class="mx-1 font-bold text-blue-600">{{ seg.answer }}</span>
            </template>
        </p>

        <div v-if="clozeData?.blanks.length" class="w-full max-w-2xl space-y-3">
            <div class="mb-1 text-center text-xs uppercase tracking-wide text-gray-400">Definition</div>
            <div v-for="(b, i) in clozeData.blanks" :key="i"
                class="rounded-lg border-l-4 border-blue-200 bg-gray-50 p-3 text-left">
                <div class="flex items-baseline justify-between gap-3">
                    <span class="font-medium" :dir="direction?.source || 'ltr'">{{ b.chunk.text }}</span>
                    <span v-if="b.chunk.transliteration" class="shrink-0 text-xs text-gray-400"
                        :dir="direction?.target || 'ltr'">
                        {{ b.chunk.transliteration }}
                    </span>
                </div>
                <div v-if="b.chunk.definition" class="mt-1 text-sm text-gray-600" :dir="direction?.target || 'ltr'">
                    {{ b.chunk.definition }}
                </div>
            </div>
        </div>

        <div v-if="back" class="mt-4 text-base text-gray-600" :dir="direction?.target || 'ltr'">{{ back }}</div>
    </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import type { Chunk } from '~/types/database.type';
import { useClozeBlanks } from '~/composables/useClozeBlanks';

const props = defineProps<{
    sourceSentence?: string | null;
    context?: string;
    chunks?: Chunk[];
    direction?: { source: 'ltr' | 'rtl'; target: 'ltr' | 'rtl' };
    back?: string;
    isFlipped?: boolean;
}>();

const direction = toRef(props, 'direction');
const back = toRef(props, 'back');
const isFlipped = toRef(props, 'isFlipped');

const { clozeData, clozeAnswers, clozeChecked, checkResults, checkCloze, clearWrong, allBlanksCorrect, wrongCount } =
    useClozeBlanks(
        () => props.sourceSentence || props.context || '',
        () => props.chunks || []
    );
</script>
