import { authentication, dataProvider } from "@modular-rest/client";
import type User from "@modular-rest/client/dist/class/user";
import { COLLECTIONS, DATABASE, type ProfileType } from "~/types/database.type";

export const isLogin = ref(false);
export const authUser = ref<User | null>(null);
export const profileInfo = ref<ProfileType | null>(null);

function getProfileInfo() {
  return dataProvider
    .findOne<ProfileType>({
      database: DATABASE.USER_CONTENT,
      collection: COLLECTIONS.PROFILE,
      query: {
        refId: authUser.value?.id,
      },
    })
    .then((profile) => {
      profileInfo.value = profile;
    });
}

export function loginWithLastSession(token?: string) {
  return authentication
    .loginWithLastSession(token)
    .then((user) => {
      isLogin.value = true;
      authUser.value = user;

      return getProfileInfo();
    })

    .catch((error) => {
      console.error(error);

      isLogin.value = false;
      authUser.value = null;

      return null;
    });
}

export function logout() {
  authentication.logout();
  isLogin.value = authentication.isLogin;
  authUser.value = null;
}
