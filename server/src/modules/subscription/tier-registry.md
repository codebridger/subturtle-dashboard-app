# Stripe-driven tier registry + Adaptive Pricing

The subscription tier ladder (Starter / Learner / Fluent) is read from **Stripe at
runtime**, not from a hardcoded table. A product/marketing person can change a
tagline, feature label, credit budget, cap, trial length, or price in the Stripe
Dashboard and the server picks it up within the cache window — no code deploy.

## Components

| Piece | File | Role |
| --- | --- | --- |
| Types | [`tiers.ts`](tiers.ts) | `TierId`, `TierDefinition`, `FeatureKey`, … and a re-export of the service. Holds **no** tier data. |
| Registry service | [`tier-registry.service.ts`](tier-registry.service.ts) | Loads tiers from Stripe, parses metadata, caches, resolves by id/price/product. |
| Seed | [`tier-seed.ts`](tier-seed.ts) | Initial values the setup script pushes into Stripe. **Not** read at runtime. |
| Setup script | [`../../../scripts/setup-stripe-pricing.ts`](../../../scripts/setup-stripe-pricing.ts) | `yarn setup:stripe` — bootstraps/repairs Stripe products, prices, metadata. |
| Checkout / webhooks | [`../gateway/adapters/stripe.adapter.ts`](../gateway/adapters/stripe.adapter.ts) | Resolve tier via the registry; capture Adaptive Pricing currency. |

```
Stripe Dashboard (single source of truth)
        │  products + prices + metadata
        ▼
  TierRegistryService  ──(5-min SWR cache)
        │
   ┌────┴───────────────┬───────────────────┐
   ▼                    ▼                    ▼
 checkout            webhook            getSubscriptionPlans
 (adapter)           (adapter)          (subscription/functions)
```

## Stripe product metadata schema

A tier product is identified by `metadata.tierId`. The parser
(`parseTierProduct`) is strict — a missing/invalid key fails the whole refresh and
the last good cache is kept (logged), so a Dashboard typo can't half-break the
registry.

| Key | Example | Meaning |
| --- | --- | --- |
| `tierId` | `learner` | `starter` \| `learner` \| `fluent` |
| `status` | `live` | `live` (sellable) \| `dark` (Coming soon) |
| `tagline` | `Make real progress…` | Card subtitle |
| `creditsAmount` | `300000000` | Internal AI credit budget / window |
| `subscriptionDays` | `30` | Allocation window length |
| `trialDays` | `3` | Credit-card-required trial; `0` = none |
| `aiBudgetLabel` | `full monthly budget` | Comparison-table AI label |
| `featureLabels` | `["Save…","Full AI…"]` | JSON array of card bullets |
| `caps_<feature>` | `null` / `0` / `200` | Per-feature cap: `null`=unlimited, `0`=locked, `n`=hard cap |

`<feature>` ∈ `save_words, smart_review, ai_credits, weekly_insights,
session_history, live_conversations`. Stripe limits (50 keys, key ≤ 40 chars,
value ≤ 500 chars) are asserted by a unit test on the seed.

Prices are read live from Stripe (`unit_amount` + `recurring.interval`). We keep
**one GBP price per cadence per paid tier**; the free Starter product has no price
(`isPaid` is derived from price presence).

## Caching

- 5-minute TTL, **stale-while-revalidate**: only the first (cold) load blocks on
  Stripe; later refreshes run in the background while callers read the last
  snapshot. Mitigates the "every checkout blocks on Stripe" risk.
- Refresh failures keep the last good cache (logged).
- Invalidate without waiting out the TTL:
  - **Webhook** — `product.*` / `price.*` events call `invalidate()` (configure
    these events on the Stripe webhook endpoint).
  - **Admin RPC** — `invalidateTierCache` (`advanced_settings` permission).

## Adaptive Pricing

We charge a single **GBP base price**; Stripe Adaptive Pricing converts it to the
buyer's local currency at checkout (FX handled by Stripe; payouts stay GBP).

- Checkout sends only the GBP price and `adaptive_pricing: { enabled: true }`. The
  client's `currency` argument is accepted but ignored.
- The actual charged **presentment currency** lives on the **Checkout Session**
  (not the Subscription/Invoice). On `customer.subscription.created` the webhook
  looks it up (`checkout.sessions.list({ subscription })`) and stores it at
  `subscription.payment_meta_data.stripe.presentment_currency`.
- Adaptive Pricing must also be enabled in **Stripe Dashboard → Settings →
  Adaptive Pricing** (TEST **and** LIVE). The per-session flag is belt-and-suspenders.

Adaptive Pricing ≠ PPP (region-specific price tables). PPP is a separate follow-up.

## Freemium

The free allocation mirrors the **Starter tier** (`creditsAmount`,
`caps_save_words`, `caps_live_conversations`, `subscriptionDays`), read via the
registry with config-constant fallbacks (`config.ts` `FREEMIUM_DEFAULT_*`) so a
Stripe cold-start outage never blocks free signups. The Mongo TTL index on
`free_credit` uses the static `FREEMIUM_DURATION_DAYS` constant (an index expiry
can't be computed per-tier). Live-session gating goes through the tier-aware
`canStartFreemiumLiveSession` helper (`null` cap ⇒ unlimited).

## Rollout runbook

There are **no active paid subscriptions** (clean slate) — legacy USD/EUR prices
are archived in the same `setup:stripe` run; no compatibility window.

Do TEST first, verify end-to-end, then repeat for LIVE.

1. **Secrets** — `STRIPE_SECRET_KEY` (test key) + `STRIPE_WEBHOOK_SECRET` in
   `server/.env`.
2. **Seed Stripe** — `yarn setup:stripe` (preview first with
   `DRY_RUN=1 yarn setup:stripe`). Creates/updates the Starter (free), Learner,
   Fluent products with the full metadata, writes GBP prices, and archives every
   other active product/price (legacy Pro/Premium, USD/EUR matrix). Idempotent
   and re-runnable; it is a **bootstrap/repair** tool, so it resets metadata to
   the seed — make routine copy changes in the Dashboard, not by re-running it.
3. **Enable Adaptive Pricing** — Dashboard → Settings → Adaptive Pricing (TEST).
4. **Webhook events** — on the `/gateway/webhook/stripe` endpoint enable:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `product.created/updated/deleted`, `price.created/updated/deleted`.
5. **Deploy the server** (after the products exist, since the registry now reads
   Stripe; with no products it has nothing to serve).
6. **Verify** — see [the verification checklist](#verification-checklist).
7. **Repeat for LIVE** — see [Running against production](#running-setupstripe-against-production-manual-local),
   then enable the Adaptive Pricing toggle + webhook events on the LIVE endpoint
   and deploy.

## Running `setup:stripe` against production (manual, local)

Run it **manually from a local shell**, passing the LIVE key inline on the
command. Don't store the live key in `server/.env` — provide it per run. Always
dry-run first to review what would be archived (see the landmine above).

```bash
# 1. Preview (read-only, no confirmation flag needed)
DRY_RUN=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe

# 2. Apply (only after the preview looks right)
STRIPE_ALLOW_LIVE=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe
```

- The inline `STRIPE_SECRET_KEY` overrides any test key in `server/.env` (dotenv
  never overwrites an already-set var).
- A dry run writes nothing and is exempt from the `STRIPE_ALLOW_LIVE` guard; the
  real run requires `STRIPE_ALLOW_LIVE=1`.

## Verification checklist

- [ ] `tiers.ts` contains no feature labels, caps, credit budgets, trial days,
      prices, or amounts (types + service re-export only).
- [ ] `yarn setup:stripe` (TEST) creates Starter/Learner/Fluent with all metadata
      keys and GBP-only prices; legacy products/prices archived.
- [ ] `getSubscriptionPlans` returns Stripe-sourced plans; editing a tagline in
      the Dashboard is reflected within the cache TTL (or immediately after
      `invalidateTierCache` / a `product.updated` webhook) with no deploy.
- [ ] A TEST checkout creates a subscription via the webhook with the correct
      credit budget; a renewal refills it.
- [ ] A US buyer sees USD at checkout from the GBP base price; the webhook stores
      `presentment_currency` on `subscription.payment_meta_data.stripe`.
- [ ] A new signup gets a freemium allocation mirroring the Starter tier.
- [ ] `yarn test` green; `tsc --noEmit` clean.
