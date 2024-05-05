const fs = require("fs");
const path = require("path");

function getLocals(ext = ".js") {
  const langDir = path.resolve(__dirname, "lang");
  const files = fs.readdirSync(langDir);

  return files
    .filter((file: string) => file.endsWith(ext))
    .map((file: string) => {
      const iso = file.replace(ext, "");
      const code = iso.split("-")[0];

      return { code, iso: code, file };
    });
}

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: process.env.NODE_ENV === "development" },

  app: {
    head: {
      script: [
        {
          src: "https://raw.githubusercontent.com/timdream/wordcloud2.js/gh-pages/src/wordcloud2.js",
        },
      ],
    },
  },

  runtimeConfig: {
    public: {
      API_URL: process.env.NUXT_API_URL,
    },
  },

  modules: ["@pinia/nuxt", "@nuxtjs/i18n"],

  // @ts-ignore
  i18n: {
    locales: getLocals(),
    defaultLocale: "en",
    langDir: "lang",
  },

  extends: [
    /**
     * This extends the base Tairo layer.
     *
     * Alternatively you can use the following:
     * 'github:cssninjaStudio/tairo/layers/xxx#v1.0.0'
     *
     * And set GIGET_AUTH=<github_token> in your .env file
     *
     * This would allows you to create an empty git repository
     * with only your source code and no demo.
     */

    [
      "gh:cssninjaStudio/tairo/layers/tairo-layout-collapse#v1.5.1",
      {
        install: true,
        giget: { auth: process.env.GIGET_AUTH_TOKEN },
      },
    ],
    [
      "gh:cssninjaStudio/tairo/layers/tairo#v1.5.1",
      {
        install: true,
        giget: { auth: process.env.GIGET_AUTH_TOKEN },
      },
    ],
  ] as any[],

  /**
   * Load local font with @fontsource packages
   * @see https://fontsource.org/
   */
  css: [
    "@fontsource-variable/inter/index.css",
    "@fontsource-variable/karla/index.css",
  ],
});
