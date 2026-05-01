// @ts-ignore
import { defineNuxtPlugin as init } from 'pilotui/nuxt';

export default defineNuxtPlugin({
  name: 'pilotui',
  enforce: 'post',
  async setup(nuxtApp) {
    return init(nuxtApp, {
      prefix: 'CL',
      dontInstallPinia: true,
      dontInstallPopper: false,
      dontInstallPerfectScrollbar: false,
    });
  },
});
