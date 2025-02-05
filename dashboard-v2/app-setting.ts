import { useAppStore } from '@/stores/index';

export default {
  toggleLanguage(item: any, setLocale: any) {
    const store = useAppStore();

    let lang: any = null;
    if (item) {
      lang = item;
    } else {
      let code = store.locale || null;
      if (!code) {
        code = localStorage.getItem('i18n_locale');
      }

      item = store.languageList.find((d: any) => d.code === code);
      if (item) {
        lang = item;
      }
    }

    if (!lang) {
      lang = store.languageList.find((d: any) => d.code === 'en');
    }

    store.toggleLocale(lang.code, setLocale);
    return lang;
  },
};
