import { GlobalOptions } from "@modular-rest/client";

export default defineNuxtPlugin(({}) => {
  const runtimeConfig = useRuntimeConfig();

  GlobalOptions.set({
    host: runtimeConfig.public.API_URL,
  });
});
