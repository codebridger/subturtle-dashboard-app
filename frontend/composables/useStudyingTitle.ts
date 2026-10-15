import { useLanguageStore } from '~/stores/language';

/**
 * A session title that names the language being studied (D-13): "Review · German". Just the
 * plain title while multilingual is off, so the English-only screens read as before.
 */
export function useStudyingTitle(key: string) {
    const { t } = useI18n();
    const language = useLanguageStore();
    return computed(() => (language.enabled ? `${t(key)} · ${language.nameOf(language.activeLanguage)}` : t(key)));
}
