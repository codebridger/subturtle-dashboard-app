export const DATABASE = "user_content";
export const PROFILE_COLLECTION = "profile";
export const PHRASE_COLLECTION = "phrase";
export const BUNDLE_COLLECTION = "phrase_bundle";

// Live session collections
export const LIVE_SESSION_COLLECTION = "live_session";

// Subscription collections
export const SUBSCRIPTION_COLLECTION = "subscription";
export const USAGE_COLLECTION = "usage";
export const FREE_CREDIT_COLLECTION = "free_credit";
export const FLUENT_WAITLIST_COLLECTION = "fluent_waitlist";

// Payment gateway collections
export const PAYMENT_COLLECTION = "payment";
export const PAYMENT_SESSION_COLLECTION = "payment_session";

// Freemium defaults — FALLBACKS that mirror the Starter tier.
// The freemium allocation is normally sourced live from the Starter tier in
// Stripe (creditsAmount / caps_save_words / caps_live_conversations /
// subscriptionDays) via the TierRegistryService; these constants are only used
// if the registry is unavailable (e.g. a Stripe cold-start outage), so free
// signups never block. Keep them in sync with the Starter seed as a safety net.
export const FREEMIUM_DEFAULT_CREDITS = 5000000; // 5M credits
export const FREEMIUM_DEFAULT_SAVE_WORDS = 200; // 200 words / 30-day window
export const FREEMIUM_DEFAULT_LIVED_SESSIONS = 3; // 3 live sessions / window
// Also drives the static Mongo TTL index on free_credit (must be a constant —
// a Mongo index expiry cannot be computed per-tier at runtime).
export const FREEMIUM_DURATION_DAYS = 30; // 1 month

// Schedule
export const DATABASE_SCHEDULE = "cms";
export const SCHEDULE_JOB_COLLECTION = "scheduled_job";

// Leitner System
export const DATABASE_LEITNER = DATABASE;
export const LEITNER_SYSTEM_COLLECTION = "leitner_system";

// Board Module
export const DATABASE_BOARD = DATABASE;
export const BOARD_ACTIVITY_COLLECTION = "board_activity";
