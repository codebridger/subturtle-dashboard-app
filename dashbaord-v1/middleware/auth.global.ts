import { loginWithLastSession } from "~/utils/auth";

export default defineNuxtRouteMiddleware(async (to, _from) => {
  // Redirects
  // if (to.path == "/") {
  //   return navigateTo("/dashboard");
  // }

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

  // Only for development
  // return true;

  return navigateTo("/auth/login");
});
