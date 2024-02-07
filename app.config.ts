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
    title: "Tairo Quick Starter",
    panels: [
      {
        // Unique name of the panel, used to open it
        name: "menu",
        component: "PanelComponent",
        // The position of the panel
        position: "left",
        // Whether to show an overlay when the panel is open
        overlay: true,
      },
    ],
  },
});
