// Re-exports tier registry TYPES for frontend use. Runtime tier data comes from the
// `getSubscriptionPlans` RPC — the frontend never imports the registry's values
// (which carry Stripe price IDs) directly.
export type {
    TierId,
    Cadence,
    Currency,
    TierStatus,
    FeatureKey,
    TierPrices,
    TierAmounts,
    TierDefinition,
    PublicTierPlan,
} from '../../server/src/modules/subscription/tiers';

// Stable error code the live-session AI gates throw when the budget is exhausted.
// Re-exported so the frontend has a single source of truth to pattern-match on.
export { AI_CREDIT_EXHAUSTED_CODE } from '../../server/src/modules/subscription/config';
