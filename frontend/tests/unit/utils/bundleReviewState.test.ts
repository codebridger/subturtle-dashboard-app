import { describe, it, expect } from 'vitest';
import { bundlePhraseIds, dueCountFor, isNeverPractised } from '~/utils/bundleReviewState';

describe('bundlePhraseIds', () => {
    it('reads raw id arrays', () => {
        expect(bundlePhraseIds({ phrases: ['a', 'b'] })).toEqual(['a', 'b']);
    });

    it('reads populated phrase documents', () => {
        expect(bundlePhraseIds({ phrases: [{ _id: 'a' }, { _id: 'b' }] })).toEqual(['a', 'b']);
    });

    it('survives a bundle with no phrases at all', () => {
        expect(bundlePhraseIds({})).toEqual([]);
        expect(bundlePhraseIds(null)).toEqual([]);
    });
});

describe('dueCountFor', () => {
    const due = new Set(['a', 'c', 'z']);

    it('counts only this bundle’s due phrases', () => {
        expect(dueCountFor({ phrases: ['a', 'b', 'c', 'd'] }, due)).toBe(2);
    });

    it('is zero when nothing in the bundle is due', () => {
        expect(dueCountFor({ phrases: ['b', 'd'] }, due)).toBe(0);
    });

    // The RPC can fail (it is best-effort) — the tiles must then read "N phrases", not "0 due".
    it('is zero when review state never loaded', () => {
        expect(dueCountFor({ phrases: ['a', 'c'] }, new Set())).toBe(0);
    });

    it('matches ObjectId-shaped and populated phrases alike', () => {
        expect(dueCountFor({ phrases: [{ _id: 'a' }, { _id: 'b' }] }, due)).toBe(1);
    });
});

describe('isNeverPractised', () => {
    const tracked = new Set(['a', 'b']);

    it('is false once any phrase has entered the review system', () => {
        expect(isNeverPractised({ phrases: ['b', 'x'] }, tracked)).toBe(false);
    });

    it('is true when none of them have', () => {
        expect(isNeverPractised({ phrases: ['x', 'y'] }, tracked)).toBe(true);
    });

    it('treats an empty bundle as never practised', () => {
        expect(isNeverPractised({ phrases: [] }, tracked)).toBe(true);
    });
});
