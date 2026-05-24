<template>
    <div class="h-full w-full cursor-pointer select-none" @click="onCardClick">
        <Card :class="[!isFlipped ? 'bg-white' : 'bg-slate-100']"
            class="flex h-full items-center justify-center overflow-auto p-6">
            <!-- ========== L3+ FILL-IN CLOZE PRESENTATION ========== -->
            <template v-if="isClozeMode && clozeData">
                <!-- Front: split into a flex-grow content area + a fixed-height action area, so changes to
                     the buttons/status never reflow or move the sentence. -->
                <div v-if="!isFlipped" class="flex h-full w-full flex-col">
                    <!-- Content (grows, scrolls, vertically centered) -->
                    <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-2 text-center">
                        <div class="mb-4 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Fill in the
                            blanks</div>
                        <p class="w-full max-w-2xl text-lg font-medium leading-loose md:text-xl"
                            :dir="props.direction?.source || 'ltr'">
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

                    <!-- Action (fixed height, never affects the content area above) -->
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
                <div v-else class="flex h-full w-full flex-col items-center overflow-auto py-6 text-center">
                    <p class="mb-4 w-full max-w-2xl text-lg font-medium leading-loose md:text-xl"
                        :dir="props.direction?.source || 'ltr'">
                        <template v-for="(seg, i) in clozeData.segments" :key="i">
                            <span v-if="seg.type === 'text'">{{ seg.value }}</span>
                            <span v-else class="mx-1 font-bold text-blue-600">{{ seg.answer }}</span>
                        </template>
                    </p>

                    <div v-if="clozeData.blanks.length" class="w-full max-w-2xl space-y-3">
                        <div class="mb-1 text-center text-xs uppercase tracking-wide text-gray-400">Definition</div>
                        <div v-for="(b, i) in clozeData.blanks" :key="i"
                            class="rounded-lg border-l-4 border-blue-200 bg-gray-50 p-3 text-left">
                            <div class="flex items-baseline justify-between gap-3">
                                <span class="font-medium" :dir="props.direction?.source || 'ltr'">
                                    {{ b.chunk.text }}
                                </span>
                                <span v-if="b.chunk.transliteration" class="shrink-0 text-xs text-gray-400"
                                    :dir="props.direction?.target || 'ltr'">
                                    {{ b.chunk.transliteration }}
                                </span>
                            </div>
                            <div v-if="b.chunk.definition" class="mt-1 text-sm text-gray-600"
                                :dir="props.direction?.target || 'ltr'">
                                {{ b.chunk.definition }}
                            </div>
                        </div>
                    </div>

                    <div v-if="props.back" class="mt-4 text-base text-gray-600"
                        :dir="props.direction?.target || 'ltr'">
                        {{ props.back }}
                    </div>
                </div>
            </template>

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
        </Card>
    </div>
</template>

<script setup lang="ts">
import { Card } from 'pilotui/elements';
import type { LinguisticData, Chunk } from '~/types/database.type';

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

const isFlipped = ref(false);
// Per-blank answers keyed by blank index, and whether the learner has pressed Check.
const clozeAnswers = reactive<Record<number, string>>({});
const clozeChecked = ref(false);
// Snapshot of correctness from the last Check press (blankIndex -> correct?). Feedback only
// updates on Check, so the learner can edit and re-check as many times as they want.
const checkResults = reactive<Record<number, boolean>>({});

const props = withDefaults(defineProps<FlashCardProps>(), {
    phraseType: 'normal',
    front: 'Front',
    back: 'Back',
});

type ClozeSegment =
    | { type: 'text'; value: string }
    | { type: 'blank'; blankIndex: number; answer: string; chunk: Chunk };

// Build a multi-blank cloze: blank every confirmed chunk that appears in the source sentence.
// Returns the rendered segments (text + blanks) and the ordered list of blanks (for the answer key
// and the back-side definition list). Returns null when there's no sentence or no chunk lands in it
// (in which case the card falls back to the recognition presentation).
const clozeData = computed(() => {
    const sentence = props.sourceSentence || props.context || '';
    const chunks = props.chunks || [];
    if (!sentence || !chunks.length) return null;

    const lower = sentence.toLowerCase();

    // First occurrence of each chunk inside the sentence.
    const hits = chunks
        .map((chunk) => {
            const text = (chunk.text || '').trim();
            if (!text) return null;
            const start = lower.indexOf(text.toLowerCase());
            if (start === -1) return null;
            return { start, end: start + text.length, chunk, answer: sentence.slice(start, start + text.length) };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null)
        .sort((a, b) => a.start - b.start);

    if (!hits.length) return null;

    // Drop overlapping chunks (keep the earliest), so blanks never collide.
    const placed: typeof hits = [];
    let lastEnd = -1;
    for (const hit of hits) {
        if (hit.start >= lastEnd) {
            placed.push(hit);
            lastEnd = hit.end;
        }
    }

    const segments: ClozeSegment[] = [];
    let cursor = 0;
    placed.forEach((hit, blankIndex) => {
        if (hit.start > cursor) segments.push({ type: 'text', value: sentence.slice(cursor, hit.start) });
        segments.push({ type: 'blank', blankIndex, answer: hit.answer, chunk: hit.chunk });
        cursor = hit.end;
    });
    if (cursor < sentence.length) segments.push({ type: 'text', value: sentence.slice(cursor) });

    const blanks = placed.map((hit, blankIndex) => ({ blankIndex, answer: hit.answer, chunk: hit.chunk }));
    return { segments, blanks };
});

const isClozeMode = computed(() => (props.leitnerLevel ?? 0) >= 3 && !!clozeData.value);

function isBlankCorrect(blankIndex: number, answer: string) {
    return (clozeAnswers[blankIndex] || '').trim().toLowerCase() === answer.trim().toLowerCase();
}

// Snapshot correctness for every blank; can be pressed repeatedly.
function checkCloze() {
    if (!clozeData.value) return;
    clozeData.value.blanks.forEach((b) => {
        checkResults[b.blankIndex] = isBlankCorrect(b.blankIndex, b.answer);
    });
    clozeChecked.value = true;
}

// Empty just the blanks that were wrong on the last check and return to the neutral (unchecked)
// state, so the learner can retype and check again. Correct answers keep their text.
function clearWrong() {
    if (!clozeData.value) return;
    clozeData.value.blanks.forEach((b) => {
        if (checkResults[b.blankIndex] === false) delete clozeAnswers[b.blankIndex];
    });
    Object.keys(checkResults).forEach((k) => delete checkResults[Number(k)]);
    clozeChecked.value = false;
}

const allBlanksCorrect = computed(() => {
    if (!clozeData.value || !clozeChecked.value) return false;
    return clozeData.value.blanks.every((b) => checkResults[b.blankIndex] === true);
});

const wrongCount = computed(() => {
    if (!clozeData.value) return 0;
    return clozeData.value.blanks.filter((b) => checkResults[b.blankIndex] === false).length;
});

function flipCard() {
    isFlipped.value = !isFlipped.value;
}

function onCardClick() {
    // In cloze mode the front is an exercise — don't flip on a stray tap until the learner has checked.
    if (isClozeMode.value && !isFlipped.value && !clozeChecked.value) return;
    flipCard();
}

defineExpose({
    flipCard,
});

// Reset state when the card changes.
watch(
    () => [props.front, props.sourceSentence],
    () => {
        isFlipped.value = false;
        clozeChecked.value = false;
        Object.keys(clozeAnswers).forEach((k) => delete clozeAnswers[Number(k)]);
        Object.keys(checkResults).forEach((k) => delete checkResults[Number(k)]);
    }
);
</script>
