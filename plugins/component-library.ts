// @ts-ignore
import { defineNuxtPlugin as init } from '@codebridger/lib-vue-components/nuxt';

export default defineNuxtPlugin({
  name: '@codebridger/lib-vue-components',
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
