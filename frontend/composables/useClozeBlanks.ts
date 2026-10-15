import { computed, reactive, ref, watch } from 'vue';
import type { Chunk } from '~/types/database.type';
import type { ReviewResult } from '~/types/language.type';
import { combineResults, gradeClozeAnswer, reasonFromServer, type ClozeReason } from '~/utils/clozeCheck';

/**
 * A chunk with its cue (B-15): the base form (`lemma`), the form asked for (`form`, e.g.
 * "past participle") and other spellings that count as right. Older phrases have none of them.
 */
export type ClozeChunk = Chunk & { lemma?: string; form?: string; acceptedAnswers?: string[] };

/**
 * Optional server check (`check-cloze-answer`). Returns null when the server cannot judge
 * (function missing, several blanks), and the local rules decide.
 */
export type ClozeServerCheck = (answer: string, blankIndex: number) => Promise<{ result: ReviewResult; expected: string; reason?: string } | null>;

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
export function useClozeBlanks(
    getSentence: () => string | null | undefined,
    getChunks: () => Chunk[] | null | undefined,
    opts: { language?: () => string | null | undefined; serverCheck?: ClozeServerCheck } = {}
) {
    const clozeAnswers = reactive<Record<number, string>>({});
    const clozeChecked = ref(false);
    const checkResults = reactive<Record<number, boolean>>({});
    /** The three-way result per blank (Q4): right, close ("Almost") or wrong, with why. */
    const gradeResults = reactive<Record<number, { result: ReviewResult; reason: ClozeReason; expected: string }>>({});

    const clozeData = computed(() => buildClozeData(getSentence(), getChunks()));

    function gradeBlank(blankIndex: number, answer: string, chunk?: ClozeChunk) {
        return gradeClozeAnswer(clozeAnswers[blankIndex] || '', answer, {
            acceptedAnswers: chunk?.acceptedAnswers,
            lemma: chunk?.lemma,
            language: opts.language?.() ?? null,
        });
    }

    function isBlankCorrect(blankIndex: number, answer: string) {
        return gradeBlank(blankIndex, answer).result === 'right';
    }

    // Snapshot the result of every blank; can be pressed repeatedly. The local rules answer at
    // once; the server's check, when there is one, replaces them when it lands.
    function checkCloze() {
        if (!clozeData.value) return;
        clozeData.value.blanks.forEach((b) => {
            const grade = gradeBlank(b.blankIndex, b.answer, b.chunk as ClozeChunk);
            gradeResults[b.blankIndex] = { ...grade, expected: b.answer };
            checkResults[b.blankIndex] = grade.result === 'right';
        });
        clozeChecked.value = true;

        const serverCheck = opts.serverCheck;
        if (!serverCheck) return;
        clozeData.value.blanks.forEach((b) => {
            const typed = clozeAnswers[b.blankIndex] || '';
            if (!typed.trim()) return;
            serverCheck(typed, b.blankIndex)
                .then((res) => {
                    if (!res || clozeAnswers[b.blankIndex] !== typed) return;
                    const local = gradeResults[b.blankIndex];
                    // An older server sent no reason: keep the local one when both say "close".
                    const reason: ClozeReason =
                        res.reason || res.result !== 'close' ? reasonFromServer(res.reason, res.result) : local?.reason === 'accent' ? 'accent' : 'ending';
                    gradeResults[b.blankIndex] = { result: res.result, reason, expected: res.expected || b.answer };
                    checkResults[b.blankIndex] = res.result === 'right';
                })
                .catch(() => {
                    // The local result stands.
                });
        });
    }

    /** The card's result: the weakest blank. Null until Check is pressed. */
    const cardResult = computed<ReviewResult | null>(() => {
        if (!clozeData.value || !clozeChecked.value) return null;
        return combineResults(clozeData.value.blanks.map((b) => gradeResults[b.blankIndex]?.result ?? 'wrong'));
    });

    // Empty just the blanks that were wrong on the last check and return to the neutral (unchecked)
    // state, so the learner can retype and check again. Correct answers keep their text.
    function clearWrong() {
        if (!clozeData.value) return;
        clozeData.value.blanks.forEach((b) => {
            if (checkResults[b.blankIndex] === false) delete clozeAnswers[b.blankIndex];
        });
        Object.keys(checkResults).forEach((k) => delete checkResults[Number(k)]);
        Object.keys(gradeResults).forEach((k) => delete gradeResults[Number(k)]);
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
        Object.keys(gradeResults).forEach((k) => delete gradeResults[Number(k)]);
    });

    return {
        clozeData,
        clozeAnswers,
        clozeChecked,
        checkResults,
        gradeResults,
        cardResult,
        isBlankCorrect,
        checkCloze,
        clearWrong,
        allBlanksCorrect,
        wrongCount,
    };
}
