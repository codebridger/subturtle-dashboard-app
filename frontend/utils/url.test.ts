import { describe, it, expect, vi } from 'vitest';
import { getQueryParams, getQueryParam } from './url';

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
