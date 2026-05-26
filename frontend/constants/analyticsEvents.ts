// Shared registry of Mixpanel event names — keeps event names consistent and
// greppable across the app. Fired via `analytic.track(...)` (see ~/plugins/mixpanel).
// The server fires its own copies of the server-truth events via
// server/src/utils/analytics.ts.
export const ANALYTICS_EVENTS = {
    CAP_HIT: 'cap-hit', // props: { cap: 'save_words' | 'ai_taste' }
    TRIAL_STARTED: 'trial-started', // props: { cadence, currency }
    TRIAL_CONVERTED: 'trial-converted', // server-fired
    TRIAL_CANCELED: 'trial-canceled', // server-fired
    STARTER_AI_EXHAUSTED: 'starter-ai-exhausted', // server-fired
    FLUENT_WAITLIST_SIGNUP: 'fluent-waitlist-signup',
} as const;
