# Gateway Module

## Overview

The Gateway Module manages payment processing and integration with payment providers (currently Stripe) for the application. It handles payment sessions, checkout processes, webhooks, and subscription management, providing a unified interface for the application to interact with different payment providers.

## Key Features

- **Payment Gateway Integration**: Currently implements Stripe with an extensible adapter pattern to support additional providers.
- **Checkout Session Management**: Creates and manages payment checkout sessions.
- **Payment Verification**: Verifies payment status and processes successful payments.
- **Webhook Handling**: Provides endpoints for payment provider webhook integration.
- **Subscription Management**: Connects payments to user subscription credits.
- **Adapter Pattern**: Implements a factory pattern to support multiple payment providers through a consistent interface.

## Architecture

### Components

1. **Service Layer** (`service.ts`): Core business logic for payment processing.
2. **Data Layer** (`db.ts`): MongoDB collections for payments and payment sessions.
3. **Functions** (`functions.ts`): Exposed functions for client-side API consumption.
4. **Router** (`router.ts`): API endpoints for webhook handling.
5. **Triggers** (`triggers.ts`): Database triggers for post-payment processing.
6. **Types** (`types.ts`): Type definitions for the module.
7. **Adapters** (`adapters/`): Payment provider implementations.

### Data Flow

1. **Checkout Flow**:
   - Client requests checkout session
   - Gateway creates provider-specific session
   - Payment session stored in database
   - Checkout URL returned to client

2. **Webhook Flow**:
   - Provider sends webhook event
   - Gateway verifies and processes the event
   - Payment status updated
   - Subscription credits added on successful payment

3. **Verification Flow**:
   - Client requests payment verification
   - Gateway checks payment status with provider
   - Updates payment record
   - Returns verification result

## Database Collections

1. **Payment Collection**: Stores completed payment records
   - User ID
   - Provider
   - Amount
   - Currency
   - Status
   - Provider-specific data
   - Metadata (optional)

2. **Payment Session Collection**: Tracks checkout sessions
   - User ID (ObjectId)
   - Provider
   - Amount
   - Currency
   - Status
   - Provider-specific data

3. **Stripe Customer Collection**: Maps user IDs to Stripe customer IDs
   - User ID
   - Stripe Customer ID

## Adapter Pattern

The module implements an adapter pattern through:

- `PaymentAdapter` interface: Defines consistent methods for payment providers
- `PaymentAdapterFactory`: Factory class for creating and managing provider adapters
- Provider-specific implementations (e.g., `StripeAdapter`)

> **Note:** Currently, only the Stripe provider is implemented. The system is designed for easy extension to additional providers in the future.

This pattern allows for:
- Consistent interface across different payment providers
- Easy extension to support additional providers
- Isolation of provider-specific implementation details

## Usage

### Creating a Payment Session

The session is created from a tier + billing cadence — the frontend never holds
raw Stripe price IDs. The adapter resolves the GBP base price from the
Stripe-backed tier registry (`TierRegistryService`; see
[`subscription/tier-registry.md`](../subscription/tier-registry.md)). Stripe
Adaptive Pricing converts the GBP base to the buyer's local currency at checkout,
so no per-currency argument is needed (a `currency` field is still accepted for
backward compatibility but ignored).

```typescript
// Client-side code
const result = await functionProvider.run("createPaymentSession", {
  tierId: "learner",   // a paid, live tier
  cadence: "monthly",  // "monthly" | "annual"
  userId: currentUserId,
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel"
});

// Redirect user to checkout
window.location.href = result.url;
```

### Verifying Payment

```typescript
// Client-side code
const result = await functionProvider.run("verifyPayment", sessionId);

if (result.success) {
  // Payment successful
} else {
  // Payment failed
}
```

### Webhook Configuration

Configure your payment provider (Stripe) to send webhooks to:

```
https://your-api-domain.com/gateway/webhook/stripe
```

Enable these events on the endpoint:

- `checkout.session.completed`
- `customer.subscription.created` / `.updated` / `.deleted`
- `product.created` / `.updated` / `.deleted`
- `price.created` / `.updated` / `.deleted`

The `customer.subscription.*` events drive subscription create / credit-refill /
cancel and record the Adaptive Pricing presentment currency; the `product.*` /
`price.*` events invalidate the cached tier registry so Dashboard edits take
effect without a deploy.

## Tier / pricing setup (`setup:stripe`)

Subscription tiers — names, taglines, feature labels, caps, credit budgets, trial
days, and prices — are **read from Stripe at runtime** (cached) via
`TierRegistryService`, not hardcoded. Product/marketing change pricing in the
Stripe Dashboard with no deploy. (Architecture, metadata schema, caching, and
Adaptive Pricing details:
[`../subscription/tier-registry.md`](../subscription/tier-registry.md).)

`yarn setup:stripe` (`server/scripts/setup-stripe-pricing.ts`) **seeds** those
Stripe products / prices / metadata from `subscription/tier-seed.ts`.

**When** — it's a deliberate, occasional **migration**: first-time setup, or when
adding a tier / metadata key. It is **not** part of any deploy — it's destructive
(archives non-conforming products/prices) and resets metadata to the seed, which
would clobber Dashboard edits. Run it once before the pricing code first serves
traffic in an environment.

**Where / how** — manually, from a local shell in `server/`, with the key passed
inline (never stored in `server/.env`). Always dry-run first to review what gets
archived:

```bash
# Preview (read-only, no flag needed) — works for TEST or LIVE
DRY_RUN=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe

# Apply — a LIVE run requires the explicit guard flag
STRIPE_ALLOW_LIVE=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe
```

- **TEST vs LIVE** is chosen purely by the key prefix (`sk_test_` / `rk_test_` →
  TEST, `sk_live_` / `rk_live_` → LIVE). The inline `STRIPE_SECRET_KEY` overrides
  any key in `server/.env` (dotenv never overwrites an already-set var).
- A LIVE run is **refused unless `STRIPE_ALLOW_LIVE=1`**; a dry run is exempt
  because it writes nothing.
- ⚠️ `setup:stripe` archives **every active product without a known tier id** —
  on a LIVE account that holds other products, dry-run first and confirm the list.

After seeding: enable Adaptive Pricing (Dashboard → Settings → Adaptive Pricing)
and the webhook events listed above. Full rollout runbook + verification
checklist: [`../subscription/tier-registry.md`](../subscription/tier-registry.md).

## Environment Variables

- `STRIPE_SECRET_KEY`: Stripe API secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret. When set, the
  `/webhook/stripe` handler verifies the signature; when unset it accepts the
  parsed payload unverified and logs a warning (local dev only).

## Integration with Other Modules

- **Subscription Module**: Triggers add credits to user subscriptions upon successful payments
- **Auth Module**: User authentication for payment sessions 

## Local development — Stripe webhooks

Stripe can't reach `localhost`, so subscription creation (which happens in the
`customer.subscription.created` webhook) won't run locally without the Stripe
CLI forwarding events:

```bash
stripe login                                                     # one-time
stripe listen --forward-to localhost:8080/gateway/webhook/stripe  # keep running
```

`stripe listen` prints a `whsec_...` signing secret — put it in `server/.env`
as `STRIPE_WEBHOOK_SECRET` and restart the server. It only forwards events that
fire **while it is running**; events from an earlier checkout are missed — run a
fresh checkout, or resend the event from the Stripe dashboard.

The webhook route is mounted at `/gateway/webhook/stripe` (modular-rest mounts
each module's router under `/<module-name>`).

## 3-day trial

The Learner tier's 3-day, credit-card-required trial is **not** a Stripe
dashboard / product / price setting — it is applied in code, per checkout
session. `createCheckoutSession` (`adapters/stripe.adapter.ts`) sets
`subscription_data.trial_period_days` from `tier.trialDays`, and
`payment_method_collection: "always"` forces the card up front. The trial
length comes from the tier's Stripe metadata (`trialDays`), surfaced as
`tier.trialDays` by the registry — change it in the Stripe Dashboard, no deploy.

To inspect a trial in Stripe, look at the resulting **Subscription** (Customers
→ the customer, or Billing → Subscriptions) — it shows status `Trialing` with a
trial-end date. Nothing trial-related appears on the Product or Price.