// Re-exports tier registry TYPES for frontend use. Runtime tier data comes from the
// `getSubscriptionPlans` RPC — the frontend never imports the registry's values
// (which carry Stripe price IDs) directly.
export type {
    TierId,
    Cadence,
    TierStatus,
    FeatureKey,
    TierAmounts,
    TierDefinition,
    PublicTierPlan,
} from '../../server/src/modules/subscription/tiers';

// Stable error code the live-session AI gates throw when the budget is exhausted.
// Re-exported so the frontend has a single source of truth to pattern-match on.
export { AI_CREDIT_EXHAUSTED_CODE } from '../../server/src/modules/subscription/config';

// Stable code thrown when a tier limit/lock blocks an action (save_words cap,
// weekly_insights / session_history lock, voice budget, live-session count). A
// global interceptor matches it to show the upgrade modal — single source of truth.
// Imported from config (dependency-free) NOT enforcement, so the browser bundle
// doesn't pull in mongoose / @modular-rest/server.
export { TIER_LIMIT_REACHED_CODE } from '../../server/src/modules/subscription/config';
