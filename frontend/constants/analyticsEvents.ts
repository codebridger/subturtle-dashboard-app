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
    // `l1` super properties once multilingual is on. Most are SERVER-FIRED (server/src/utils/analytics.ts),
    // from the function where the action happens, so the web, the phone and the extension are all
    // counted; the web must not send them again. Only the two screen-only events are sent here.
    LANGUAGE_ADDED: 'language_added', // server-fired (add-language, new or restored) — props: { language, start_level, start_level_source }
    LANGUAGE_REMOVED: 'language_removed', // server-fired (remove-language) — props: { language }
    LANGUAGE_SWITCHED: 'language_switched', // server-fired (set-active-language, only on a real change) — props: { from_language, to_language }
    LANGUAGE_INTEREST: 'language_interest', // server-fired (set-language-interest, only on a change) — props: { language, on } — "Tell me"
    LEVEL_TEST_STARTED: 'level_test_started', // web-only (a screen action) — props: { language, from: 'add' | 'first_run' }
    LEVEL_TEST_DONE: 'level_test_done', // server-fired (finish-level-test) — props: { language, start_level }
    STARTER_PACK_DONE: 'starter_pack_done', // server-fired (complete-starter-pack-items, last item) — props: { language }
    STARTER_PACK_SKIPPED: 'starter_pack_skipped', // server-fired (skip-starter-pack) — props: { language, heard }
    FIRST_RUN_DONE: 'first_run_done', // web-only (the first-run flow ends on a screen) — props: { language, start_level_source }
    PHRASE_KEPT_PENDING: 'phrase_kept_pending', // server-fired (keep-phrase-pending, a new kept phrase) — props: { language }
    CLOZE_RESULT: 'cloze_result', // server-fired (check-cloze-answer) — props: { language, result: 'right' | 'close' | 'wrong' }
    COACH_EXPLANATION_FLAGGED: 'coach_explanation_flagged', // server-fired (flag-coach-explanation, flag turned on) — props: { language, turn_index }
} as const;
