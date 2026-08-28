import { GlobalOptions, authentication } from '@modular-rest/client';
import axios from 'axios';
import { TIER_LIMIT_REACHED_CODE } from '~/types/tiers';
import { openTierLimitModal } from '~/composables/useTierLimitModal';

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
                    // `notice=expired` makes the login screen explain the bounce instead of
                    // appearing for no visible reason.
                    router.replace({ path: '/auth/login', query: { notice: 'expired' } });
                }
            }

            // Any RPC blocked by a tier limit/lock (HTTP 400 with a
            // TIER_LIMIT_REACHED message) opens the single global upgrade modal —
            // no per-page wiring. The feature name in the message tailors the copy.
            const data = error?.response?.data;
            const message = (data && (data.message || data.error)) || '';
            if (typeof message === 'string' && message.includes(TIER_LIMIT_REACHED_CODE)) {
                const match = /TIER_LIMIT_REACHED:\s*"?([a-z_]+)"?/i.exec(message);
                // Module-level singleton — no Pinia/Vue context needed here.
                openTierLimitModal(match?.[1] || '');
            }

            return Promise.reject(error);
        }
    );
});
