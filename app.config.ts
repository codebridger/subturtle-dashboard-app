/**
 * This file is used to configure the app
 *
 * If you have the "Cannot find name 'defineAppConfig'.ts(2304)" error
 * update the root tsconfig.json file to include the following:
 *
 *  "extends": "./.app/.nuxt/tsconfig.json"
 *
 */

export default defineAppConfig({
  tairo: {
    title: "Subturtle",
    collapse: {
      circularMenu: {
        enabled: true,
        tools: [
          {
            component: "ThemeToggle",
          },
          {
            component: "ToolbarAccountMenu",
          },
        ],
      },
      toolbar: {
        enabled: true,
        showTitle: true,
        showNavBurger: true,
        tools: [
          {
            component: "ThemeToggle",
          },
          {
            component: "ToolbarAccountMenu",
          },
        ],
      },
    },
  },
});
