/**
 * Subscription module configuration
 */

/**
 * Token cost calculation configuration
 */

// Value to multiply USD costs by for internal representation (100M for better precision)
export const COST_TRANSPOSE = 100_000_000;

// Base unit for token pricing (1M tokens)
export const TOKEN_M_UNIT = 1_000_000;

/**
 * Credit management thresholds
 */

// Threshold for triggering low credits warning (in credits)
export const LOW_CREDITS_THRESHOLD = 500000;

// Percentage of the AI budget used at which the "running low" soft-cap banner
// appears. Hard cap (AI features pause) is always at 100%.
export const SOFT_CAP_PERCENT = 80;

/**
 * Stable error code thrown when an AI operation is blocked because the user's
 * AI budget is exhausted (100% used). The frontend pattern-matches this code
 * to show the upgrade modal instead of a generic error toast.
 */
export const AI_CREDIT_EXHAUSTED_CODE = "AI_CREDIT_EXHAUSTED";
