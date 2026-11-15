import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const mp = vi.hoisted(() => ({
    init: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    track_pageview: vi.fn(),
    people: { set: vi.fn() },
}));
vi.mock('mixpanel-browser', () => ({ default: mp }));

let afterEach: (to: any, from: any, failure?: any) => void;
Object.assign(globalThis, {
    defineNuxtPlugin: (setup: any) => setup,
    useRuntimeConfig: () => ({ public: { MIXPANEL_PROJECT_TOKEN: 'tok', isNotProduction: true } }),
    useRouter: () => ({ afterEach: (cb: any) => (afterEach = cb) }),
});

const plugin = await import('~/plugins/mixpanel');

describe('dashboard Mixpanel identity', () => {
    beforeAll(() => {
        (plugin.default as any)({});
    });
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers app=dashboard at init and does not reset an anonymous boot', async () => {
        vi.resetModules();
        const fresh = await import('~/plugins/mixpanel');
        (fresh.default as any)({});
        expect(mp.register).toHaveBeenCalledWith({ app: 'dashboard' });
        expect(mp.reset).not.toHaveBeenCalled();
    });

    it('identifies the user and sets $email', () => {
        plugin.identifyAnalyticsUser({ id: 'u1', email: 'a@b.c' });
        expect(mp.identify).toHaveBeenCalledWith('u1');
        expect(mp.people.set).toHaveBeenCalledWith({ $email: 'a@b.c' });
    });

    it('ignores a missing user', () => {
        plugin.identifyAnalyticsUser(null);
        expect(mp.identify).not.toHaveBeenCalled();
    });

    it('re-registers app after reset on logout', () => {
        plugin.resetAnalyticsUser();
        expect(mp.reset).toHaveBeenCalled();
        expect(mp.register).toHaveBeenCalledWith({ app: 'dashboard' });
    });

    it('tracks a page view on every route but the token-bearing OAuth return', () => {
        afterEach({ path: '/settings/preferences' }, {});
        expect(mp.track_pageview).toHaveBeenCalledTimes(1);
        afterEach({ path: '/auth/login_with_token' }, {});
        afterEach({ path: '/board' }, {}, new Error('aborted'));
        expect(mp.track_pageview).toHaveBeenCalledTimes(1);
    });
});
