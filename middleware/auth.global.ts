import { loginWithLastSession } from "~/utils/auth";

export default defineNuxtRouteMiddleware(async (to, from) => {
  if (to.path.includes("/login")) {
    logout();
    return true;
  }

  if (!isLogin.value) {
    await loginWithLastSession();
  }

  if (isLogin.value) {
    return true;
  }

  return navigateTo("/auth/login");
});
