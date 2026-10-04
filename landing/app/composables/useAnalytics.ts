import type { Mixpanel } from 'mixpanel-browser';

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
