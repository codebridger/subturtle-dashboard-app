import { GlobalOptions } from '@modular-rest/client';

export default defineNuxtPlugin((_nuxtApp) => {
    const config = useRuntimeConfig();

    GlobalOptions.set({
        // the base url of the server, it should match with the server address
        host: config.public.BASE_URL_API || window.location.origin,
    });
});
