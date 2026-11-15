/**
 * Server-side Mixpanel — fire-and-forget analytics for events that must be
 * server-truth (trial conversion, AI-budget exhaustion). No-ops when
 * MIXPANEL_TOKEN is not configured, so it never blocks a webhook or RPC.
 *
 * On Cloud Run the token comes from the optional `mixpanel-token` secret
 * (infra/env.sh). A missing secret is skipped at deploy, so in production the
 * absence is logged once at startup — otherwise every server event silently
 * disappears, which is how they went dark after the Firebase move.
 */
import { getCollection } from "@modular-rest/server";

const mixpanel = require("mixpanel");

let client: any = null;
const token = process.env.MIXPANEL_TOKEN;
if (token) {
  client = mixpanel.init(token);
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    "[analytics] MIXPANEL_TOKEN is not set — server-side analytics events " +
      "(translation_requested, trial_started, …) are DISABLED. Add the " +
      "`mixpanel-token` secret (infra/secrets.sh) and redeploy."
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
  // Multilingual round 1 (B-28). Sent from the function where the action happens, so the web,
  // the phone and the extension are all counted. Each carries `language`.
  LANGUAGE_ADDED: "language_added", // props: { language, start_level, start_level_source } — new or restored
  LANGUAGE_REMOVED: "language_removed", // props: { language }
  LANGUAGE_SWITCHED: "language_switched", // props: { from_language, to_language }
  LANGUAGE_INTEREST: "language_interest", // props: { language, on } — "Tell me", only when it changed
  LEVEL_TEST_DONE: "level_test_done", // props: { language, start_level }
  STARTER_PACK_DONE: "starter_pack_done", // props: { language } — the last item heard
  STARTER_PACK_SKIPPED: "starter_pack_skipped", // props: { language, heard }
  PHRASE_KEPT_PENDING: "phrase_kept_pending", // props: { language } — a new kept phrase, not a refresh
  CLOZE_RESULT: "cloze_result", // props: { language, result: "right" | "close" | "wrong" }
  COACH_EXPLANATION_FLAGGED: "coach_explanation_flagged", // props: { language, turn_index } — flag turned on
};

/**
 * Who an event belongs to (work list B-01).
 * - `userId`: the caller's account id. For a logged-out extension user this is the ONE
 *   account every logged-out visitor shares (modular-rest's `loginAnonymous`), so on its
 *   own it says nothing about the person.
 * - `deviceId`: the client's install analytics id (the extension's `analyticsAnonymousId`).
 */
export interface AnalyticsPerson {
  userId?: string | null;
  deviceId?: string | null;
}

/** The distinct_id for a logged-out event when the client sent no install id (old clients). */
export const UNKNOWN_ANONYMOUS_DISTINCT_ID = "anonymous-unknown";

// The cached id of modular-rest's shared anonymous account (`cms.auth`, type "anonymous").
let anonymousUserIdLookup: Promise<string | null> | null = null;

/**
 * The shared anonymous account's id, read once and cached for the life of the process.
 * The account is created once and never changes, so one query is enough. A failed read is
 * not cached, so the next event tries again.
 */
function getAnonymousUserId(): Promise<string | null> {
  if (!anonymousUserIdLookup) {
    anonymousUserIdLookup = (async () => {
      const auth: any = getCollection("cms", "auth");
      const doc = await auth.findOne({ type: "anonymous" }).select("_id").lean().exec();
      return doc?._id ? String(doc._id) : null;
    })().catch((err) => {
      anonymousUserIdLookup = null;
      throw err;
    });
  }
  return anonymousUserIdLookup;
}

/** Test hook: forget the cached anonymous account id. */
export function resetAnonymousUserIdCache(): void {
  anonymousUserIdLookup = null;
}

/** A usable install id, or undefined. Accepts a raw id or a Mixpanel "$device:<id>" value. */
function cleanDeviceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim().replace(/^\$device:/, "");
  return id && id.length <= 128 ? id : undefined;
}

/** True when `userId` is no real person: missing, "anonymous", or the shared anonymous account. */
async function isLoggedOut(userId: string | undefined): Promise<boolean> {
  if (!userId || userId === "anonymous") return true;
  try {
    return userId === (await getAnonymousUserId());
  } catch (err) {
    // We cannot tell, so we must not risk the shared id: treat the caller as logged out.
    console.error("[analytics] failed to read the anonymous account id", err);
    return true;
  }
}

/**
 * The Mixpanel identity properties for a person (simplified ID merge):
 * - signed-in user: `distinct_id` = `$user_id` = user id, plus `$device_id` when known,
 *   which joins the install to the account;
 * - logged-out with an install id: `$device_id` only, so Mixpanel files the event under
 *   `$device:<id>`, the same person the extension's own events use;
 * - logged-out with no install id: `distinct_id` = "anonymous-unknown". Never the shared
 *   anonymous account id.
 */
export async function identityProperties(person: AnalyticsPerson): Promise<Record<string, string>> {
  const userId = typeof person.userId === "string" ? person.userId.trim() || undefined : undefined;
  const deviceId = cleanDeviceId(person.deviceId);

  if (!(await isLoggedOut(userId))) {
    return deviceId
      ? { distinct_id: userId!, $user_id: userId!, $device_id: deviceId }
      : { distinct_id: userId! };
  }
  if (deviceId) return { distinct_id: `$device:${deviceId}`, $device_id: deviceId };
  return { distinct_id: UNKNOWN_ANONYMOUS_DISTINCT_ID };
}

/**
 * Track a server-truth event. Fire-and-forget: callers do not need to await it, and errors
 * are swallowed so a failed analytics call can never break the calling webhook or RPC.
 * The returned promise never rejects (tests await it).
 */
export async function trackServerEvent(
  event: string,
  person: AnalyticsPerson,
  properties: Record<string, any> = {}
): Promise<void> {
  if (!client) return;
  try {
    const identity = await identityProperties(person);
    client.track(event, { ...properties, ...identity });
  } catch (err) {
    console.error("[analytics] failed to track event", event, err);
  }
}

/**
 * Send an event for a learner action without waiting for it or ever throwing. Use this inside
 * a function that has already succeeded: an analytics problem must not fail the learner's call.
 */
export function fireServerEvent(event: string, userId: string, properties: Record<string, any> = {}): void {
  try {
    void trackServerEvent(event, { userId }, properties).catch(() => undefined);
  } catch (err) {
    console.error("[analytics] failed to send event", event, err);
  }
}
