import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { marked } from 'marked';

/**
 * subturtle.app — the marketing site.
 *
 * Fully static: `nuxt generate` prerenders every route to flat HTML (`privacy.html`, not
 * `privacy/index.html`) and firebase.json serves it with `cleanUrls`. There is no SPA fallback and
 * no Firebase SDK; the site only links into the dashboard and the Chrome Web Store.
 */
const here = import.meta.dirname;

/**
 * `nuxt prepare` (run by postinstall) loads this config before any `.env.local` exists, and only
 * writes types, so it is exempt. Every command that emits pages refuses to run without both origins:
 * an unset one would otherwise fall back to "" and ship relative CTAs and canonicals that 404.
 */
const isPrepare = process.argv.includes('prepare');

function requireOrigin(name: string): string {
    const value = process.env[name];
    if (value && /^https?:\/\/[^/]+$/.test(value)) return value;
    if (isPrepare) return '';
    throw new Error(
        `${name} is ${value ? `"${value}"` : 'not set'}; it must be an absolute origin with no trailing slash ` +
            '(e.g. https://subturtle.app). Set it in landing/.env.local, or see infra/public/landing-*.env for the deployed values.',
    );
}

const siteUrl = requireOrigin('NUXT_PUBLIC_SITE_URL');
const dashboardUrl = requireOrigin('NUXT_PUBLIC_DASHBOARD_URL');

/**
 * Only the build for the production host may be indexed. The dev site serves the same pages with
 * the same copy, so it ships `noindex` and `Disallow: /`; scripts/check-hosting.mjs asserts both
 * directions, because a stray `noindex` on production is the same bug the other way round.
 */
const indexable = siteUrl !== '' && new URL(siteUrl).hostname === 'subturtle.app';

/**
 * Prices come from Stripe through the API's `getSubscriptionPlans`, fetched at build time by
 * scripts/sync-plans.mjs into app/data/plans.json (gitignored). Without that file the build uses the
 * committed snapshot, so the page is never priceless and never fetches at runtime.
 */
const plansFile = existsSync(resolve(here, 'app/data/plans.json')) ? 'plans.json' : 'plans.snapshot.json';
if (!isPrepare) console.info(`  ℹ pricing from app/data/${plansFile}`);

/** `import html from '~/legal/privacy.md?html'` → the rendered HTML string, at build time only. */
function legalMarkdown() {
    return {
        name: 'subturtle-legal-markdown',
        enforce: 'pre' as const,
        load(id: string) {
            if (!id.endsWith('.md?html')) return null;
            const html = marked.parse(readFileSync(id.slice(0, -'?html'.length), 'utf8'), { async: false });
            return `export default ${JSON.stringify(html)};`;
        },
    };
}

/**
 * subturtle-ui's stylesheet opens with an @import of Google Fonts: a render-blocking chain (HTML → CSS →
 * Google CSS → font) that cost this page about 1.3 s on mobile. This site self-hosts the same faces
 * (see site.css), so the import is dropped from the bundle here. The dashboard keeps it as it is.
 */
function dropRemoteFontImport() {
    return {
        name: 'subturtle-drop-remote-font-import',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
            if (!/subturtle-ui\/dist\/style\.css|ui\/dist\/style\.css/.test(id)) return null;
            return code.replace(/@import url\(['"]?https:\/\/fonts\.googleapis\.com[^)]*\);?/g, '');
        },
    };
}

export default defineNuxtConfig({
    compatibilityDate: '2026-10-01',

    devServer: { port: 3100 },

    // subturtle-ui's stylesheet carries the tokens and the components; site.css is page chrome and the
    // landing's AA-contrast remap of the semantic aliases (see its header).
    css: ['subturtle-ui/style.css', resolve(here, 'app/assets/css/site.css')],

    alias: { '#plans': resolve(here, 'app/data', plansFile) },

    app: {
        head: {
            htmlAttrs: { lang: 'en' },
            meta: [
                { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
                { name: 'theme-color', content: '#f8f5f7' },
                { name: 'format-detection', content: 'telephone=no' },
            ],
            link: [
                { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
                { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
                { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
                // Discovered only after the CSS is parsed otherwise. `crossorigin` is required on a font
                // preload even from the same origin, or the font is fetched twice.
                { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/nunito-latin.woff2', crossorigin: '' },
            ],
        },
    },

    runtimeConfig: {
        public: {
            siteUrl,
            dashboardUrl,
            indexable,
            // Optional. Unset means no analytics script, and no consent banner either, since there is then
            // nothing to consent to (localhost, CI). Each environment carries its own Mixpanel project.
            mixpanelProjectToken: process.env.NUXT_PUBLIC_MIXPANEL_PROJECT_TOKEN ?? '',
            googleAdsId: process.env.NUXT_PUBLIC_GOOGLE_ADS_ID ?? '',
            // The pitch film. A YouTube id once it is published; FILM_SRC is a local file for `nuxt dev` only
            // (see $development below). With neither, the section shows the poster alone.
            filmYoutubeId: process.env.NUXT_PUBLIC_FILM_YOUTUBE_ID ?? '',
            filmSrc: process.env.NUXT_PUBLIC_FILM_SRC ?? '',
            // Product Hunt post, for the badge slot. Empty until the launch is live.
            productHuntPostId: process.env.NUXT_PUBLIC_PRODUCT_HUNT_POST_ID ?? '',
            productHuntPostSlug: process.env.NUXT_PUBLIC_PRODUCT_HUNT_POST_SLUG ?? '',
        },
    },

    // The film master is not ours to publish yet and never belongs on Hosting (it goes to YouTube), so
    // it lives in the gitignored .film/ and is served at /film only by the dev server. A generated
    // dist/ cannot contain it, and check-hosting.mjs fails on any video file regardless.
    $development: {
        nitro: { publicAssets: [{ dir: resolve(here, '.film'), baseURL: '/film', maxAge: 0 }] },
    },

    // Every link on the site is a plain <a> to a prerendered page, so there is no client-side navigation
    // to feed: inline the (tiny) payload instead of writing `privacy/_payload.json` beside every route.
    experimental: { payloadExtraction: false },

    nitro: {
        // Absolute, so firebase.json's `public: landing/dist` cannot drift from where Nitro writes.
        output: { publicDir: resolve(here, 'dist') },
        prerender: {
            crawlLinks: true,
            routes: ['/', '/robots.txt', '/sitemap.xml', '/not-found'],
            failOnError: true,
            // Flat files. With directory indexes, firebase.json's `trailingSlash: false` would bounce
            // `/privacy` ↔ `/privacy/` forever.
            autoSubfolderIndex: false,
        },
        hooks: {
            /**
             * `nuxt generate` always writes 404.html (and 200.html) as an empty client-rendered shell. Hosting
             * serves 404.html for every miss, so replace it with the prerendered /not-found page: real
             * content without JavaScript. Neither not-found.html nor the unused 200.html stays a URL.
             */
            'prerender:done'() {
                const dist = resolve(here, 'dist');
                renameSync(resolve(dist, 'not-found.html'), resolve(dist, '404.html'));
                rmSync(resolve(dist, '200.html'), { force: true });
            },
        },
    },

    vite: { plugins: [legalMarkdown(), dropRemoteFontImport()] },

    typescript: { typeCheck: false },
});
