<template>
    <!-- Front: flex-grow content area + fixed-height action area, so the buttons/status never
         reflow the sentence. -->
    <div v-if="!isFlipped" class="flex h-full w-full flex-col">
        <!-- Content (grows, scrolls, vertically centered) -->
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-2 text-center">
            <div class="mb-4 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Fill in the blanks</div>
            <!-- The sentence is its own isolated run with the learning language's direction, so a
                 blank keeps its place even inside a right-to-left screen (D-21). -->
            <p v-if="clozeData" class="w-full max-w-2xl text-lg font-medium leading-loose md:text-xl [unicode-bidi:isolate]"
                :dir="direction?.source || 'ltr'" :lang="language || undefined">
                <template v-for="(seg, i) in clozeData.segments" :key="i">
                    <span v-if="seg.type === 'text'">{{ seg.value }}</span>
                    <span v-else class="inline-flex flex-col items-center align-bottom">
                        <!-- The cue (D-14): the base form and the form asked for. -->
                        <span v-if="cueFor(seg.chunk)" class="mb-0.5 rounded-full bg-sky-50 px-2 text-[11px] font-bold leading-5 text-sky-700" data-testid="cloze-cue">
                            {{ cueFor(seg.chunk) }}
                        </span>
                        <input v-model="clozeAnswers[seg.blankIndex]" type="text" @click.stop
                            @keyup.enter="checkCloze" :style="{ width: Math.max(seg.answer.length, 5) + 'ch' }"
                            :aria-label="cueFor(seg.chunk) || undefined"
                            class="mx-1 border-b-2 bg-transparent text-center outline-none"
                            :class="blankClass(seg.blankIndex)" />
                    </span>
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
            <div class="h-5 overflow-hidden whitespace-nowrap text-sm font-medium" :class="statusClass" data-testid="cloze-status">
                <template v-if="clozeChecked">{{ statusText }}</template>
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
import { computed, toRef, watch } from 'vue';
import type { Chunk } from '~/types/database.type';
import type { ReviewResult } from '~/types/language.type';
import { useClozeBlanks, type ClozeChunk } from '~/composables/useClozeBlanks';
import { languageApi } from '~/utils/languageApi';

const props = defineProps<{
    sourceSentence?: string | null;
    context?: string;
    chunks?: Chunk[];
    direction?: { source: 'ltr' | 'rtl'; target: 'ltr' | 'rtl' };
    back?: string;
    isFlipped?: boolean;
    /** The phrase, for the server's `check-cloze-answer`. Without it the local rules decide. */
    phraseId?: string;
    /** The learning language of the phrase (accent and spelling rules, `lang` of the sentence). */
    language?: string | null;
    /** Ask the server to judge (multilingual on and the language has `cloze`). */
    serverCheck?: boolean;
}>();

/** The three-way result once Check is pressed (Q4); null again on a new card. */
const emit = defineEmits<{ result: [result: ReviewResult | null] }>();

const direction = toRef(props, 'direction');
const back = toRef(props, 'back');
const isFlipped = toRef(props, 'isFlipped');

const { clozeData, clozeAnswers, clozeChecked, checkResults, gradeResults, cardResult, checkCloze, clearWrong, allBlanksCorrect, wrongCount } =
    useClozeBlanks(
        () => props.sourceSentence || props.context || '',
        () => props.chunks || [],
        {
            language: () => props.language,
            // `check-cloze-answer` takes one answer per phrase and checks it against the phrase's
            // primary chunk (highest confidence), so it judges a card whose one blank is that chunk.
            serverCheck: async (answer) => {
                if (!props.serverCheck || !props.phraseId || (clozeData.value?.blanks.length ?? 0) !== 1) return null;
                if ((clozeData.value!.blanks[0].chunk.text || '') !== (primaryChunk(props.chunks)?.text || '')) return null;
                try {
                    const res = await languageApi.checkClozeAnswer({ phraseId: props.phraseId, answer, language: props.language ?? undefined });
                    // Only a real verdict replaces the local one.
                    return res && ['right', 'close', 'wrong'].includes(res.result) ? res : null;
                } catch {
                    return null;
                }
            },
        }
    );

watch(cardResult, (result) => emit('result', result));

/**
 * The chunk the server checks: highest confidence, the earlier one on a tie
 * (server/src/languages/cloze.ts). Compared by text: reactive arrays can wrap the same chunk twice.
 */
function primaryChunk(chunks?: Chunk[]) {
    if (!chunks?.length) return null;
    return chunks.reduce((a, b) => ((b?.confidence ?? 0) > (a?.confidence ?? 0) ? b : a));
}

/** "gehen · past participle" — shown only when the chunk carries a cue (B-15). */
function cueFor(chunk: Chunk) {
    const c = chunk as ClozeChunk;
    // The server fills a missing lemma with the chunk text itself; showing it would give the answer away.
    const lemma = c.lemma && c.lemma.trim().toLowerCase() !== (c.text || '').trim().toLowerCase() ? c.lemma : '';
    if (!lemma && !c.form) return '';
    return [lemma, c.form].filter(Boolean).join(' · ');
}

function blankClass(blankIndex: number) {
    if (!clozeChecked.value || !gradeResults[blankIndex]) return 'border-blue-500 text-gray-800';
    const result = gradeResults[blankIndex].result;
    if (result === 'right') return 'border-green-500 text-green-600';
    if (result === 'close') return 'border-amber-500 text-amber-600';
    return 'border-red-500 text-red-500';
}

const closeBlank = computed(() => clozeData.value?.blanks.find((b) => gradeResults[b.blankIndex]?.result === 'close'));

const statusText = computed(() => {
    if (allBlanksCorrect.value) return 'Right!';
    if (cardResult.value === 'close' && closeBlank.value) {
        const g = gradeResults[closeBlank.value.blankIndex];
        // Q4: "Almost" with the right form.
        if (g.reason === 'accent') return `Almost: mind the accent: ${g.expected}`;
        if (g.reason === 'typo') return `Almost: check the spelling: ${g.expected}`;
        return `Almost: right word, check the ending: ${g.expected}`;
    }
    return wrongCount.value + ' to fix — edit and check again';
});

const statusClass = computed(() => {
    if (allBlanksCorrect.value) return 'text-green-600';
    if (cardResult.value === 'close') return 'text-amber-600';
    return 'text-gray-500';
});
</script>
