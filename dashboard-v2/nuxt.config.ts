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
      BASE_URL_API: process.env.BASE_URL_API,
    },
  },

  vite: {
    ssr: {
      noExternal: ['@tiny-ideas-ir/lib-vue-components'],
    },
  },

  app: {
    head: {
      title: 'Instagram Automation Saas',
      titleTemplate: '%s | Instagram Automation Saas',
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

  css: ['~/assets/css/app.css', '@tiny-ideas-ir/lib-vue-components/style.css'],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  modules: ['@pinia/nuxt', '@nuxtjs/i18n'],

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
    options: { linkExactActiveClass: 'active' },
  },

  // Make sure your build options are properly set
  build: {
    transpile: ['@tiny-ideas-lr/lib-vue-components'],
  },
});
