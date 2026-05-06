import { GlobalOptions, authentication } from '@modular-rest/client';
import axios from 'axios';

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig();

    GlobalOptions.set({
        // the base url of the server, it should match with the server address
        host: config.public.BASE_URL_API || window.location.origin,
    });

    if (!process.client) return;

    const router = useRouter();

    // When a request that carried an auth header comes back with 401 or 412,
    // the token is bad (signature ok but user gone, expired, or revoked).
    // Clear it and bounce to /auth/login so the user can re-authenticate
    // instead of being stuck in a 412 loop.
    axios.interceptors.response.use(
        (response) => response,
        (error) => {
            const status = error?.response?.status;
            const headers = error?.config?.headers || {};
            const sentAuth = headers.authorization || headers.Authorization;

            if (sentAuth && (status === 401 || status === 412)) {
                authentication.logout();

                const onLoginRoute = window.location.hash.startsWith('#/auth/login');
                if (!onLoginRoute) {
                    router.replace('/auth/login');
                }
            }

            return Promise.reject(error);
        }
    );
});
