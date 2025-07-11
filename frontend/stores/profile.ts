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

    function updateProfile(profileData: { name?: string; gPicture?: string }) {
        return functionProvider
            .run({
                name: 'updateProfile',
                args: {
                    userId: authUser.value?.id,
                    ...profileData,
                },
            })
            .then(() => {
                // Refresh profile info after update
                return getProfileInfo();
            })
            .then(() => {
                toastSuccess('Profile updated successfully', { position: 'top-end' });
            })
            .catch((error) => {
                toastError(error.error || 'Unable to update profile', { position: 'top-end' });
                throw error;
            });
    }

    function uploadProfilePicture(file: File) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async () => {
                try {
                    const result = await functionProvider.run({
                        name: 'uploadProfilePicture',
                        args: {
                            userId: authUser.value?.id,
                            file: {
                                buffer: Array.from(new Uint8Array(reader.result as ArrayBuffer)),
                                mimetype: file.type,
                                originalname: file.name,
                            },
                        },
                    });

                    // Refresh profile info after upload
                    await getProfileInfo();
                    toastSuccess('Profile picture uploaded successfully', { position: 'top-end' });
                    resolve(result);
                } catch (error: any) {
                    toastError(error.error || 'Unable to upload profile picture', { position: 'top-end' });
                    reject(error);
                }
            };

            reader.onerror = () => {
                const error = new Error('Failed to read file');
                toastError('Failed to read file', { position: 'top-end' });
                reject(error);
            };

            reader.readAsArrayBuffer(file);
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
        uploadProfilePicture,
        loginWithLastSession,
        bootstrap,
    };
});
