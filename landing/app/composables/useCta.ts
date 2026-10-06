import type { LocationQuery } from 'vue-router';
import { CHROME_WEB_STORE_URL } from '~/data/site';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;
const STORAGE_KEY = 'subturtle-utm';

/** The visit's campaign parameters. Empty in prerendered HTML; filled on the client by captureUtm(). */
export const useUtm = () => useState<Utm>('utm', () => ({}));

/**
 * Reads the campaign off the landing URL (or this tab's earlier landing, so an in-page hop to
 * /privacy and back keeps it). Product Hunt adds `?ref=producthunt` to outbound links that carry no
 * UTM, so that counts as the source too. Call once, on the client, after `router.isReady()`.
 *
 * It takes the router's query, not `window.location`: while a prerendered page hydrates, Nuxt's
 * router briefly replaces the URL with the bare rendered path, so `location.search` is empty at
 * mount time and the campaign would be lost (it was, on the first dev deploy).
 */
export function captureUtm(utm: Ref<Utm>, query: LocationQuery) {
    const param = (key: string) => {
        const value = query[key];
        return (Array.isArray(value) ? value[0] : value) ?? '';
    };
    const fromUrl: Utm = {};
    for (const key of UTM_KEYS) {
        const value = param(key);
        if (value) fromUrl[key] = value.slice(0, 100);
    }
    if (!fromUrl.utm_source && param('ref') === 'producthunt') fromUrl.utm_source = 'producthunt';

    let stored: Utm = {};
    try {
        stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        // Storage blocked (private mode, embedded preview): the URL alone still works.
    }
    utm.value = Object.keys(fromUrl).length ? fromUrl : stored;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm.value));
    } catch {
        // See above.
    }
}

/**
 * Where the calls to action go. The visit's UTM parameters are passed through, so the Chrome Web
 * Store's install sources and the dashboard's Mixpanel (which reads UTM off its own URL) see the
 * real campaign. A visit with no campaign is still tagged as coming from this site.
 */
export function useCta() {
    const utm = useUtm();
    const { dashboardUrl } = useRuntimeConfig().public;

    const query = computed(() => {
        const params = new URLSearchParams(Object.keys(utm.value).length ? utm.value : { utm_source: 'subturtle.app', utm_medium: 'website' });
        return params.toString();
    });

    const installHref = computed(() => `${CHROME_WEB_STORE_URL}?${query.value}`);

    /** The dashboard is a hash-routed SPA: the query goes before the hash, where its Mixpanel looks. */
    const dashboardHref = (route = '/') => `${dashboardUrl}/?${query.value}#${route}`;

    const isProductHunt = computed(() => utm.value.utm_source === 'producthunt');

    return { installHref, dashboardHref, isProductHunt, utm };
}
