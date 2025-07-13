import { authentication } from '@modular-rest/client';
import { waitFor } from './promise';

export const authUser = computed(() => authentication.user);
export const isLogin = computed(() => authentication.isLogin);
export const isAnyUserLogin = computed(() => authentication.isLogin || authentication.isAnonymousUser);

/**
 * Wait for the user/anonymous user to be authenticated
 * @param callback - The callback to call when the user is authenticated
 * @returns A promise that resolves when the user is authenticated
 */
export function waitForAuth(callback: () => void, interval = 500, timeout = 30000) {
    return waitFor(() => isAnyUserLogin.value === true, interval, timeout).then(() => {
        callback();
    });
}
