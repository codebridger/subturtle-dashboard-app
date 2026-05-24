import { describe, it, expect } from 'vitest';
import { buildClozeData } from '~/composables/useClozeBlanks';
import type { Chunk } from '~/types/database.type';

const chunk = (text: string, extra: Partial<Chunk> = {}): Chunk => ({
    text,
    type: 'other',
    confidence: 0.9,
    ...extra,
});

describe('buildClozeData', () => {
    it('returns null when there is no sentence', () => {
        expect(buildClozeData('', [chunk('had to')])).toBeNull();
        expect(buildClozeData(null, [chunk('had to')])).toBeNull();
    });

    it('returns null when there are no chunks', () => {
        expect(buildClozeData('we had to decide quickly', [])).toBeNull();
        expect(buildClozeData('we had to decide quickly', null)).toBeNull();
    });

    it('returns null when no chunk appears in the sentence', () => {
        // Hyphenation mismatch: chunk "Multi step tasks" not found in "Multi-step tasks ...".
        expect(buildClozeData('Multi-step tasks are great', [chunk('Multi step tasks')])).toBeNull();
    });

    it('blanks a single chunk and splits the sentence around it', () => {
        const data = buildClozeData('we had to decide quickly', [chunk('had to')]);
        expect(data).not.toBeNull();
        expect(data!.blanks).toHaveLength(1);
        expect(data!.blanks[0].answer).toBe('had to');
        expect(data!.segments).toEqual([
            { type: 'text', value: 'we ' },
            { type: 'blank', blankIndex: 0, answer: 'had to', chunk: expect.objectContaining({ text: 'had to' }) },
            { type: 'text', value: ' decide quickly' },
        ]);
    });

    it('preserves the original casing of the matched answer (case-insensitive match)', () => {
        const data = buildClozeData('Had To run', [chunk('had to')]);
        expect(data!.blanks[0].answer).toBe('Had To');
    });

    it('blanks multiple chunks ordered by their position in the sentence', () => {
        const data = buildClozeData('we had to decide quickly, right?', [chunk('right?'), chunk('had to')]);
        expect(data!.blanks.map((b) => b.answer)).toEqual(['had to', 'right?']);
        const blankSegs = data!.segments.filter((s) => s.type === 'blank');
        expect(blankSegs).toHaveLength(2);
    });

    it('drops overlapping chunks, keeping the earliest', () => {
        // "no match" and "no match for" overlap — only the earliest-starting, then non-overlapping, survive.
        const data = buildClozeData('they are no match for us', [chunk('no match for'), chunk('match')]);
        expect(data!.blanks).toHaveLength(1);
        expect(data!.blanks[0].answer).toBe('no match for');
    });

    it('skips chunks not present but keeps the ones that are', () => {
        const data = buildClozeData('we had to decide', [chunk('missing'), chunk('had to')]);
        expect(data!.blanks).toHaveLength(1);
        expect(data!.blanks[0].answer).toBe('had to');
    });
});
