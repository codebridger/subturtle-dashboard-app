import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
    state: () => ({
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
