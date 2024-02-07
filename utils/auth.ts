import { authentication } from "@modular-rest/client";
import type User from "@modular-rest/client/dist/class/user";

export const isLogin = ref(false);
export const authUser = ref<User | null>(null);

export function loginWithLastSession(token?: string) {
  return authentication
    .loginWithLastSession(token)
    .then((user) => {
      isLogin.value = true;
      authUser.value = user;
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
