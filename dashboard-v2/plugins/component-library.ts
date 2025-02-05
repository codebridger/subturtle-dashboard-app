// @ts-ignore
import { defineNuxtPlugin as init } from '@tiny-ideas-ir/lib-vue-components/nuxt';

export default defineNuxtPlugin({
  name: '@tiny-ideas-ir/lib-vue-components',
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
