import { authentication, dataProvider, functionProvider } from '@modular-rest/client';
import { toastError, toastSuccess } from '@codebridger/lib-vue-components/toast.ts';
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

    function updateProfile(profileData: { name: string; gPicture?: string }) {
        return functionProvider
            .run({
                name: 'updateProfile',
                args: {
                    userId: authUser.value?.id,
                    name: profileData.name,
                    ...(profileData.gPicture && { gPicture: profileData.gPicture }),
                },
            })
            .then((response) => {
                // Update the local userDetail with the new data
                if (userDetail.value) {
                    userDetail.value.name = profileData.name;
                    if (profileData.gPicture) {
                        userDetail.value.gPicture = profileData.gPicture;
                    }
                }
                toastSuccess('Profile updated successfully', { position: 'top-end' });
                return response;
            })
            .catch((error) => {
                toastError(error.error || 'Unable to update profile', { position: 'top-end' });
                throw error;
            });
    }

    function uploadProfileImage(file: File) {
        return dataProvider
            .updateOne({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PROFILE,
                query: {
                    refId: authentication.user?.id,
                },
                update: {
                    images: [file],
                },
            })
            .then((response) => {
                // Refresh profile info to get the updated image URL
                return getProfileInfo();
            })
            .then(() => {
                toastSuccess('Profile image updated successfully', { position: 'top-end' });
            })
            .catch((error) => {
                toastError(error.error || 'Unable to upload profile image', { position: 'top-end' });
                throw error;
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
        updateProfile,
        uploadProfileImage,
        loginWithLastSession,
        bootstrap,
    };
});
