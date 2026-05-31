export const DATABASE = "user_content";
export const PROFILE_COLLECTION = "profile";
export const PHRASE_COLLECTION = "phrase";
export const BUNDLE_COLLECTION = "phrase_bundle";

// Live session collections
export const LIVE_SESSION_COLLECTION = "live_session";
export const LIVE_SESSION_TEXT_COLLECTION = "live_session_text";

// Subscription collections
export const SUBSCRIPTION_COLLECTION = "subscription";
export const USAGE_COLLECTION = "usage";
export const FREE_CREDIT_COLLECTION = "free_credit";
export const FLUENT_WAITLIST_COLLECTION = "fluent_waitlist";

// Payment gateway collections
export const PAYMENT_COLLECTION = "payment";
export const PAYMENT_SESSION_COLLECTION = "payment_session";

// Freemium default values
export const FREEMIUM_DEFAULT_CREDITS = 5000000; // 5M credits
export const FREEMIUM_DEFAULT_SAVE_WORDS = 200; // 200 words / 30-day window (Starter tier)
export const FREEMIUM_DEFAULT_LIVED_SESSIONS = 3; // 3 lived sessions can be created
// Starter "taste" of voice: ~5 minutes / 30-day window. Starter voice still
// debits the credit pool (no real minute meter on free) — this counter exists
// for schema symmetry with paid tiers and the future metering engine.
export const FREEMIUM_DEFAULT_VOICE_MINUTES = 5;
// Starter text-chat caps (Council 004 follow-up 2026-05-30): 5 chats / 30-day
// window, each capped at 20 messages. Reader's caps come from Stripe metadata.
export const FREEMIUM_DEFAULT_TEXT_CHATS = 5;
export const FREEMIUM_DEFAULT_TEXT_CHAT_MAX_MESSAGES = 20;
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
