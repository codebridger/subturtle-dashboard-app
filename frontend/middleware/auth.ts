import { useProfileStore } from '~/stores/profile';

export default defineNuxtRouteMiddleware(async (to, _from) => {
    const profileStore = useProfileStore();
    const loginRoute = '/auth/login';

    // If already on login route, allow access
    if (to.fullPath.includes(loginRoute)) {
        return true;
    }

    // If not logged in, try to login with last session
    if (!profileStore.isLogin) {
        try {
            await profileStore.loginWithLastSession();
        } catch (error) {
            // If login fails, redirect to login page with original destination
            const shouldIncludeRedirect = to.fullPath && to.fullPath !== '/' && to.fullPath !== '/#';
            return navigateTo(shouldIncludeRedirect ? `${loginRoute}?redirect=${encodeURIComponent(to.fullPath)}` : loginRoute);
        }
    }

    // If logged in, handle redirects
    if (profileStore.isLogin) {
        //Redirects
        if (to.fullPath === '/' || to.fullPath === '/#') {
            return navigateTo('/statistic');
        }
        return true;
    }

    // If still not logged in after all attempts, redirect to login with original destination
    const shouldIncludeRedirect = to.fullPath && to.fullPath !== '/' && to.fullPath !== '/#';
    return navigateTo(shouldIncludeRedirect ? `${loginRoute}?redirect=${encodeURIComponent(to.fullPath)}` : loginRoute);
});
