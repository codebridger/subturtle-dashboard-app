import mixpanel, { type Config } from 'mixpanel-browser';

// Super properties registered on every event. Doc: docs/metrics/instrumentation.md
// ("Session Properties"). Re-registered after reset(), which clears them.
const SUPER_PROPERTIES = { app: 'dashboard' };

let initialized = false;

/**
 * The learner's active and own language (D-22), sent with every event as `learning_language`
 * and `l1`. Kept here so they can be registered again after reset(), which clears them, and
 * after a language switch. Null while multilingual is off: nothing is registered then.
 */
let languageProperties: { learning_language: string; l1: string | null } | null = null;

/** Called by the language store whenever the active or own language changes. */
export function registerLanguageAnalytics(props: { learning_language: string; l1: string | null } | null) {
    const previous = languageProperties;
    languageProperties = props;
    if (!initialized) return;
    try {
        if (props) mixpanel.register(props);
        else if (previous) {
            mixpanel.unregister('learning_language');
            mixpanel.unregister('l1');
        }
    } catch (error) {
        console.error('Failed to register language properties:', error);
    }
}

/**
 * Attach this browser's events to the signed-in user. Called from the profile
 * store's bootstrap, which runs on every boot with a stored session and after an
 * explicit login, so restored sessions are identified too — not just logins.
 *
 * Identity is set here rather than by watching `isLogin`: the client signs in
 * anonymously first, so a watcher would see `false` at startup and call reset(),
 * which wipes `app` and mints a new `$device:` id on every load (and did, back
 * when `isLogin` was a computed that never updated).
 */
export function identifyAnalyticsUser(user: { id?: string; email?: string } | null | undefined) {
    if (!initialized || !user?.id) return;
    try {
        mixpanel.identify(user.id);
        if (user.email) mixpanel.people.set({ $email: user.email });
        if (languageProperties) mixpanel.register(languageProperties);
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
        // The next account sets its own languages when its language state loads.
        languageProperties = null;
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
        // route's URL. The auth middleware has already restored (and identified)
        // the session by now, so there is nothing to wait for.
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
