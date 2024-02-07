export default defineNuxtConfig({
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
      "gh:cssninjaStudio/tairo/layers/tairo-layout-sidebar#v1.3.0",
      {
        install: true,
        giget: { auth: process.env.GIGET_AUTH },
      },
    ],
    [
      "gh:cssninjaStudio/tairo/layers/tairo#v1.3.0",
      {
        install: true,
        giget: { auth: process.env.GIGET_AUTH },
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
