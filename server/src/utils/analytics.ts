/**
 * Server-side Mixpanel — fire-and-forget analytics for events that must be
 * server-truth (trial conversion, AI-budget exhaustion). No-ops when
 * MIXPANEL_TOKEN is not configured, so it never blocks a webhook or RPC.
 */
const mixpanel = require("mixpanel");

let client: any = null;
const token = process.env.MIXPANEL_TOKEN;
if (token) {
  client = mixpanel.init(token);
} else {
  console.warn(
    "[analytics] MIXPANEL_TOKEN not set — server-side analytics events are disabled"
  );
}

// Mirrors frontend/constants/analyticsEvents.ts for the server-fired events.
// Naming follows docs/metrics/event-naming.md: [object]_[action], `-` inside a part.
export const SERVER_ANALYTICS_EVENTS = {
  // Activation funnel (server-truth signals the client can't see reliably).
  ACCOUNT_CREATED: "account_created", // first successful OAuth exchange for a new account
  PHRASE_SAVED_FIRST_TIME: "phrase_saved_first-time", // user's first-ever phrase save (any surface)
  // Stripe webhook lifecycle (the roadmap's slim instrumentation set).
  TRIAL_STARTED: "trial_started", // subscription created with status "trialing"
  SUBSCRIPTION_STARTED: "subscription_started", // trial converted, or direct paid start — props: { via_trial }
  SUBSCRIPTION_CANCELED: "subscription_canceled", // any cancel — props: { was_trialing }
  STARTER_AI_EXHAUSTED: "starter-ai_exhausted",
  // Fired when a Stripe subscription webhook refused to grant because the
  // product's entitlement metadata was missing/invalid (ADR-004 fail-safe).
  ENTITLEMENT_GRANT_REFUSED: "entitlement-grant_refused",
  // Fired on every translation API call (doc: backend tracking plan).
  TRANSLATION_REQUESTED: "translation_requested",
};

/**
 * Track a server-truth event. Fire-and-forget: errors are swallowed so a
 * failed analytics call can never break the calling webhook or RPC.
 */
export function trackServerEvent(
  event: string,
  userId: string,
  properties: Record<string, any> = {}
): void {
  if (!client) return;
  try {
    client.track(event, { distinct_id: userId, ...properties });
  } catch (err) {
    console.error("[analytics] failed to track event", event, err);
  }
}
