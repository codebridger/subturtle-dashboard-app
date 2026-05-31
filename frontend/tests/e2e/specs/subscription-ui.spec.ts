import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * §7 (UI pass) of agent-tests/subscription/tier-ladder.spec.md — frontend surfaces.
 *
 * The API-side entitlement enforcement is covered exhaustively by
 * server/scripts/e2e-tier-ladder.js (38/38 against real Stripe test mode). This
 * spec verifies ONLY what a free / Starter user sees in the browser, and does so
 * HERMETICALLY: every backend call the SPA makes is stubbed via page.route, so the
 * suite needs only `yarn dev` on :3000 — no server, Mongo, or Stripe. That matches
 * the existing e2e config (its webServer starts the frontend only) and keeps the
 * spec deterministic + CI-friendly.
 *
 * Boot flow that gets stubbed (see frontend/plugins/modular-rest.ts, middleware/
 * auth.ts, stores/profile.ts, and @modular-rest/client services/authentication.js):
 *   auth middleware → authentication.loginWithLastSession()
 *     → POST verify/token            (validate the injected localStorage token)
 *     → POST data-provider/find-one  (profile)
 *     → POST function/run getSubscriptionDetails  (freemium snapshot)
 * Then each page's onMounted fires its own RPC. The two gated reads return HTTP 400
 * `TIER_LIMIT_REACHED: "<feature>"`, which the global axios response interceptor
 * turns into the single upgrade modal (composables/useTierLimitModal.ts +
 * layouts/default.vue), with feature-aware copy.
 */

// Any 24-char hex — opaque to the stubs; identity comes from the verify/token reply.
const USER_ID = '000000000000000000000001';

// getSubscriptionDetails payload for a free (Starter) user — the freemium snapshot.
const STARTER_DETAILS = {
    is_freemium: true,
    tier: 'starter',
    allowed_save_words: 200,
    allowed_lived_sessions: 3,
    voice_minutes_total: 5,
    total_credits: 5000000,
    usage_percentage: 0,
};

// getSubscriptionPlans payload — same shape as server plans.ts buildFromStripe():
// [Starter (free, from code), Reader, Learner, Coach], GBP base prices. Learner is
// the highlighted "Most popular" tier with a 3-day trial.
const PLANS = [
    {
        id: 'starter',
        status: 'live',
        name: 'Starter',
        tagline: 'Start learning English from the videos you already watch.',
        isPaid: false,
        featureLabels: ['Save up to 200 phrases a month', 'Unlimited Smart Review flashcards'],
        aiBudgetLabel: 'a taste each month',
        pricing: null,
        highlight: false,
        badge: null,
        trialDays: 0,
    },
    {
        id: 'reader',
        status: 'live',
        name: 'Reader',
        tagline: 'For casual learners.',
        isPaid: true,
        featureLabels: ['Unlimited saved phrases', 'Read-along translations'],
        aiBudgetLabel: 'more each month',
        pricing: { monthly: { gbp: 4.49 }, annual: { gbp: 42.99 } },
        highlight: false,
        badge: null,
        trialDays: 0,
    },
    {
        id: 'learner',
        status: 'live',
        name: 'Learner',
        tagline: 'Everything to learn faster.',
        isPaid: true,
        featureLabels: ['Progress insights', 'Full session history', '90 voice minutes'],
        aiBudgetLabel: 'plenty each month',
        pricing: { monthly: { gbp: 10.99 }, annual: { gbp: 104.99 } },
        highlight: true,
        badge: 'Most popular',
        trialDays: 3,
    },
    {
        id: 'coach',
        status: 'live',
        name: 'Coach',
        tagline: 'For power users.',
        isPaid: true,
        featureLabels: ['Everything in Learner', '300 voice minutes'],
        aiBudgetLabel: 'the most each month',
        pricing: { monthly: { gbp: 24.99 }, annual: { gbp: 239.99 } },
        highlight: false,
        badge: null,
        trialDays: 0,
    },
];

// The SPA talks to BASE_URL_API (a different origin than the :3000 dev server), so
// the stubbed responses must carry CORS headers and answer the preflight, exactly
// like the real backend does — otherwise the browser would hide the body from JS.
function corsHeaders(route: Route): Record<string, string> {
    const origin = route.request().headers()['origin'] || '*';
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type,origin,accept,x-requested-with',
    };
}

function preflight(route: Route) {
    return route.fulfill({ status: 204, headers: corsHeaders(route) });
}

function respond(route: Route, status: number, body: unknown) {
    return route.fulfill({
        status,
        headers: { ...corsHeaders(route), 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// Inject a session token before any page script runs. @modular-rest/client reads the
// JWT from localStorage 'token' on boot (services/authentication.js#loadSession); the
// value is opaque (the user comes from the stubbed verify/token reply), so any
// non-empty string boots the SPA authenticated.
async function seedSession(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('token', 'e2e-fake-jwt');
    });
}

// Stub every backend endpoint the SPA hits, for a free/Starter user.
async function stubBackend(page: Page) {
    // Token validation → a real "user" so the auth middleware lets the page render.
    await page.route('**/verify/token', (route) =>
        route.request().method() === 'OPTIONS'
            ? preflight(route)
            : respond(route, 200, { user: { id: USER_ID, email: 'e2e@example.com', type: 'user', permissionGroup: ['user'] } })
    );

    // dataProvider CRUD — server envelope is { status, data }; the client unwraps .data.
    await page.route('**/data-provider/find-one', (route) =>
        route.request().method() === 'OPTIONS'
            ? preflight(route)
            : respond(route, 200, { status: 'success', data: { _id: 'profile1', refId: USER_ID, name: 'E2E User', gPicture: '' } })
    );
    await page.route('**/data-provider/find', (route) =>
        route.request().method() === 'OPTIONS' ? preflight(route) : respond(route, 200, { status: 'success', data: [] })
    );
    await page.route('**/data-provider/count', (route) =>
        route.request().method() === 'OPTIONS' ? preflight(route) : respond(route, 200, { status: 'success', data: 0 })
    );

    // RPCs — branch on the function name in the POST body.
    await page.route('**/function/run', (route) => {
        if (route.request().method() === 'OPTIONS') return preflight(route);
        const name = (route.request().postDataJSON() || {}).name as string;
        switch (name) {
            case 'getSubscriptionDetails':
                return respond(route, 200, { status: 'success', data: STARTER_DETAILS });
            case 'getSubscriptionPlans':
                return respond(route, 200, { status: 'success', data: PLANS });
            // Gated reads → 400 lock; the global interceptor opens the upgrade modal.
            case 'getUserStatistic':
                return respond(route, 400, { status: 'error', message: 'TIER_LIMIT_REACHED: "weekly_insights"' });
            case 'list-live-sessions':
                return respond(route, 400, { status: 'error', message: 'TIER_LIMIT_REACHED: "session_history"' });
            // Fail the Adaptive-Pricing currency probe so the cards fall back to the
            // GBP base price (no Stripe.js network, no localized currency) — §7 asserts £.
            case 'createCustomCheckoutSession':
                return respond(route, 400, { status: 'error', message: 'currency probe disabled in e2e' });
            default:
                return respond(route, 200, { status: 'success', data: {} });
        }
    });

    // Belt-and-suspenders: keep the test fully offline even if a publishable key is
    // configured in the dev env (the currency probe is already disabled above).
    await page.route(/js\.stripe\.com/, (route) => route.abort());
    await page.route(/mixpanel\.com/, (route) => route.abort());
}

test.describe('Subscription UI — free/Starter surfaces (§7)', () => {
    test.beforeEach(async ({ page }) => {
        await seedSession(page);
        await stubBackend(page);
    });

    // The headlessui Dialog's role="dialog" element is a zero-size wrapper (its
    // children are position:fixed), so it reads as "hidden". Assert visibility on the
    // panel CONTENT scoped within the dialog instead — which also excludes the
    // sessions page's in-page lock panel that repeats the same feature copy.
    test('/statistic shows the global upgrade modal (weekly_insights locked)', async ({ page }) => {
        await page.goto('/#/statistic');

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Upgrade to unlock')).toBeVisible();
        await expect(dialog.getByText('Progress insights are a Learner feature.')).toBeVisible();
    });

    test('/sessions shows the global upgrade modal (session_history locked)', async ({ page }) => {
        await page.goto('/#/sessions');

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Upgrade to unlock')).toBeVisible();
        await expect(dialog.getByText('Full session history is a Learner feature.')).toBeVisible();
    });

    test('/settings/subscription renders four plan cards with GBP base prices', async ({ page }) => {
        await page.goto('/#/settings/subscription');

        // All four tiers render as cards.
        await expect(page.getByRole('heading', { name: 'Starter', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Reader', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Learner', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Coach', exact: true })).toBeVisible();

        // Starter is the free user's current level (not a "Downgrade" CTA).
        await expect(page.getByText('Current plan')).toBeVisible();

        // Learner is the highlighted tier: "Most popular" ribbon + 3-day trial CTA.
        await expect(page.getByText('Most popular')).toBeVisible();
        await expect(page.getByText('Start 3-day free trial')).toBeVisible();

        // GBP base prices (Adaptive Pricing probe disabled → £ fallback).
        await expect(page.getByText('£4.49')).toBeVisible();
        await expect(page.getByText('£10.99')).toBeVisible();
        await expect(page.getByText('£24.99')).toBeVisible();
    });
});
