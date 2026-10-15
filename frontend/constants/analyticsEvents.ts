// Shared registry of Mixpanel event names — keeps event names consistent and
// greppable across the app. Fired via `analytic.track(...)` (see ~/plugins/mixpanel).
// The server fires its own copies of the server-truth events via
// server/src/utils/analytics.ts.
export const ANALYTICS_EVENTS = {
    CAP_HIT: 'cap_hit', // props: { cap: 'save_words' | 'ai_taste' }
    CHECKOUT_OPENED: 'checkout_opened', // props: { tier, cadence, currency } — checkout panel opened
    PRICING_PAGE_VIEWED: 'pricing-page_viewed', // props: { from_surface } — subscription page opened
    FLASHCARD_REVIEW_STARTED: 'flashcard_review_started', // props: { deck_type }
    USER_LOGGED_IN: 'user_logged-in', // explicit login only, not session restore
    ACCOUNT_CREATED: 'account_created', // server-fired (auth: first OAuth exchange for a new account)
    PHRASE_SAVED_FIRST_TIME: 'phrase_saved_first-time', // server-fired (first-ever phrase save)
    TRIAL_STARTED: 'trial_started', // server-fired (Stripe webhook: subscription created as trialing)
    SUBSCRIPTION_STARTED: 'subscription_started', // server-fired (trial converted, or direct paid start)
    SUBSCRIPTION_CANCELED: 'subscription_canceled', // server-fired, props: { was_trialing }
    STARTER_AI_EXHAUSTED: 'starter-ai_exhausted', // server-fired
    // Multilingual round 1 (D-22, B-28). Every event also carries the `learning_language` and
    // `l1` super properties once multilingual is on.
    LANGUAGE_ADDED: 'language_added', // props: { language, start_level, start_level_source }
    LANGUAGE_REMOVED: 'language_removed', // props: { language }
    LANGUAGE_SWITCHED: 'language_switched', // props: { from_language, to_language }
    LANGUAGE_INTEREST: 'language_interest', // props: { language, on } — "Tell me"
    LEVEL_TEST_STARTED: 'level_test_started', // props: { language, from: 'add' | 'first_run' }
    LEVEL_TEST_DONE: 'level_test_done', // props: { language, start_level }
    STARTER_PACK_DONE: 'starter_pack_done', // props: { language }
    STARTER_PACK_SKIPPED: 'starter_pack_skipped', // props: { language, heard }
    FIRST_RUN_DONE: 'first_run_done', // props: { language, start_level_source }
    CLOZE_RESULT: 'cloze_result', // props: { result: 'right' | 'close' | 'wrong' }
    COACH_EXPLANATION_FLAGGED: 'coach_explanation_flagged', // props: { language, turn_index }
} as const;
