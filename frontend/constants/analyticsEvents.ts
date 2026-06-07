// Shared registry of Mixpanel event names — keeps event names consistent and
// greppable across the app. Fired via `analytic.track(...)` (see ~/plugins/mixpanel).
// The server fires its own copies of the server-truth events via
// server/src/utils/analytics.ts.
export const ANALYTICS_EVENTS = {
    CAP_HIT: 'cap_hit', // props: { cap: 'save_words' | 'ai_taste' }
    CHECKOUT_OPENED: 'checkout_opened', // props: { tier, cadence, currency } — checkout panel opened
    FLASHCARD_REVIEW_STARTED: 'flashcard_review_started', // props: { deck_type }
    USER_LOGGED_IN: 'user_logged-in', // explicit login only, not session restore
    TRIAL_STARTED: 'trial_started', // server-fired (Stripe webhook: subscription created as trialing)
    SUBSCRIPTION_STARTED: 'subscription_started', // server-fired (trial converted, or direct paid start)
    SUBSCRIPTION_CANCELED: 'subscription_canceled', // server-fired, props: { was_trialing }
    STARTER_AI_EXHAUSTED: 'starter-ai_exhausted', // server-fired
    FLUENT_WAITLIST_SIGNUP: 'fluent-waitlist_signup',
} as const;
