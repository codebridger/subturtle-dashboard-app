/**
 * Tier display copy + shared tier types (Council 004 ladder).
 *
 * Under ADR-004, Stripe product metadata is the source of truth for paid-tier
 * ENTITLEMENTS (credits, voice minutes, caps, flags, trial/duration) — parsed in
 * entitlements.ts and resolved LIVE from Stripe. This file holds ONLY the display
 * copy keyed by tier_id (names, taglines, card bullets, GBP display amounts) and
 * the shared tier types. The free Starter tier's limits live in config.ts — the
 * single source for free-tier caps.
 *
 * Feature gating reads from resolved `Entitlements` (paid) or config (Starter)
 * via `featureCapFor` / `featureAllowedFor`. The `FeatureKey` list stays in code:
 * Stripe sets a cap's VALUE, it never invents a new feature key.
 *
 * `amount` is the GBP display price, kept as the baked-in fallback the plans
 * endpoint serves when Stripe is unreachable; the actual price ids live in Stripe
 * and are resolved at checkout/list time. There are no Stripe ids, credit
 * budgets, or per-feature caps in this file any more.
 */
import type { Entitlements } from "./entitlements";
import {
  FREEMIUM_DEFAULT_SAVE_WORDS,
  FREEMIUM_DEFAULT_LIVED_SESSIONS,
} from "../../config";

export type TierId = "starter" | "reader" | "learner" | "coach";
export type Cadence = "monthly" | "annual";
export type TierStatus = "live" | "dark"; // dark = "Coming soon, Notify me"

/**
 * Every gated capability. The cap VALUE is resolved per user from entitlements
 * (paid) or config (Starter); this list (the keys) stays in code. A cap of
 * `null` means unlimited, `0` means locked, a positive number is a hard cap.
 */
export type FeatureKey =
  | "save_words"
  | "smart_review"
  | "weekly_insights"
  | "session_history"
  | "live_sessions";

/**
 * GBP display amounts (major units). One settlement currency — Stripe Adaptive
 * Pricing localizes the displayed currency at checkout, so there is no per-
 * currency map any more.
 */
export interface TierAmounts {
  monthly: { gbp?: number };
  annual: { gbp?: number };
}

export interface TierDefinition {
  id: TierId;
  status: TierStatus;
  /** User-facing name — never "Pro"/"Premium". */
  userFacingName: string;
  tagline: string;
  isPaid: boolean;
  /** GBP display amounts; null for the free Starter tier. */
  amount: TierAmounts | null;
  /** Plain-English card bullets — must not contain the word "credit". */
  featureLabels: string[];
  /** Plain-English label for the AI/voice budget on the comparison table. */
  aiBudgetLabel: string;
}

/**
 * Public, bundle-safe projection of a tier — what `getSubscriptionPlans` returns.
 */
export interface PublicTierPlan {
  id: TierId;
  status: TierStatus;
  name: string;
  tagline: string;
  isPaid: boolean;
  featureLabels: string[];
  aiBudgetLabel: string;
  /** GBP base price; null for the free Starter tier. */
  pricing: TierAmounts | null;
}

export const TIERS: Record<TierId, TierDefinition> = {
  starter: {
    id: "starter",
    status: "live",
    userFacingName: "Starter",
    tagline: "Start learning English from the videos you already watch.",
    isPaid: false,
    amount: null,
    featureLabels: [
      "Save up to 200 phrases a month",
      "Unlimited Smart Review flashcards",
      "Hover to translate any subtitle",
      "A taste of AI tools each month",
    ],
    aiBudgetLabel: "a taste each month",
  },
  reader: {
    id: "reader",
    status: "live",
    userFacingName: "Reader",
    tagline: "Read, save, and chat with AI about every phrase you meet.",
    isPaid: true,
    amount: {
      monthly: { gbp: 4.49 },
      annual: { gbp: 42.99 },
    },
    featureLabels: [
      "Save as many phrases as you want",
      "Unlimited text chat with the AI coach",
      "Unlimited translations",
      "Unlimited Smart Review",
      "Voice top-ups when you want them",
    ],
    aiBudgetLabel: "voice top-ups any time",
  },
  learner: {
    id: "learner",
    status: "live",
    userFacingName: "Learner",
    tagline: "Make real progress — read with AI, then practice out loud.",
    isPaid: true,
    amount: {
      monthly: { gbp: 10.99 },
      annual: { gbp: 104.99 },
    },
    featureLabels: [
      "Everything in Reader",
      "About 10 voice chats a month (~90 min)",
      "Weekly progress insights",
      "Full session history",
    ],
    aiBudgetLabel: "about 10 voice chats a month (~90 min)",
  },
  coach: {
    id: "coach",
    status: "live",
    userFacingName: "Coach",
    tagline: "Speak English every day with your AI coach.",
    isPaid: true,
    amount: {
      monthly: { gbp: 24.99 },
      annual: { gbp: 239.99 },
    },
    featureLabels: [
      "Everything in Learner",
      "About 30 voice chats a month (~300 min)",
      "Top up voice minutes any time",
    ],
    aiBudgetLabel: "about 30 voice chats a month (~300 min)",
  },
};

/** Get a tier definition (display copy) by id. */
export function getTier(id: TierId): TierDefinition {
  return TIERS[id];
}

/** Tiers currently visible/sellable as live — excludes any "dark" tier. */
export function liveTiers(): TierDefinition[] {
  return Object.values(TIERS).filter((t) => t.status === "live");
}

/**
 * The per-window cap for a feature, resolved from entitlements (paid) or config
 * (free Starter, when `entitlements` is null). null = unlimited, 0 = locked,
 * n = hard cap.
 */
export function featureCapFor(
  entitlements: Entitlements | null,
  feature: FeatureKey
): number | null {
  switch (feature) {
    case "smart_review":
      return null; // unlimited on every tier (Council 004)
    case "save_words":
      return entitlements
        ? entitlements.saveWordsCap
        : FREEMIUM_DEFAULT_SAVE_WORDS;
    case "live_sessions":
      return entitlements
        ? entitlements.liveSessionsCap
        : FREEMIUM_DEFAULT_LIVED_SESSIONS;
    case "weekly_insights":
      return entitlements ? (entitlements.weeklyInsights ? null : 0) : 0;
    case "session_history":
      return entitlements ? (entitlements.sessionHistory ? null : 0) : 0;
    default:
      return 0; // unknown feature -> locked (defensive)
  }
}

/** Whether the tier grants access to a feature at all (cap !== 0). */
export function featureAllowedFor(
  entitlements: Entitlements | null,
  feature: FeatureKey
): boolean {
  return featureCapFor(entitlements, feature) !== 0;
}
