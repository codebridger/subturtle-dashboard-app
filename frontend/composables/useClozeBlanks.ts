import { computed, reactive, ref, watch } from 'vue';
import type { Chunk } from '~/types/database.type';

export type ClozeSegment =
    | { type: 'text'; value: string }
    | { type: 'blank'; blankIndex: number; answer: string; chunk: Chunk };

export interface ClozeData {
    segments: ClozeSegment[];
    blanks: { blankIndex: number; answer: string; chunk: Chunk }[];
}

/**
 * Pure builder for a multi-blank cloze: blanks every confirmed chunk that appears in the source
 * sentence (non-overlapping, in order). Returns null when there's no sentence or no chunk lands in
 * it — callers treat null as "fall back to the recognition card".
 */
export function buildClozeData(sentence: string | null | undefined, chunks: Chunk[] | null | undefined): ClozeData | null {
    const text = sentence || '';
    const list = chunks || [];
    if (!text || !list.length) return null;

    const lower = text.toLowerCase();

    // First occurrence of each chunk inside the sentence.
    const hits = list
        .map((chunk) => {
            const t = (chunk.text || '').trim();
            if (!t) return null;
            const start = lower.indexOf(t.toLowerCase());
            if (start === -1) return null;
            return { start, end: start + t.length, chunk, answer: text.slice(start, start + t.length) };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null)
        .sort((a, b) => a.start - b.start);

    if (!hits.length) return null;

    // Drop overlapping chunks (keep the earliest) so blanks never collide.
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
        if (hit.start > cursor) segments.push({ type: 'text', value: text.slice(cursor, hit.start) });
        segments.push({ type: 'blank', blankIndex, answer: hit.answer, chunk: hit.chunk });
        cursor = hit.end;
    });
    if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });

    const blanks = placed.map((hit, blankIndex) => ({ blankIndex, answer: hit.answer, chunk: hit.chunk }));
    return { segments, blanks };
}

/**
 * Reactive state for the fill-in-the-blank cloze exercise: the per-blank answers, the snapshot of
 * correctness from the last Check press, and the check/clear actions. Feedback only updates on
 * Check, so the learner can edit and re-check as many times as they like. State resets whenever the
 * source sentence changes (i.e. a new card).
 */
export function useClozeBlanks(getSentence: () => string | null | undefined, getChunks: () => Chunk[] | null | undefined) {
    const clozeAnswers = reactive<Record<number, string>>({});
    const clozeChecked = ref(false);
    const checkResults = reactive<Record<number, boolean>>({});

    const clozeData = computed(() => buildClozeData(getSentence(), getChunks()));

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

    // Reset everything when the card (sentence) changes.
    watch(getSentence, () => {
        clozeChecked.value = false;
        Object.keys(clozeAnswers).forEach((k) => delete clozeAnswers[Number(k)]);
        Object.keys(checkResults).forEach((k) => delete checkResults[Number(k)]);
    });

    return {
        clozeData,
        clozeAnswers,
        clozeChecked,
        checkResults,
        isBlankCorrect,
        checkCloze,
        clearWrong,
        allBlanksCorrect,
        wrongCount,
    };
}
