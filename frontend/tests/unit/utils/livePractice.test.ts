import { describe, it, expect } from 'vitest';
import { returnToLabelKey } from '~/utils/livePractice';

describe('returnToLabelKey', () => {
    it('names the destination returnTo goes to', () => {
        expect(returnToLabelKey('/bundles/abc123')).toBe('live-practice.recap.back-to-bundle');
        expect(returnToLabelKey('/board')).toBe('live-practice.recap.back-to-board');
        expect(returnToLabelKey('/sessions/new')).toBe('live-practice.recap.back-to-sessions');
    });

    it('ignores a query, a hash and a trailing slash', () => {
        expect(returnToLabelKey('/sessions/new?bundle=abc')).toBe('live-practice.recap.back-to-sessions');
        expect(returnToLabelKey('/board/')).toBe('live-practice.recap.back-to-board');
        expect(returnToLabelKey('/bundles/abc#top')).toBe('live-practice.recap.back-to-bundle');
    });

    it('falls back to a neutral label for anything else', () => {
        expect(returnToLabelKey('/bundles')).toBe('live-practice.recap.done');
        expect(returnToLabelKey('/statistic')).toBe('live-practice.recap.done');
        expect(returnToLabelKey('')).toBe('live-practice.recap.done');
    });
});
