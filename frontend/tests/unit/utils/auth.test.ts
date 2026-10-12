import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authentication } from '@modular-rest/client';

// tests/setup.ts stubs computed/watch; this test needs the real reactivity system.
const vue = await vi.importActual<typeof import('vue')>('vue');
Object.assign(globalThis, { computed: vue.computed });

const { authUser, isLogin, isAnyUserLogin } = await import('~/utils/auth');

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('reactive auth state', () => {
    beforeEach(() => {
        (authentication as any).user = null;
        (authentication as any).token = null;
    });

    it('recomputes after the client signs in, instead of caching the first read', () => {
        expect(isLogin.value).toBe(false);
        expect(authUser.value).toBeNull();

        // What loginWithToken does once the token is verified.
        (authentication as any).token = 'jwt';
        (authentication as any).user = { id: 'u1', type: 'user' };

        expect(isLogin.value).toBe(true);
        expect(authUser.value?.id).toBe('u1');
    });

    it('tracks an anonymous token, which counts for isAnyUserLogin only', () => {
        (authentication as any).token = 'anon-jwt';
        (authentication as any).user = { id: 'a1', type: 'anonymous' };
        expect(isAnyUserLogin.value).toBe(true);
        expect(isLogin.value).toBe(false);
    });

    it('notifies watchers when the session changes', async () => {
        const seen: Array<string | undefined> = [];
        const stop = vue.watch(() => authUser.value?.id, (id) => seen.push(id));

        (authentication as any).user = { id: 'u1', type: 'user' };
        await flush();
        (authentication as any).user = { id: 'u2', type: 'user' };
        await flush();
        stop();

        expect(seen).toEqual(['u1', 'u2']);
    });

    it("keeps the client's own getters working", () => {
        (authentication as any).token = 'jwt';
        expect(authentication.getToken).toBe('jwt');
        expect(Object.keys(authentication)).toEqual(expect.arrayContaining(['user', 'token']));
    });
});
