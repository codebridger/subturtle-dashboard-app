import mixpanel, { type Config } from 'mixpanel-browser';

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

        mixpanel.register({
            app: 'dashboard',
        });

        const router = useRouter();

        // Track page view when route changes
        router.afterEach((_to, _from, failure) => {
            if (!failure) {
                waitForAuth(() => {
                    mixpanel.track_pageview();
                }).catch((error) => {
                    console.error('Failed to track page view:', error);
                });
            }
        });

        // Track user login/logout
        watch(
            isLogin,
            () => {
                if (isLogin.value === true) {
                    mixpanel.identify(authUser.value?.id);
                    mixpanel.people.set({
                        $email: authUser.value?.email,
                    });
                } else {
                    mixpanel.reset();
                }
            },
            { immediate: true }
        );
    } catch (error) {
        console.error('Failed to initialize mixpanel:', error);
    }
});

export const analytic = mixpanel;
