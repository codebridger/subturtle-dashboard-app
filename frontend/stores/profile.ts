import { authentication, dataProvider, functionProvider } from '@modular-rest/client';
import { toastError } from '@codebridger/lib-vue-components/toast.ts';
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
                return bootstrap();
            })
            .catch((error) => null);
    }

    function updateProfile(profileData: { name?: string; profileImage?: File; preferences?: Record<string, boolean> }) {
        if (!profileData.name) {
            return Promise.resolve(userDetail.value);
        }

        return dataProvider
            .updateOne({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PROFILE,
                query: {
                    refId: authentication.user?.id,
                },
                update: {
                    name: profileData.name,
                },
            })
            .then((res) => {
                userDetail.value!.name = profileData.name || '';
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
