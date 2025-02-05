import { withShurikenUI } from "@shuriken-ui/tailwind";
import colors from "tailwindcss/colors";

const {
  iconsPlugin,
  getIconCollections,
} = require("@egoist/tailwindcss-icons");

/**
 * This is the Tailwind config file for the demo.
 * It extends the default config from @shuriken-ui/tailwind
 *
 * You can add/override your own customizations here.
 */
export default withShurikenUI({
  content: [],
  theme: {
    // Custom fonts (defaults values are commented out)
    fontFamily: {
      sans: ["Inter  Variable", "sans-serif"],
      heading: ["Inter  Variable", "sans-serif"],
      alt: ["Karla  Variable", "sans-serif"],
      mono: [
        "ui-monospace",
        "SFMono-Regular",
        "Menlo",
        "Monaco",
        "Consolas",
        '"Liberation Mono"',
        '"Courier New"',
        "monospace",
      ],
    },
    extend: {
      // Custom colors
      colors: {
        primary: colors.indigo,
        muted: colors.slate,
        info: colors.sky,
        success: colors.teal,
        warning: colors.amber,
        danger: colors.rose,
      },
    },
  },
  plugins: [
    iconsPlugin({
      // Select the icon collections you want to use
      // You can also ignore this option to automatically discover all icon collections you have installed
      collections: getIconCollections([
        "ph",
        "mdi",
        "icon-park-twotone",
        "tabler",
      ]),
      scale: 1.4,
    }),
  ],
});
