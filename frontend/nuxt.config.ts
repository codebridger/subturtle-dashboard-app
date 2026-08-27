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

    modules: ['@pinia/nuxt', '@nuxtjs/i18n', '@cssninja/nuxt-toaster'],

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
