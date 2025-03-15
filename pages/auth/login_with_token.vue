<template></template>

<script lang="ts" setup>
  import { authentication } from '@modular-rest/client';
  import { useRoute, useRouter } from 'vue-router';
  import { useProfileStore } from '~/stores/profile';

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
        .loginWithLastSession(token)
        .then(profileStore.getProfileInfo)
        .then(() => {
          router.push('/');
        })
        .catch(() => {
          router.push('/auth/login');
        });
    }
  });
</script>
