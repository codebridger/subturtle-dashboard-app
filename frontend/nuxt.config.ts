import { version as APP_VERSION } from './package.json';

export default defineNuxtConfig({
    compatibilityDate: '2024-10-13',
    devtools: { enabled: true },
    ssr: false,
    sourcemap: {
        server: true,
        client: true,
    },

    runtimeConfig: {
        public: {
            BASE_URL_API: process.env.NUXT_PUBLIC_BASE_URL_API,
            isProduction: process.env.NUXT_PUBLIC_MODE?.toLowerCase() === 'production',
            isNotProduction: process.env.NUXT_PUBLIC_MODE?.toLowerCase() !== 'production',
            mode: process.env.NUXT_PUBLIC_MODE,
            MIXPANEL_PROJECT_TOKEN: process.env.NUXT_PUBLIC_MIXPANEL_PROJECT_TOKEN,
            MIXPANEL_API_HOST: process.env.NUXT_PUBLIC_MIXPANEL_API_HOST,
            chromeWebStoreUrl: process.env.NUXT_PUBLIC_CHROME_WEB_STORE_URL || 'https://chromewebstore.google.com/detail/PLACEHOLDER',
            STRIPE_PUBLISHABLE_KEY: process.env.NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
            // Baked in at build time from package.json (owned by semantic-release).
            APP_VERSION,
        },
    },

    vite: {
        ssr: {
            noExternal: ['pilotui'],
        },
        // subturtle-ui lives at ../ui and is linked in, so Vite has to be allowed to read
        // outside the app root. It ships prebuilt ESM, so pre-bundling it only adds a stale
        // copy between `yarn dev` here and `yarn dev` (build --watch) there.
        optimizeDeps: {
            exclude: ['subturtle-ui'],
        },
        server: {
            fs: {
                allow: ['..'],
            },
        },
    },

    app: {
        head: {
            title: 'Subturtle Dashboard',
            titleTemplate: '%s | Subturtle Dashboard',
            htmlAttrs: {
                lang: 'en',
            },
            meta: [
                { charset: 'utf-8' },
                {
                    name: 'viewport',
                    content: 'width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no',
                },
                { hid: 'description', name: 'description', content: '' },
                { name: 'format-detection', content: 'telephone=no' },
            ],
            link: [
                { rel: 'icon', type: 'image/x-icon', href: '/favicon.png' },
                {
                    rel: 'stylesheet',
                    href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap',
                },
            ],
        },
    },

    css: ['pilotui/style.css', '~/assets/css/app.css', 'subturtle-ui/style.css'],

    postcss: {
        plugins: {
            tailwindcss: {},
            autoprefixer: {},
        },
    },

    plugins: ['~/plugins/mixpanel.ts'],

    modules: ['@pinia/nuxt', '@nuxtjs/i18n', '@cssninja/nuxt-toaster', '@nuxtjs/color-mode'],

    /**
     * The theme layer for the `st-` design system. `classSuffix: ''` makes the module write a bare
     * `class="light"` / `class="dark"` on <html> — subturtle-ui re-points its tokens under
     * `html.dark`, and both Tailwind builds are `darkMode: 'class'`, so one class drives everything.
     *
     * The module also injects a blocking pre-paint script into the SPA shell's <head>, which is what
     * keeps a hard reload from flashing the wrong theme. `system` is resolved in that script from
     * `prefers-color-scheme`, so it is flash-free too; useAppTheme() keeps it following live
     * afterwards.
     *
     * pilotui writes its own theme to localStorage under `theme`, so this uses a distinct key rather
     * than fighting it over one entry — plugins/theme.client.ts mirrors this preference into
     * pilotui's store.
     *
     * `disableTransition: false` turns OFF the module's own cross-fade guard (it injects an
     * anonymous <style> element). We do the same job with an `html.theme-switching` class in
     * plugins/theme.client.ts, whose rule ships in subturtle-ui's stylesheet — one mechanism,
     * inspectable in devtools. Do not re-enable it; the two would stack.
     */
    colorMode: {
        classSuffix: '',
        preference: 'system',
        fallback: 'light',
        storageKey: 'subturtle.theme',
        disableTransition: false,
    },

    i18n: {
        locales: [{ code: 'en', file: 'en.json' }],
        lazy: true,
        defaultLocale: 'en',
        strategy: 'no_prefix',
        langDir: 'locales/',
    },

    //   vite: {
    //     optimizeDeps: { include: ['quill'] },
    //   },

    router: {
        options: {
            linkExactActiveClass: 'active',
            hashMode: true,
        },
    },

    // Make sure your build options are properly set
    build: {
        transpile: ['mixpanel-browser'],
    },
});
