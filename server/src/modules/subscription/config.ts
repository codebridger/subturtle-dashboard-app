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
 * Credit allocation configuration
 */

// Percentage of total subscription amount available for service consumption
export const SPENDABLE_PORTION = 0.75;

// Percentage of total subscription amount reserved for system costs
export const SYSTEM_PORTION = 1 - SPENDABLE_PORTION;

/**
 * Credit management thresholds
 */

// Threshold for triggering low credits warning (in credits)
export const LOW_CREDITS_THRESHOLD = 500000;
