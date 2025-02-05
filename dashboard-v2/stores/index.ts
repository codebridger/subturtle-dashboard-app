import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    languageList: [
      { code: 'zh', name: 'Chinese' },
      { code: 'da', name: 'Danish' },
      { code: 'en', name: 'English' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'el', name: 'Greek' },
      { code: 'hu', name: 'Hungarian' },
      { code: 'it', name: 'Italian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pl', name: 'Polish' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'es', name: 'Spanish' },
      { code: 'sv', name: 'Swedish' },
      { code: 'tr', name: 'Turkish' },
      { code: 'ae', name: 'Arabic' },
    ],

    isShowMainLoader: false,

    locale: 'en',
  }),

  actions: {
    toggleLocale(payload: any = null, setLocale: any) {
      // payload = payload || this.locale;
      // localStorage.setItem('i18n_locale', payload);
      // this.locale = payload;
      // setLocale(payload);
    },
  },
  getters: {},
});
