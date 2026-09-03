import { describe, it, expect, vi } from 'vitest';
import { getQueryParams, getQueryParam, phraseSourceLabel, isVideoSource } from './url';

describe('URL Utils', () => {
    beforeEach(() => {
        // Mock window.location
        Object.defineProperty(window, 'location', {
            value: {
                search: '?param1=value1&param2=value2',
            },
            writable: true,
        });
    });

    it('should get query parameters', () => {
        const params = getQueryParams();
        expect(params).toBeInstanceOf(URLSearchParams);
        expect(params.get('param1')).toBe('value1');
        expect(params.get('param2')).toBe('value2');
    });

    it('should get specific query parameter', () => {
        const value = getQueryParam('param1');
        expect(value).toBe('value1');
    });

    it('should return null for non-existent parameter', () => {
        const value = getQueryParam('nonexistent');
        expect(value).toBeNull();
    });
});

describe('phraseSourceLabel', () => {
    it('names a known host', () => {
        expect(phraseSourceLabel('https://www.netflix.com/watch/80192098')).toBe('Netflix');
        expect(phraseSourceLabel('https://m.youtube.com/watch?v=abc')).toBe('YouTube');
        expect(phraseSourceLabel('https://youtu.be/abc')).toBe('YouTube');
    });

    it('falls back to the bare hostname', () => {
        expect(phraseSourceLabel('https://www.bbc.com/news/article')).toBe('bbc.com');
    });

    it('returns null when there is no usable source', () => {
        expect(phraseSourceLabel(undefined)).toBeNull();
        expect(phraseSourceLabel('')).toBeNull();
        expect(phraseSourceLabel('not a url')).toBeNull();
    });

    it('marks video sources', () => {
        expect(isVideoSource('https://www.netflix.com/watch/1')).toBe(true);
        expect(isVideoSource('https://www.bbc.com/news')).toBe(false);
        expect(isVideoSource(null)).toBe(false);
    });
});
