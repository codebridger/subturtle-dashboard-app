import { toastError, toastSuccess } from 'pilotui/toast';
import { useLanguageStore } from '~/stores/language';

/**
 * Switching the active language, the same from every control (header menu, Languages page):
 * the server makes it active, every language-scoped store reloads, and the learner lands on
 * that language's Today (D-03), where the board shows its skeleton until it has loaded.
 */
export function useLanguageSwitch() {
    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();

    async function switchTo(code: string, opts: { goToday?: boolean; toast?: boolean } = {}) {
        const { goToday = true, toast = false } = opts;
        try {
            // Navigate first so the old language's screen is not left showing new data.
            if (goToday) await router.push('/board');
            await language.switchLanguage(code);
            if (toast) toastSuccess(t('languages.switched', { language: language.nameOf(code) }), { position: 'top-end' });
            return true;
        } catch (error) {
            console.error('Language switch failed:', error);
            toastError(t('languages.switch-failed'), { position: 'top-end' });
            return false;
        }
    }

    return { switchTo };
}
