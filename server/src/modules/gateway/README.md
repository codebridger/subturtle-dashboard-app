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

2. **Payment Session Collection**: Tracks checkout sessions
   - User ID
   - Provider
   - Amount
   - Currency
   - Status
   - Provider-specific data

## Adapter Pattern

The module implements an adapter pattern through:

- `PaymentAdapter` interface: Defines consistent methods for payment providers
- `PaymentAdapterFactory`: Factory class for creating and managing provider adapters
- Provider-specific implementations (e.g., `StripeAdapter`)

This pattern allows for:
- Consistent interface across different payment providers
- Easy extension to support additional providers
- Isolation of provider-specific implementation details

## Usage

### Creating a Payment Session

```typescript
// Client-side code
const result = await functionProvider.run("createPaymentSession", {
  productId: "stripe_product_id",
  provider: "stripe", // Optional, defaults to Stripe
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
- `STRIPE_WEBHOOK_SECRET`: Secret for verifying Stripe webhook signatures
- `FRONTEND_URL`: Base URL for the frontend application (used for success/cancel URLs)

## Integration with Other Modules

- **Subscription Module**: Triggers add credits to user subscriptions upon successful payments
- **Auth Module**: User authentication for payment sessions 