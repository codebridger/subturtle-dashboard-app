<template></template>

<script lang="ts" setup>
  import { authentication, dataProvider, fileProvider } from '@modular-rest/client';
  import type User from '@modular-rest/client/dist/class/user';
  import { useRoute, useRouter } from 'vue-router';
  import { DATABASE, PROFILE_COLLECTION } from '~/config';
  import { useProfileStore } from '~/stores/profile';
  import type { UserDetail } from '~/types/user.type';

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
    const userData = await dataProvider.findOne<UserDetail>({
      database: DATABASE,
      collection: PROFILE_COLLECTION,
      query: {
        refId: user.id,
      },
    });

    if (userData) {
      profileStore.userDetail = userData;
    }

    return user;
  }
</script>
