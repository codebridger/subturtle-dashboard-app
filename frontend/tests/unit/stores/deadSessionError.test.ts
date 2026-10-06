import { describe, it, expect } from 'vitest';

import { isDeadSessionError } from '~/utils/deadSession';

describe('isDeadSessionError', () => {
    it('recognises the bodies a dead session comes back with', () => {
        expect(isDeadSessionError('User not found')).toBe(true);
        expect(isDeadSessionError('Precondition Failed')).toBe(true);
        expect(isDeadSessionError({ hasError: true, error: 'Precondition Failed' })).toBe(true);
        expect(isDeadSessionError({ status: 'error', message: "FORBIDDEN: a function can only act on the signed-in user's account." })).toBe(true);
    });

    it('leaves ordinary failures alone', () => {
        expect(isDeadSessionError({ status: 'error', message: 'TIER_LIMIT_REACHED: "weekly_insights"' })).toBe(false);
        expect(isDeadSessionError('Network Error')).toBe(false);
        expect(isDeadSessionError(undefined)).toBe(false);
    });
});
