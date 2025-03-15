import { authentication, dataProvider } from '@modular-rest/client';
import type User from '@modular-rest/client/dist/class/user';
import { defineStore } from 'pinia';

import { COLLECTIONS, DATABASE, type ProfileType } from '~/types/database.type';
export const useProfileStore = defineStore('profile', () => {
  const authUser = computed(() => authentication.user);
  const isLogin = computed(() => authentication.isLogin);

  const userDetail = ref<ProfileType>();
  const profilePicture = computed(() => userDetail.value?.gPicture || '');
  const email = computed(() => authUser.value?.email);

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
      });
  }

  function loginWithLastSession(token?: string) {
    return authentication
      .loginWithLastSession(token)
      .then((user) => {
        return getProfileInfo();
      })

      .catch((error) => {
        console.error(error);

        return null;
      });
  }

  return {
    authUser,
    userDetail,
    isLogin,
    profilePicture,
    email,

    logout,
    getProfileInfo,
    loginWithLastSession,
  };
});
