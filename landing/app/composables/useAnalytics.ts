import type { Mixpanel } from 'mixpanel-browser';
import type { LocationQuery, Router } from 'vue-router';

/**
 * Analytics behind consent: Mixpanel (product funnel) and the Google Ads tag (ad conversions).
 *
 * Nothing loads, and no cookie is set, until the visitor accepts in the consent banner. The choice
 * itself is kept in localStorage, which is strictly necessary storage. Mixpanel shares the
 * dashboard's project per environment and its cookie is scoped to the parent domain, so a visitor
 * who accepted here keeps one identity when they sign in on dashboard.subturtle.app.
 *
 * Event names follow `[object]_[action]_[modifier]` (subturtle-doc docs/metrics/event-naming.md).
 */
type Consent = 'granted' | 'denied';
const CONSENT_KEY = 'subturtle-consent';

let mixpanel: Mixpanel | null = null;
let loading: Promise<void> | null = null;

/** The extension's install analytics id, read off the post-install link and waiting to be sent once. */
let pendingInstallId: string | null = null;
const INSTALL_ID_PARAM = 'install_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sends one event if analytics is running; otherwise a no-op. Never throws: without a token (CI, a
 * fresh clone) or before consent there is no client, and a page must never break over a metric.
 */
export function track(event: string, props: Record<string, unknown> = {}) {
    if (!mixpanel) return;
    try {
        mixpanel.track(event, props);
    } catch (error) {
        console.warn('[analytics] track failed', event, error);
    }
}

/**
 * On first install the extension opens `/?install_id=<uuid>&utm_source=extension&utm_medium=install`.
 * Keeps the id (only when it looks like a UUID) for `extension_installed`, and takes it off the address
 * bar at once, so a reload or a shared link cannot send it again and no Mixpanel `$current_url` carries
 * it. Other parameters (the UTM) stay. Call once, on the client, after `router.isReady()` and before
 * `init()`, for the reason given on captureUtm().
 *
 * The event itself waits for consent: it is sent when Mixpanel starts, on this page view only. A
 * visitor who declines, or never answers the banner, is not counted.
 */
export async function captureInstallId(router: Router, query: LocationQuery) {
    if (!(INSTALL_ID_PARAM in query)) return;
    const raw = query[INSTALL_ID_PARAM];
    const value = (Array.isArray(raw) ? raw[0] : raw) ?? '';
    pendingInstallId = UUID.test(value) ? value.toLowerCase() : null;
    const { [INSTALL_ID_PARAM]: _dropped, ...rest } = query;
    // router.replace writes the address bar with history.replaceState and keeps the router in step.
    try {
        await router.replace({ query: rest, hash: router.currentRoute.value.hash });
    } catch (error) {
        console.warn('[analytics] could not clear install_id from the URL', error);
    }
}

function loadGoogleAds(id: string) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
        // gtag.js reads the `arguments` object itself, not an array copy.
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('config', id);
}

/** `undefined` until read on the client, `null` while the visitor has not chosen. */
export const useConsent = () => useState<Consent | null | undefined>('consent', () => undefined);

export function useAnalytics() {
    const consent = useConsent();
    const config = useRuntimeConfig().public;
    const utm = useUtm();
    const route = useRoute();

    /** Whether there is anything to consent to. Without a token or tag id the banner never shows. */
    const enabled = Boolean(config.mixpanelProjectToken || config.googleAdsId);

    function start() {
        if (loading) return loading;
        loading = (async () => {
            if (config.mixpanelProjectToken) {
                try {
                    const mod = await import('mixpanel-browser');
                    const client = mod.default;
                    client.init(config.mixpanelProjectToken, { track_pageview: false, api_method: 'POST' });
                    client.register({ app: 'landing' });
                    if (client.has_opted_out_tracking()) client.opt_in_tracking();
                    mixpanel = client;
                    track('landing-page_viewed', { path: route.path, product_hunt: utm.value.utm_source === 'producthunt', ...utm.value });
                    if (pendingInstallId) {
                        track('extension_installed', { install_id: pendingInstallId, ...utm.value });
                        pendingInstallId = null;
                    }
                } catch (error) {
                    console.warn('[analytics] Mixpanel failed to start', error);
                }
            }
            if (config.googleAdsId) {
                try {
                    loadGoogleAds(config.googleAdsId);
                } catch (error) {
                    console.warn('[analytics] Google Ads tag failed to load', error);
                }
            }
        })();
        return loading;
    }

    /** Reads the stored choice and starts analytics if it was a yes. Call once, on the client. */
    function init() {
        if (!enabled) return;
        let stored: string | null = null;
        try {
            stored = localStorage.getItem(CONSENT_KEY);
        } catch {
            // Storage blocked: ask again, and do not track.
        }
        consent.value = stored === 'granted' || stored === 'denied' ? stored : null;
        if (consent.value === 'granted') void start();
    }

    function choose(value: Consent) {
        consent.value = value;
        try {
            localStorage.setItem(CONSENT_KEY, value);
        } catch {
            // The choice still holds for this page view.
        }
        if (value === 'granted') {
            void start();
        } else if (mixpanel) {
            // A later "no" from Cookie settings: Mixpanel drops its cookie and stops sending. The Ads tag
            // cannot be unloaded mid-page; with consent withdrawn it is not loaded on the next visit.
            mixpanel.opt_out_tracking();
            mixpanel = null;
            loading = null;
        }
    }

    /** Cookie settings in the footer: shows the banner again. */
    function reopen() {
        consent.value = null;
    }

    return { consent, enabled, init, choose, reopen };
}
