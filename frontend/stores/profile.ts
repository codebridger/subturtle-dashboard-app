import { authentication, dataProvider, functionProvider } from '@modular-rest/client';
import { toastError } from 'pilotui/toast';
import { defineStore } from 'pinia';

import { COLLECTIONS, DATABASE, type FreemiumAllocationType, type ProfileType, type SubscriptionType } from '~/types/database.type';

export const useProfileStore = defineStore('profile', () => {
    const authUser = computed(() => authentication.user);
    const isLogin = computed(() => authentication.isLogin);

    // profile
    const userDetail = ref<ProfileType>();
    const profilePicture = computed(() => userDetail.value?.gPicture || '');
    const email = computed(() => authUser.value?.email);

    // subscription
    const isFreemium = ref(false);
    const isSubscriptionFetching = ref(true);
    const activeSubscription = ref<SubscriptionType | null>(null);
    const freemiumAllocation = ref<FreemiumAllocationType | null>(null);

    function fetchSubscription() {
        isSubscriptionFetching.value = true;

        return functionProvider
            .run<SubscriptionType | FreemiumAllocationType>({
                name: 'getSubscriptionDetails',
                args: {
                    userId: authUser.value?.id,
                },
            })
            .then((res) => {
                isFreemium.value = res.is_freemium;

                if (!res.is_freemium) {
                    activeSubscription.value = res;
                } else {
                    freemiumAllocation.value = res as FreemiumAllocationType;
                }
            })
            .catch((res) => {
                console.error('Error fetching subscription:', res);
                toastError(res.error || 'Unable to fetch subscription details', { position: 'top-end' });
            })
            .finally(() => {
                isSubscriptionFetching.value = false;
            });
    }

    function logout() {
        authentication.logout();
        userDetail.value = undefined;
    }

    function getProfileInfo() {
        return dataProvider
            .findOne<ProfileType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PROFILE,
                query: {
                    refId: authentication.user?.id,
                },
            })
            .then((profile) => {
                userDetail.value = profile;
                return profile;
            })
            .catch((error) => {
                toastError(error.error || 'Unable to fetch profile info', { position: 'top-end' });
            });
    }

    // bootstrap the profile store
    function bootstrap() {
        return Promise.all([
            // Fetch profile info
            getProfileInfo(),
            // Fetch subscription details
            fetchSubscription(),
        ]);
    }

    function loginWithLastSession() {
        return authentication
            .loginWithLastSession()
            .then(() => {
                // Only fetch protected user data when this is a real user session.
                // Anonymous tokens may legitimately be in localStorage (other tabs,
                // login screen priming) — don't logout/clear them, just skip bootstrap.
                if (authentication.user?.type !== 'user') {
                    return null;
                }
                const userToken = authentication.getToken;
                return bootstrap()
                    .then(() => {
                        // Defense-in-depth: re-save the user token after bootstrap.
                        // External actors (chrome extension content scripts, other
                        // tabs mid-anonymous flow) can overwrite localStorage.token
                        // between saveSession and bootstrap completion.
                        if (userToken && authentication.user?.type === 'user') {
                            localStorage.setItem('token', userToken);
                        }
                    })
                    .catch((error) => {
                        const message = (error?.error || error?.message || '').toString().toLowerCase();
                        if (message.includes('user not found') || message.includes('authentication')) {
                            authentication.logout();
                        }
                        throw error;
                    });
            })
            .catch(() => null);
    }

    function updateProfile(profileData: { name?: string; profileImage?: File; preferences?: Record<string, boolean>; timeZone?: string }) {
        const updatePayload: any = {};
        if (profileData.name) updatePayload.name = profileData.name;
        if (profileData.timeZone) updatePayload.timeZone = profileData.timeZone;

        if (Object.keys(updatePayload).length === 0) {
            return Promise.resolve(userDetail.value);
        }

        return dataProvider
            .updateOne({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PROFILE,
                query: {
                    refId: authentication.user?.id,
                },
                update: updatePayload,
            })
            .then((res) => {
                if (userDetail.value) {
                    if (profileData.name) userDetail.value.name = profileData.name;
                    if (profileData.timeZone) userDetail.value.timeZone = profileData.timeZone;
                }
                return res;
            });
    }

    return {
        authUser,
        userDetail,
        isLogin,
        profilePicture,
        email,

        activeSubscription,
        isSubscriptionFetching,
        isFreemium,
        freemiumAllocation,
        fetchSubscription,

        logout,
        getProfileInfo,
        loginWithLastSession,
        bootstrap,
        updateProfile,
    };
});
