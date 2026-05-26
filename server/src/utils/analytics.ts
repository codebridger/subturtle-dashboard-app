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
export const SERVER_ANALYTICS_EVENTS = {
  TRIAL_CONVERTED: "trial-converted",
  TRIAL_CANCELED: "trial-canceled",
  STARTER_AI_EXHAUSTED: "starter-ai-exhausted",
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
