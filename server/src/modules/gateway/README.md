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

### Creating a checkout session

A session is created from a tier + billing cadence — **no currency** (see
[Adaptive Pricing](#adaptive-pricing--localized-currency) below). The adapter
resolves the single GBP price LIVE from the Stripe product whose metadata
`tier_id` matches the requested tier (`resolveTierCheckout` in
`adapters/stripe.adapter.ts`), so the frontend never holds raw price IDs.

**Embedded Custom Checkout — the current in-app flow.** Renders the payment form
and the localized price on our own page (no redirect); returns a `client_secret`
for the Stripe Checkout Elements SDK:

```typescript
const { clientSecret } = await functionProvider.run("createCustomCheckoutSession", {
  tierId: "learner",   // a paid, live tier
  cadence: "monthly",  // "monthly" | "annual"
  userId: currentUserId,
  successUrl: "https://example.com/#/payment-success",
});
// frontend (components/subscription/CheckoutPanel.vue):
//   stripe.initCheckoutElementsSdk({ clientSecret, adaptivePricing: { allowed: true } })
```

**Hosted redirect — legacy.** `createPaymentSession` returns a `url` to redirect
to Stripe's hosted checkout page. Kept for compatibility; the in-app flow uses
the embedded session above.

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

## Adaptive Pricing & localized currency

Tiers have **one GBP base price** per cadence (no per-currency price IDs). Stripe
Adaptive Pricing converts that to the customer's local currency for display and
checkout, and settles back to GBP (ADR-004 / S7).

**Where the localized amount comes from.** Stripe computes the presentment
currency + amount **client-side, from the customer's location**, inside
`Stripe.js`. It is NOT available server-side — the API Checkout Session always
reports GBP (`currency: "gbp"`, `amount_total` in pence, no `presentment_details`
before the client interacts). So any localized figure must be read via the
Checkout Elements SDK in the browser:

- **Checkout panel** (`frontend/components/subscription/CheckoutPanel.vue`):
  `initCheckoutElementsSdk` → `loadActions()` → `getSession()`. The recurring
  localized price is `lineItems[0].unitAmount.amount` (the session `total` is the
  amount due *today*, which is 0 during a free trial). The Currency Selector
  Element is mounted alongside the Payment Element.
- **Pricing cards** (`frontend/pages/settings/subscription.vue`): on load it
  probes one session, reads Stripe's true rate
  `getSession().currencyOptions[].currencyConversion.fxRate`, and converts every
  card's GBP price with `Intl.NumberFormat` (cached per browser session in
  `sessionStorage["subturtle.localPricing"]`). Falls back to the GBP base if there
  is no publishable key, Stripe is unavailable, or the presentment currency is GBP.
  While that probe is in flight (cache miss only — tracked by `isProbingCurrency`),
  each card's price shows a skeleton placeholder instead of the GBP base, so the
  amount doesn't flash GBP and then switch to the localized value. Cache hits and
  the no-key path resolve synchronously, so they skip the skeleton entirely.

**Settlement is always GBP.** The customer pays in their local (presentment)
currency, but we store the GBP amount on `payment_session`/`payment`, and the
webhook grants from product metadata (currency-independent). Refunds, proration,
and tax all settle in GBP.

**Setup:** enable Adaptive Pricing once in the Stripe Dashboard
(Settings → Payments → Adaptive Pricing); sessions also pass
`adaptive_pricing: { enabled: true }`. The frontend needs the publishable key
`NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…` / `pk_live_…`) — without it no
`Stripe.js` loads and every price falls back to the GBP base.

## Testing localized / adaptive pricing

**Key gotcha:** in **test mode** Adaptive Pricing localizes by the customer's
location set through a **`+location_XX` email**, NOT by the browser IP — the
dev/test environment can't geolocate a real IP, so a **VPN does nothing in test
mode**. Real-IP geolocation (where a VPN matters) is **live-mode only**.

### Test mode (no VPN)

Tag the Stripe customer's email with a country code and the session presents that
country's currency. Verified for the Learner £10.99 base:

| Location tag | Currency | Price |
| --- | --- | --- |
| `+location_GB` | GBP | £10.99 |
| `+location_FR` (any EUR country) | EUR | €13.19 |
| `+location_US` | USD | $15.39 |
| `+location_JP` | JPY | ¥2,450 (zero-decimal) |
| `+location_TR` | TRY | ₺706.15 |

There is **no email-signup UI** (login is Google), so create a location-tagged
test account via the modular-rest auth API (dev verification code is always
`123456`):

```bash
BASE=http://localhost:8080
H=(-H 'Content-Type: application/json' -H 'Origin: http://localhost:3000')
EMAIL='you+location_TR@gmail.com'   # Gmail ignores the +tag; Stripe reads +location_TR
PW='Test1234!'
curl -s "${H[@]}" "$BASE/user/register_id"     -d "{\"idType\":\"email\",\"id\":\"$EMAIL\"}"
curl -s "${H[@]}" "$BASE/user/validateCode"    -d "{\"idType\":\"email\",\"id\":\"$EMAIL\",\"code\":\"123456\"}"
curl -s "${H[@]}" "$BASE/user/submit_password" -d "{\"idType\":\"email\",\"id\":\"$EMAIL\",\"password\":\"$PW\",\"code\":\"123456\"}"
curl -s "${H[@]}" "$BASE/user/login"           -d "{\"idType\":\"email\",\"id\":\"$EMAIL\",\"password\":\"$PW\"}"   # -> { token }
```

Inject the returned token in the browser console at `localhost:3000` and reload:

```js
localStorage.setItem('token', 'PASTE_TOKEN'); sessionStorage.clear(); location.reload();
```

`/#/settings/subscription` then shows that country's currency. Change the
`+location_XX` code to test another country, and `sessionStorage.clear()` between
tries (the rate is cached). Alternatively, edit an existing customer's
email/address to that country in the Stripe **test** Dashboard.

> Run the server with the schedule-crash fix and on **node 16–18** (node 14/22
> break this stack), or the `/user/login` step can crash the server.

### Live mode (real VPN / IP)

`yarn setup:stripe` with the live key, set `pk_live_…`, and enable Adaptive
Pricing in the Dashboard. Then a real visitor's IP (or a VPN) drives the currency
automatically — Turkey → TRY, etc. — with no email trick. This is the only way to
validate the IP/VPN path.

## 3-day trial

The Learner tier's 3-day, credit-card-required trial is applied in code per
checkout session, but the length now lives in **Stripe product metadata**
(`trial_days`), parsed into `entitlements.trialDays` (ADR-004).
`createCustomCheckoutSession` / `createCheckoutSession`
(`adapters/stripe.adapter.ts`) set `subscription_data.trial_period_days` from
`entitlements.trialDays`, and `payment_method_collection: "always"` forces the
card up front. Changing the trial length is a metadata edit on the Stripe product
— no code change or deploy.

To inspect a trial in Stripe, look at the resulting **Subscription** (Customers →
the customer, or Billing → Subscriptions) — it shows status `Trialing` with a
trial-end date. The trial config itself lives in the product metadata and is
applied per session, not on the Price.