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
