# landing — subturtle.app

The marketing site. Nuxt 4 with `nuxt generate`: every route is prerendered to a flat HTML file
(`index.html`, `privacy.html`, `terms.html`, `404.html`) and served from its own Firebase Hosting
site, the `landing` target in [../.firebaserc](../.firebaserc). It has no SPA fallback and no
Firebase SDK; it links into the dashboard and the Chrome Web Store by URL.

The UI is built on [subturtle-ui](../ui/README.md) (`link:../ui`, built by `postinstall`), with
page-level CSS written against its tokens.

## Run it

```bash
cd landing
yarn install                      # also builds ../ui
cp .env.local.example .env.local  # if you do not have one yet; see below
yarn dev                          # http://localhost:3100
```

`.env.local` (gitignored) needs the two origins; everything else is optional:

| Variable | Required | |
| --- | --- | --- |
| `NUXT_PUBLIC_SITE_URL` | yes | Absolute origin, no trailing slash. Canonicals, sitemap, Open Graph. Only `https://subturtle.app` builds are indexable. |
| `NUXT_PUBLIC_DASHBOARD_URL` | yes | Where "Open dashboard" and the paid-plan buttons go. |
| `NUXT_PUBLIC_MIXPANEL_PROJECT_TOKEN` | no | Unset means no analytics and no consent banner. |
| `NUXT_PUBLIC_GOOGLE_ADS_ID` | no | Production only. Loads after consent, like Mixpanel. |
| `NUXT_PUBLIC_FILM_YOUTUBE_ID` | no | The pitch film. Unset shows the poster alone. |
| `NUXT_PUBLIC_FILM_SRC` | no | `nuxt dev` only: a local file in the gitignored `.film/`, served at `/film/`. Never deployed. |
| `NUXT_PUBLIC_PRODUCT_HUNT_POST_ID` / `_SLUG` | no | Shows the Product Hunt badge in the proof strip. |

The build refuses to run without both origins: an unset one would silently ship relative CTAs and
canonicals.

## How it works

- **Pricing** comes from Stripe through the API's anonymous `getSubscriptionPlans` RPC, fetched at
  build time by `scripts/sync-plans.mjs <api-origin>` into `app/data/plans.json` (gitignored).
  Without it, the build uses the committed `app/data/plans.snapshot.json`. The page never fetches
  at runtime.
- **Calls to action** carry the visit's UTM parameters (`app/composables/useCta.ts`). They are read
  from the router after hydration, not from `window.location`, which Nuxt briefly rewrites while a
  prerendered page hydrates. `utm_source=producthunt` (or Product Hunt's own `?ref=producthunt`)
  swaps the hero eyebrow for a welcome line.
- **Analytics** (`app/composables/useAnalytics.ts`): nothing loads and no cookie is set until the
  visitor accepts the consent banner. Then Mixpanel (the dashboard's project for that environment,
  `app: 'landing'`) and, in production, the Google Ads tag. Every `track()` is a guarded no-op
  without consent or a token. Events: `landing-page_viewed`, `install-cta_clicked`,
  `dashboard-cta_clicked`, `pricing-plan_clicked`, `pricing-cadence_changed`, `hero-demo_used`,
  `faq-item_opened`, `film_played` (`location` / `tier` / `cadence` properties as relevant).
- **Contrast**: page CSS uses the design system's semantic aliases, which meet WCAG AA for text.
  The brand rose-500 appears only on large type and decoration (see `ui/README.md`, Tokens).
- **Fonts** are self-hosted (`public/fonts/`, SIL OFL). `nuxt.config.ts` drops the Google Fonts
  `@import` that subturtle-ui's stylesheet carries, because it was a render-blocking chain.
- **404**: `nuxt generate` writes `404.html` as an empty client-rendered shell. A `prerender:done`
  hook replaces it with the prerendered `/not-found` page.
- **Legal pages** are Markdown in `app/legal/`, ported word for word from the ClickUp pages the
  Framer site linked to, and rendered to HTML at build time (the `?html` loader).

## Deploy

`infra/deploy-landing.sh dev|prod`: install, sync prices, typecheck, generate, then
`scripts/check-hosting.mjs`, and only then `firebase deploy --only hosting:landing`. The gate
fails on a missing or empty `dist/`, a rewrite on the landing target, a broken dashboard config in
the shared `firebase.json`, a wrong `noindex` for the environment, missing prices, a video file,
or a Google Fonts import back in the CSS. Run it by hand after any build:

```bash
node scripts/check-hosting.mjs              # needs a build
node scripts/check-hosting.mjs --config-only
```

CI deploys the landing page only for environments listed in the repository variable
`LANDING_ENVIRONMENTS`; see [../infra/README.md](../infra/README.md).

To reproduce Hosting's `cleanUrls`, redirects and 404 locally (the dev server implements none of
them), serve a build with the emulator on port 5010:

```bash
npx firebase-tools@15 emulators:start --only hosting:landing --project subturtle-dev
```
