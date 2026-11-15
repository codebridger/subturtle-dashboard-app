import { useProfileStore } from '~/stores/profile';
import { useLanguageStore } from '~/stores/language';

/**
 * The screens a learner with no language yet may open (D-20): the steps themselves, and the
 * plans page, which a Starter learner whose removed language still holds its slot needs.
 */
const FIRST_RUN_PATHS = ['/settings/languages/add', '/settings/languages/test', '/practice/starter-pack', '/settings/profile', '/settings/subscription'];

export default defineNuxtRouteMiddleware(async (to, _from) => {
    const profileStore = useProfileStore();
    const loginRoute = '/auth/login';

    if (to.fullPath.includes(loginRoute)) {
        return true;
    }

    if (!profileStore.isLogin) {
        await profileStore.loginWithLastSession();
    }

    if (profileStore.isLogin) {
        // First run (D-20, Q11): a new account picks a language before anything else. Only an
        // account the server marks `needs_language` is gated; existing learners are English.
        const language = useLanguageStore();
        if (language.needsLanguage && !FIRST_RUN_PATHS.includes(to.path)) {
            return navigateTo({ path: '/settings/languages/add', query: { first: '1' } });
        }
        if (to.fullPath === '/' || to.fullPath === '/#') {
            return navigateTo('/statistic');
        }
        return true;
    }

    const shouldIncludeRedirect = to.fullPath && to.fullPath !== '/' && to.fullPath !== '/#';
    return navigateTo(shouldIncludeRedirect ? `${loginRoute}?redirect=${encodeURIComponent(to.fullPath)}` : loginRoute);
});
