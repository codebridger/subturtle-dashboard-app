import { authentication } from '@modular-rest/client';
import { defineStore } from 'pinia';
import type { UserDetail } from '@/types/user.type';
export const useProfileStore = defineStore('profile', () => {
  const authUser = computed(() => authentication.user);
  const isLogin = computed(() => authentication.isLogin);

  const userDetail = ref<UserDetail>();
  const profilePicture = computed(() => userDetail.value?.gPicture || '');
  const email = computed(() => authUser.value?.email);

  function logout() {
    authentication.logout();
    userDetail.value = undefined;
  }

  return {
    authUser,
    userDetail,
    isLogin,
    profilePicture,
    email,

    logout,
  };
});
