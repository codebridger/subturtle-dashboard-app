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
        },
    },

    vite: {
        ssr: {
            noExternal: ['@codebridger/lib-vue-components'],
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
                    href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap',
                },
            ],
        },
    },

    css: ['@codebridger/lib-vue-components/style.css', '~/assets/css/app.css'],

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
        transpile: ['@tiny-ideas-lr/lib-vue-components', 'mixpanel-browser'],
    },
});
