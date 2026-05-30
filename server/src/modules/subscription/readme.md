This document outlines the design of Subturtle's internal credit-based subscription module. The module serves as a critical component that tracks and manages credit consumption across various services while maintaining a seamless user experience. By operating behind the scenes, it enables controlled resource allocation without exposing limitations directly to users. This system balances business sustainability with quality of service, providing flexible interfaces for other modules to interact with credit management while maintaining clear boundaries of responsibility.

## Tier entitlements: Stripe metadata is the source of truth (ADR-004 / Council 004)

Paid-tier entitlements (credits, voice minutes, feature caps, flags, trial/duration)
live in **Stripe product metadata**, not in code. `entitlements.ts` is the only place
that reads and validates that metadata:

- `parseTierMetadata(product)` validates the metadata with a strict zod schema and a
  `schema_version`; it throws (never guesses) on a missing key, a bad number, an
  out-of-range credits/voice value, or an unknown version. `resolveEntitlements` /
  `listTierEntitlements` / `resolveTierCheckout` read through a short-TTL cache.
- The Stripe webhook grants from the parsed metadata. It snapshots the entitlements
  onto the subscription document at purchase (`entitlements`) and re-reads them only on
  a real period rollover — a mid-period metadata edit reaches a customer at their next
  renewal. Grants are **idempotent** on (Stripe subscription id, `granted_period_end`),
  so a duplicate or out-of-order webhook cannot double-grant. Invalid metadata is a
  fail-safe **refusal** (non-2xx so Stripe retries) plus an `entitlement-grant-refused`
  alert — never a guessed amount or a silent drop to free.
- `getSubscriptionPlans` is built from the live Stripe products through a TTL cache with
  a last-known-good snapshot (real Stripe data). There is **no baked-in plan fallback**:
  if Stripe has never succeeded (cold start + outage) it throws, and the frontend shows a
  skeleton while loading + a "payment system unavailable" notice on failure — never
  invented plan data.
- Checkout uses **one GBP base price** per tier/cadence + Stripe Adaptive Pricing; the
  customer pays in their local currency but we settle and report in GBP.
- Display copy for PAID tiers (name = the Stripe product name; `tagline`, `feature_<n>`
  bullets, `ai_budget_label`, `highlight`, `badge`) also lives in **Stripe metadata** and
  is parsed leniently in `display.ts` (a copy typo must never block a money grant or 500
  the pricing page). The only tier defined in code is the **free Starter** (it has no
  Stripe product): its copy is `STARTER_TIER` in `tiers.ts` and its caps live in
  `config.ts`. Feature gating reads resolved entitlements (paid) or config (Starter) via
  `featureCapFor` / `featureAllowedFor`.

New schema fields on the subscription/free_credit collections: `voice_minutes_total`,
`voice_minutes_used`, plus `granted_period_end` and the `entitlements` snapshot on the
subscription doc.

**Migration:** with ~zero paid users this is a no-op. The new fields are optional with
defaults, so any pre-existing document still reads correctly; a pre-existing paid
subscription picks up its entitlement snapshot + voice budget on its next renewal.

## System Architecture Overview

The subscription system functions as an internal module within the Subturtle backend application, silently managing credit allocations and usage tracking without exposing limitations to end users. The module provides a clean API for other system components to check balances, record usage, and manage credit allocation.

## Core Mechanisms and Module Interface

### Module Methods

The subscription module exposes the following methods to other parts of the system:

1. **checkCreditAllocation(userId, minCredits?)**
    *   Purpose: Determine if a user has sufficient balance for requested operations
    *   Returns: Available credits, subscription end date, and allowed-to-proceed flag
    *   Usage: Called before initiating credit-consuming operations
    *   Internal process: Checks the current active subscription for available credits
    *   Triggers: Emits low-credits event if credits are below the threshold
2. **addNewSubscriptionWithCredit(userId, creditAmount, totalDays, paymentDetails)**
    *   Purpose: Add Credits to a user's account upon successful payment
    *   Called by: Payment gateway after successful transaction
    *   Process: Adds the specified Credit amount, creates subscription, and triggers events
    *   Returns: Updated subscription details including expiration date and Credit balance
3. **recordUsage(userId, serviceType, costInputs, modelUsed?, details?)**
    *   Purpose: Track service usage and deduct appropriate Credits
    *   Process: Uses calculator service to convert usage metrics to Credit costs
    *   Input: Takes an array of CostCalculationInput objects for precise cost calculation
    *   Returns: Remaining Credit balance, usage ID, status, and detailed cost breakdown
4. **subscriptionEvents**
    *   Event emitters for other modules to subscribe to:
        *   `low_credits`: Triggered when user falls below threshold (internal only)
        *   `subscription_change`: Triggered when subscription status changes
        *   `subscription_expired`: Triggered when subscription expires
        *   `subscription_renewed`: Triggered when subscription is renewed
        *   `usage_spike`: Triggered when a user's usage exceeds a defined threshold (internal only)
    *   Purpose: Allow other modules to react to subscription-related events without tight coupling

### API Functions

The module exposes these API functions for external access:

1. **getSubscriptionDetails**
    *   Purpose: Retrieve comprehensive information about a user's active subscription
    *   Returns: Complete subscription object with credit information
    *   Access: Requires user authentication

### Core Components

1. **Calculator Service**: Converts AI operations to credit costs with high precision
    *   Uses decimal.js-light for accurate financial calculations
    *   Provides utilities for USD <-> Credit conversions
    *   Handles detailed cost breakdowns for multiple token types
2. **Subscription Service**: Manages subscription lifecycle and credit allocations
3. **Events System**: Provides event-driven communication for subscription state changes

## Core Mechanism Details

### Credit Allocation and Calculation

1. **High-Precision Calculation**
    *   Uses `COST_TRANSPOSE` factor (100 million) for representing currency with integer precision
    *   Implements formula: `(costPerMillion × transpose × totalTokens) ÷ tokenUnit`
    *   Handles multiple expense items per operation with detailed breakdowns
2. **Token Cost Tracking**
    *   Each AI service operation is calculated based on token usage and pricing per million tokens
    *   The system maintains independent cost tracking for different token types (e.g., input vs. output)
    *   Costs are stored in both USD and transposed credit values for flexibility
3. **Balance Management**
    *   The system maintains total subscription credits and available credits
    *   Credit thresholds trigger warnings when balances fall below configured levels

## Database Schema

#### Subscriptions Table

```plain
_id: ObjectId (PK)
user_id: ObjectId (FK)
tier: ENUM (starter, learner, fluent)
subscription_type: ENUM (monthly, annual)
price_id: String (Stripe price ID that created the subscription)
trial_end: Date (set while the subscription is trialing)
start_date: Date
end_date: Date
total_credits: Number
credits_used: Number
status: ENUM (active, canceled, expired, incomplete, incomplete_expired, past_due, paused, trialing, unpaid)
available_credit: Number (virtual/calculated)
usage_percentage: Number (virtual/calculated)
```

#### Usage Table

```plain
_id: ObjectId (PK)
user_id: ObjectId (FK)
subscription_id: ObjectId (FK)
service_type: String
credit_used: Number
token_count: Number
model_used: String
timestamp: Date
status: ENUM (paid, unpaid, overdraft)
details: Object
  - costBreakdown: Array (detailed cost breakdown per token type)
```

## Implementation Considerations

### Technical Aspects

*   Uses decimal.js-light for high-precision financial calculations
*   Centralized configuration in `config.ts` for easy maintenance
*   Implements event-driven architecture for subscription state changes
*   Provides detailed cost breakdowns for analytics and transparency

### Architecture Highlights

*   Calculator service acts as a standalone component for reuse across the system
*   Modular design with clear separation of concerns
*   Event system enables loose coupling between subscription management and consumers
*   Configuration-driven thresholds and conversion factors

#### Stripe/Payment Metadata
- If the subscription is paid via Stripe, the `payment_meta_data` field contains Stripe-specific details (e.g., `subscription_id`, `label`).
- The API normalizes and enriches subscription details with Stripe data when available.

Several virtual/computed fields are available on the Subscription model for analytics and reporting:
- `available_credit`: Calculated as `total_credits - credits_used`.
- `remaining_days`: Days left until subscription expiration.
- `usage_percentage`: Percentage of credits used.
- `total_credit_in_usd`, `used_credit_in_usd`, `available_credit_in_usd`: Credit values converted to USD using the calculator service.