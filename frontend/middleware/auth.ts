import { useProfileStore } from '~/stores/profile';

export default defineNuxtRouteMiddleware(async (to, _from) => {
    // Redirects
    // if (to.path == "/") {
    //   return navigateTo("/dashboard");
    // }

    const profileStore = useProfileStore();
    const loginRoute = '/auth/login';

    if (to.path === loginRoute) {
        profileStore.logout();
        return true;
    }

    if (!profileStore.isLogin) {
        await profileStore.loginWithLastSession();
    }

    if (profileStore.isLogin) {
        return true;
    }

    return navigateTo(loginRoute);
});
