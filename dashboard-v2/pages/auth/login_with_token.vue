<template></template>

<script lang="ts" setup>
  import { authentication } from '@modular-rest/client';
  import type User from '@modular-rest/client/dist/class/user';
  import { useRoute, useRouter } from 'vue-router';
  import { useProfileStore } from '~/stores/profile';

  const route = useRoute();
  const router = useRouter();

  definePageMeta({
    layout: 'blank',
  });

  onMounted(() => {
    const token = route.query.token as string;
    if (token) {
      authentication
        .loginWithLastSession(token)
        .then(bootUserProfile)
        .then(() => {
          router.push('/');
        })
        .catch(() => {
          router.push('/auth/login');
        });
    }
  });

  async function bootUserProfile(user: User) {
    const profileStore = useProfileStore();
    // get profile picture
    const userData = await getProfileInfo();

    if (userData) {
      profileStore.userDetail = userData;
    }

    return user;
  }
</script>
