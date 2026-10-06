#!/usr/bin/env node
/**
 * The gate between `nuxt generate` and every deploy of the marketing site.
 *
 * Usage: node scripts/check-hosting.mjs [--config-only]
 *
 * firebase-tools publishes whatever sits in a target's `public` directory: a missing or half-built
 * dist/ goes live over the real site and the command still exits 0. Several other failures here are
 * just as quiet: a catch-all rewrite answers every 404 (and /robots.txt) with the home page, a stray
 * `noindex` delists production, a dev build without one gets indexed as a duplicate. None of them
 * looks wrong in a browser, so this script looks instead. It also guards the dashboard's half of
 * firebase.json, which this site shares, so a landing change cannot quietly break its SPA fallback.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const here = import.meta.dirname;
const landing = resolve(here, '..');
const repo = resolve(landing, '..');
const dist = join(landing, 'dist');
const configOnly = process.argv.includes('--config-only');

const failures = [];
const check = (ok, message) => {
    if (!ok) failures.push(message);
};

/* ---------- firebase.json and .firebaserc ---------- */
const firebase = JSON.parse(readFileSync(join(repo, 'firebase.json'), 'utf8'));
const rc = JSON.parse(readFileSync(join(repo, '.firebaserc'), 'utf8'));
const hosting = Array.isArray(firebase.hosting) ? firebase.hosting : [];
const site = hosting.find((h) => h.target === 'landing');
const dashboard = hosting.find((h) => h.target === 'dashboard');

check(hosting.length === 2, 'firebase.json: `hosting` must be an array of exactly the `dashboard` and `landing` targets');
check(site, 'firebase.json: no hosting target `landing`');
check(dashboard, 'firebase.json: no hosting target `dashboard`');

if (site) {
    check(site.public === 'landing/dist', 'landing: `public` must be landing/dist (where nuxt.config.ts writes)');
    check(site.cleanUrls === true, 'landing: `cleanUrls` must be true, or /privacy does not resolve to privacy.html');
    check(site.trailingSlash === false, 'landing: `trailingSlash` must be false (paired with flat output)');
    check(!('rewrites' in site), 'landing: must have NO rewrites; a catch-all serves the home page for every 404 and for robots.txt');
    const redirects = site.redirects ?? [];
    check(!redirects.some((r) => String(r.source).startsWith('**')), 'landing: a redirect starting with ** would redirect every asset');
    for (const [from, to] of [
        ['/privacy-policy', '/privacy'],
        ['/terms-of-service', '/terms'],
        ['/terms-and-conditions', '/terms'],
    ]) {
        check(
            redirects.some((r) => r.source === from && r.destination === to && r.type === 301),
            `landing: missing the 301 ${from} → ${to}`,
        );
    }
}

if (dashboard) {
    check(dashboard.public === 'frontend/.output/public', 'dashboard: `public` changed');
    const rw = dashboard.rewrites ?? [];
    check(
        rw.some((r) => r.source === '**' && r.destination === '/index.html'),
        'dashboard: its SPA fallback rewrite (** → /index.html) is gone',
    );
    check(
        rw.some((r) => r.run?.serviceId === 'subturtle-api'),
        'dashboard: the Cloud Run API rewrites are gone (the extension and the Stripe webhook call the API through this domain)',
    );
}

for (const project of ['subturtle-dev', 'subturtle-prod']) {
    const targets = rc.targets?.[project]?.hosting ?? {};
    check(
        targets.dashboard?.length === 1 && targets.dashboard[0] === project,
        `.firebaserc: ${project} must bind \`dashboard\` to its default site ${project}`,
    );
    check(targets.landing?.length === 1, `.firebaserc: ${project} must bind \`landing\` to exactly one site`);
}

/* ---------- the build ---------- */
if (!configOnly) {
    const read = (file) => (existsSync(join(dist, file)) ? readFileSync(join(dist, file), 'utf8') : '');
    const REQUIRED = ['index.html', 'privacy.html', 'terms.html', '404.html', 'robots.txt', 'sitemap.xml', 'favicon.svg', 'og.jpg'];
    for (const file of REQUIRED) {
        check(existsSync(join(dist, file)) && statSync(join(dist, file)).size > 0, `dist/${file} is missing or empty; was the site built?`);
    }

    // The film goes to YouTube. A video file on Hosting means the local master leaked into a build.
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    if (existsSync(dist)) {
        const videos = walk(dist).filter((f) => /\.(mp4|mov|webm|m4v)$/i.test(f));
        check(videos.length === 0, `dist/ contains video files, which never belong on Hosting: ${videos.join(', ')}`);
    }

    const index = read('index.html');
    const canonical = index.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1] ?? '';
    const siteUrl = canonical.replace(/\/$/, '');
    const expected = process.env.NUXT_PUBLIC_SITE_URL;
    check(siteUrl, 'index.html has no canonical link');
    if (expected) check(siteUrl === expected, `index.html canonical is ${canonical}, but NUXT_PUBLIC_SITE_URL is ${expected}`);

    const indexable = siteUrl !== '' && new URL(siteUrl).hostname === 'subturtle.app';
    for (const [file, path] of [
        ['index.html', '/'],
        ['privacy.html', '/privacy'],
        ['terms.html', '/terms'],
    ]) {
        const html = read(file);
        check(/<title>[^<]{10,}<\/title>/.test(html), `${file}: no <title>`);
        check(/<meta[^>]+name="description"[^>]+content="[^"]{40,}"/.test(html), `${file}: no meta description`);
        check(html.includes(`rel="canonical" href="${siteUrl}${path}"`), `${file}: canonical is not ${siteUrl}${path}`);
        const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? '';
        if (indexable) check(robots === 'index, follow', `${file}: production build must be indexable (robots is "${robots}")`);
        else check(robots.includes('noindex'), `${file}: a non-production build must be noindex (robots is "${robots}")`);
    }

    const robotsTxt = read('robots.txt');
    if (indexable)
        check(
            robotsTxt.includes(`Sitemap: ${siteUrl}/sitemap.xml`) && !/Disallow:\s*\/\s*$/m.test(robotsTxt),
            'robots.txt must allow crawling and name the sitemap',
        );
    else check(/Disallow:\s*\/\s*$/m.test(robotsTxt), 'robots.txt of a non-production build must be Disallow: /');
    check(!robotsTxt.includes('<html'), 'robots.txt is HTML (a rewrite or the SPA shell answered it)');

    const sitemap = read('sitemap.xml');
    for (const path of ['/', '/privacy', '/terms']) check(sitemap.includes(`<loc>${siteUrl}${path}</loc>`), `sitemap.xml lacks ${siteUrl}${path}`);

    // The prices on the page are the ones this build was given (Stripe via sync-plans, or the snapshot).
    const plansFile = existsSync(join(landing, 'app/data/plans.json')) ? 'plans.json' : 'plans.snapshot.json';
    const plans = JSON.parse(readFileSync(join(landing, 'app/data', plansFile), 'utf8'));
    for (const plan of plans.filter((p) => p.status === 'live' && p.isPaid)) {
        const price = `£${plan.pricing.monthly.gbp.toFixed(2)}`;
        check(index.includes(price), `index.html does not show ${plan.name} at ${price} (from ${plansFile})`);
    }

    const ld = index.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    try {
        const app = JSON.parse(ld ?? '')['@graph'].find((n) => n['@type'] === 'SoftwareApplication');
        check(app?.offers?.length === plans.filter((p) => p.status === 'live').length, 'JSON-LD SoftwareApplication offers do not match the plans');
        check(!('aggregateRating' in app), 'JSON-LD must not carry an aggregateRating (ratings from another site are not allowed)');
    } catch {
        failures.push('index.html JSON-LD is missing or invalid');
    }

    check(
        index.includes('chromewebstore.google.com/detail/subturtle/gaplicnpaiidofkoeonioomcnadoofkf'),
        'index.html does not link to the Chrome Web Store listing',
    );
    check(read('404.html').includes('Page not found'), '404.html is not the prerendered not-found page');

    // The page self-hosts its fonts; a Google Fonts @import back in the CSS is a render-blocking chain.
    const css = existsSync(join(dist, '_nuxt')) ? readdirSync(join(dist, '_nuxt')).filter((f) => f.endsWith('.css')) : [];
    for (const file of css) {
        check(!readFileSync(join(dist, '_nuxt', file), 'utf8').includes('fonts.googleapis.com'), `_nuxt/${file} still imports Google Fonts`);
    }
}

if (failures.length) {
    console.error(`check-hosting: ${failures.length} problem(s)\n  ✗ ${failures.join('\n  ✗ ')}`);
    process.exit(1);
}
console.info(`check-hosting: ok${configOnly ? ' (config only)' : ''}`);
