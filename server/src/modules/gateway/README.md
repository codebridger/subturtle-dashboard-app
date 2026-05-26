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

The session is created from a tier + billing cadence + currency — the frontend
never holds raw Stripe price IDs. The adapter resolves the price from the tier
registry (`subscription/tiers.ts`).

```typescript
// Client-side code
const result = await functionProvider.run("createPaymentSession", {
  tierId: "learner",   // a paid, live tier
  cadence: "monthly",  // "monthly" | "annual"
  currency: "usd",     // "usd" | "eur" | "gbp"
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
length lives in the registry — `subscription/tiers.ts` (`learner.trialDays`) —
so changing it needs no Stripe change.

To inspect a trial in Stripe, look at the resulting **Subscription** (Customers
→ the customer, or Billing → Subscriptions) — it shows status `Trialing` with a
trial-end date. Nothing trial-related appears on the Product or Price.