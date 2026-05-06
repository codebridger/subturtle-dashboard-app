import { useProfileStore } from '~/stores/profile';

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
        if (to.fullPath === '/' || to.fullPath === '/#') {
            return navigateTo('/statistic');
        }
        return true;
    }

    const shouldIncludeRedirect = to.fullPath && to.fullPath !== '/' && to.fullPath !== '/#';
    return navigateTo(shouldIncludeRedirect ? `${loginRoute}?redirect=${encodeURIComponent(to.fullPath)}` : loginRoute);
});
