/**
 * Entitlement ENFORCEMENT — turns the resolved tier caps into runtime gates.
 *
 * Council 004 grants entitlements from Stripe metadata and snapshots them onto
 * the subscription doc (entitlements.ts / service.ts). This module is the single
 * place that READS that snapshot at request time and blocks an action when the
 * tier doesn't allow it. Feature → cap resolution stays in `featureCapFor`
 * (tiers.ts); this module just resolves the user's entitlements and throws a
 * consistent, code-bearing error so callers (and the frontend's LimitationModal)
 * can handle every limit the same way.
 *
 * Mirrors the `AI_CREDIT_EXHAUSTED` pattern: the thrown Error's message is
 * PREFIXED with a stable code (and the code is also on `.code`), so the frontend
 * can pattern-match the string to show an upgrade prompt.
 */
import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, SUBSCRIPTION_COLLECTION } from "../../config";
import { Entitlements } from "./entitlements";
import { FeatureKey, featureCapFor } from "./tiers";

/** Stable code thrown when a tier limit/lock blocks an action. */
export const TIER_LIMIT_REACHED_CODE = "TIER_LIMIT_REACHED";

/**
 * Anything an entitlement can gate. The `FeatureKey`s are cap/flag based;
 * `voice_minutes` is a numeric budget gated separately (see service.ts).
 */
export type GatedFeature = FeatureKey | "voice_minutes";

/** Thrown when a feature is locked (cap 0) or its hard cap is met (used >= cap). */
export class EntitlementLimitError extends Error {
  readonly code = TIER_LIMIT_REACHED_CODE;
  readonly feature: GatedFeature;
  readonly cap: number | null;
  readonly used?: number;

  constructor(feature: GatedFeature, cap: number | null, used?: number) {
    const reason =
      cap === 0 ? "is not included in your plan" : `limit reached (${cap})`;
    super(`${TIER_LIMIT_REACHED_CODE}: "${feature}" ${reason}`);
    this.name = "EntitlementLimitError";
    this.feature = feature;
    this.cap = cap;
    this.used = used;
  }
}

interface GateContext {
  /** Whether the user has an active (non-canceled, unexpired) paid subscription. */
  active: boolean;
  /** The entitlement snapshot from that subscription, or null for free users. */
  entitlements: Entitlements | null;
}

/**
 * Read the user's current gate context in one lightweight query: their active
 * subscription's entitlement snapshot, or null when they're on the free tier.
 */
export async function getGateContext(userId: string): Promise<GateContext> {
  const subscriptions = getCollection<any>(DATABASE, SUBSCRIPTION_COLLECTION);
  const active = await subscriptions.findOne({
    // subscription.user_id is stored as an ObjectId (see service.ts) — a raw
    // string would never match, silently treating paid users as free.
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  });
  return {
    active: !!active,
    entitlements: (active?.entitlements as Entitlements) ?? null,
  };
}

/** The user's resolved entitlements (paid snapshot), or null for free users. */
export async function resolveUserEntitlements(
  userId: string
): Promise<Entitlements | null> {
  return (await getGateContext(userId)).entitlements;
}

/**
 * Effective cap for a feature: null = unlimited, 0 = locked, n = hard cap.
 * A paid subscription that is somehow missing its entitlement snapshot is treated
 * as unlimited, so a paying customer is never wrongly gated by a data gap.
 */
export async function getEffectiveCap(
  userId: string,
  feature: FeatureKey
): Promise<number | null> {
  const { active, entitlements } = await getGateContext(userId);
  if (active && !entitlements) return null; // paid, no snapshot -> don't penalize
  return featureCapFor(entitlements, feature);
}

/** Boolean-gated features (weekly_insights, session_history): throw if locked. */
export async function assertFeatureEnabled(
  userId: string,
  feature: FeatureKey
): Promise<void> {
  if ((await getEffectiveCap(userId, feature)) === 0) {
    throw new EntitlementLimitError(feature, 0);
  }
}

/**
 * Counted features (e.g. save_words): throw when a finite cap is already met or
 * exceeded. `used` is the caller's current count for the relevant window.
 */
export async function assertWithinCap(
  userId: string,
  feature: FeatureKey,
  used: number
): Promise<void> {
  const cap = await getEffectiveCap(userId, feature);
  if (cap !== null && used >= cap) {
    throw new EntitlementLimitError(feature, cap, used);
  }
}
