<template></template>

<script lang="ts" setup>
    import { authentication } from '@modular-rest/client';
    import { useRoute, useRouter } from 'vue-router';
    import { useProfileStore } from '~/stores/profile';
    import { toastError } from '@codebridger/lib-vue-components/toast.ts';

    const route = useRoute();
    const router = useRouter();
    const profileStore = useProfileStore();

    definePageMeta({
        layout: 'blank',
    });

    onMounted(() => {
        const token = route.query.token as string;
        if (token) {
            authentication
                .loginWithToken(token, true)
                .then(profileStore.bootstrap)
                .then(() => {
                    // Check for redirect URL in query parameter first, then in sessionStorage
                    const redirectUrl = (route.query.redirect as string) || sessionStorage.getItem('auth_redirect_url');

                    // Clear the redirect URL from sessionStorage
                    sessionStorage.removeItem('auth_redirect_url');

                    if (redirectUrl) {
                        // Validate the redirect URL to ensure it's safe
                        try {
                            const url = new URL(redirectUrl, window.location.origin);
                            // Only allow same-origin redirects for security
                            if (url.origin === window.location.origin) {
                                router.push(url.pathname + url.search + url.hash);
                            } else {
                                // External URL, redirect to home for security
                                router.push('/');
                            }
                        } catch (error) {
                            // Invalid URL, redirect to home
                            router.push('/');
                        }
                    } else {
                        router.push('/');
                    }
                })
                .catch((error) => {
                    toastError(error.error || 'Unable to login with token', { position: 'top-end' });
                    router.push('/auth/login');
                });
        }
    });
</script>
