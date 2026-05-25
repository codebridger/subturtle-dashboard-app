import { describe, it, expect } from 'vitest';
import { formatDuration, formatSessionDuration } from './duration';

describe('formatDuration', () => {
    it('formats sub-minute spans in seconds', () => {
        expect(formatDuration(0)).toBe('0s');
        expect(formatDuration(45_000)).toBe('45s');
    });

    it('formats minute spans as minutes and seconds', () => {
        expect(formatDuration(5 * 60_000 + 23_000)).toBe('5m 23s');
        expect(formatDuration(60_000)).toBe('1m 0s');
    });

    it('formats hour-plus spans as hours and minutes', () => {
        expect(formatDuration(60 * 60_000 + 5 * 60_000)).toBe('1h 5m');
    });

    it('rounds to the nearest second', () => {
        expect(formatDuration(1_600)).toBe('2s');
    });

    it('clamps negative and non-finite input to zero', () => {
        expect(formatDuration(-5_000)).toBe('0s');
        expect(formatDuration(NaN)).toBe('0s');
    });
});

describe('formatSessionDuration', () => {
    it('computes the span between createdAt and updatedAt', () => {
        const created = new Date('2026-05-25T10:00:00.000Z');
        const updated = new Date('2026-05-25T10:05:23.000Z');
        expect(formatSessionDuration(created, updated)).toBe('5m 23s');
    });

    it('accepts ISO date strings', () => {
        expect(formatSessionDuration('2026-05-25T10:00:00.000Z', '2026-05-25T10:00:45.000Z')).toBe('45s');
    });

    it('clamps when updatedAt precedes createdAt', () => {
        expect(formatSessionDuration('2026-05-25T10:05:00.000Z', '2026-05-25T10:00:00.000Z')).toBe('0s');
    });
});
