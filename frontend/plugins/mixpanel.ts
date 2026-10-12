import mixpanel, { type Config } from 'mixpanel-browser';

// Super properties registered on every event. Doc: docs/metrics/instrumentation.md
// ("Session Properties"). Re-registered after reset(), which clears them.
const SUPER_PROPERTIES = { app: 'dashboard' };

let initialized = false;

/**
 * Attach this browser's events to the signed-in user. Called from the profile
 * store's bootstrap, which runs on every boot with a stored session and after an
 * explicit login, so restored sessions are identified too — not just logins.
 *
 * Identity can't be driven by watching `isLogin`: `@modular-rest/client`'s
 * `authentication` is a plain object, so a computed over it never updates. The
 * old watcher saw `false` once at startup and called reset(), which wiped `app`
 * and minted a new anonymous `$device:` id on every load.
 */
export function identifyAnalyticsUser(user: { id?: string; email?: string } | null | undefined) {
    if (!initialized || !user?.id) return;
    try {
        mixpanel.identify(user.id);
        if (user.email) mixpanel.people.set({ $email: user.email });
    } catch (error) {
        console.error('Failed to identify analytics user:', error);
    }
}

/** On logout: forget the user, then restore the super properties reset() cleared. */
export function resetAnalyticsUser() {
    if (!initialized) return;
    try {
        mixpanel.reset();
        mixpanel.register(SUPER_PROPERTIES);
    } catch (error) {
        console.error('Failed to reset analytics user:', error);
    }
}

export default defineNuxtPlugin((nuxtApp) => {
    const config = useRuntimeConfig();

    // Only initialize if we have the required token
    if (!config.public.MIXPANEL_PROJECT_TOKEN) {
        console.warn('Mixpanel token not found, skipping initialization');
        return;
    }

    let mixpanelConfig: Partial<Config> = {
        debug: config.public.isNotProduction,
        // aws proxy link
        api_host: config.public.MIXPANEL_API_HOST || 'https://api-js.mixpanel.com',
        api_method: 'POST',
    };

    try {
        mixpanel.init(config.public.MIXPANEL_PROJECT_TOKEN, mixpanelConfig);

        mixpanel.register(SUPER_PROPERTIES);
        initialized = true;

        const router = useRouter();

        // Track a page view per route change, right away so it records this
        // route's URL. It used to wait on `waitForAuth`, whose cached computed
        // could stay false for the life of the tab and drop every view. The auth
        // middleware has already restored (and identified) the session by now.
        router.afterEach((to, _from, failure) => {
            if (failure) return;
            // The OAuth return URL carries the user's JWT; never send it.
            if (to.path === '/auth/login_with_token') return;
            try {
                mixpanel.track_pageview();
            } catch (error) {
                console.error('Failed to track page view:', error);
            }
        });
    } catch (error) {
        console.error('Failed to initialize mixpanel:', error);
    }
});

export const analytic = mixpanel;
