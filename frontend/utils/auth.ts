import { authentication } from '@modular-rest/client';
import { shallowRef } from 'vue';
import { waitFor } from './promise';

/**
 * `@modular-rest/client`'s `authentication` is a plain class singleton, so a
 * `computed` over it has no reactive dependency: Vue evaluates it once and caches
 * that value for the life of the tab. Reading `authUser` before the session was
 * restored then left `userId: undefined` in every later RPC, and `isLogin` never
 * changed after its first read.
 *
 * The client mutates its state only by assigning `this.user` and `this.token`
 * (login, loginWithToken, loginWithLastSession, loginAsAnonymous, logout), so we
 * swap those two fields for accessors backed by shallow refs. Its own getters
 * (`isLogin`, `isAnonymousUser`, `getToken`) read them, so every computed over
 * `authentication` — here, in the profile store, anywhere — now tracks changes,
 * whichever code path makes them.
 */
function makeFieldReactive(target: object, key: string) {
    const record = target as Record<string, unknown>;
    // shallowRef keeps the client's own objects (a User instance) unproxied.
    const field = shallowRef(record[key]);
    Object.defineProperty(record, key, {
        get: () => field.value,
        set: (value) => {
            field.value = value;
        },
        enumerable: true,
        // HMR re-runs this module; a non-configurable property would make that throw.
        configurable: true,
    });
}

makeFieldReactive(authentication, 'user');
makeFieldReactive(authentication, 'token');

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
