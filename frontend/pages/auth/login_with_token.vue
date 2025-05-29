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
                    router.push('/');
                })
                .catch((error) => {
                    toastError(error.error || 'Unable to login with token', { position: 'top-end' });
                    router.push('/auth/login');
                });
        }
    });
</script>
