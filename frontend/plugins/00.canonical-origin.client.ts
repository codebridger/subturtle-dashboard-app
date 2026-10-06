/**
 * Sends visitors on Firebase's default hosts (<project>.web.app / .firebaseapp.com) to the
 * dashboard's own domain, keeping the route.
 *
 * The login lives in localStorage, which is per origin, so a session on the default host is
 * separate from the one on the real domain and goes stale on its own. The extension also only
 * shields the dashboard's `token` key on the real domains, so on the default host its content
 * scripts overwrite the session. Named `00.` so it runs before any other plugin touches auth.
 */
export default defineNuxtPlugin(() => {
    const target = useRuntimeConfig().public.DASHBOARD_URL as string | undefined;
    if (!target) return;

    const canonical = new URL(target);
    const { hostname, pathname, search, hash } = window.location;
    const onDefaultHost = hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com');

    if (onDefaultHost && hostname !== canonical.hostname) {
        window.location.replace(canonical.origin + pathname + search + hash);
    }
});
