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
 * Voice-session policy
 */

// Hard cap (minutes) on a single FREE-tier voice session. The effective session
// length is this capped by the user's remaining minutes (see
// getVoiceSessionMaxSeconds) so one session can't overshoot the monthly budget.
// Paid tiers have no per-session cap beyond their remaining balance.
export const FREE_VOICE_SESSION_MAX_MINUTES = 5;

/**
 * Stable error code thrown when an AI operation is blocked because the user's
 * AI budget is exhausted (100% used). The frontend pattern-matches this code
 * to show the upgrade modal instead of a generic error toast.
 */
export const AI_CREDIT_EXHAUSTED_CODE = "AI_CREDIT_EXHAUSTED";

/**
 * Stable code thrown when a tier limit/lock blocks an action (save-words cap,
 * weekly_insights / session_history lock, voice budget, live-session count). Lives
 * here (a dependency-free constants file) so the frontend can import it WITHOUT
 * pulling in enforcement.ts and its server-only deps (mongoose, modular-rest).
 */
export const TIER_LIMIT_REACHED_CODE = "TIER_LIMIT_REACHED";

/**
 * Stable code thrown when a user who already has an active paid subscription tries
 * to start a NEW subscription checkout. Council 004 has no stacking — a second
 * purchase would create a parallel Stripe subscription (double charge). The
 * frontend routes such users to the billing portal to change plans instead.
 */
export const ALREADY_SUBSCRIBED_CODE = "ALREADY_SUBSCRIBED";
