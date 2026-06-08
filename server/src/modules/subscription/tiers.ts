/**
 * Free-tier copy + shared tier types (Council 004 ladder).
 *
 * Under ADR-004, Stripe is the single source of truth for the PAID tiers:
 *   - ENTITLEMENTS (credits, voice minutes, caps, flags, trial/duration) — parsed
 *     in entitlements.ts and resolved LIVE from Stripe.
 *   - DISPLAY copy (name, tagline, bullets, highlight/badge) — parsed in
 *     display.ts from the same Stripe product.
 *   - PRICES — the Stripe Price objects (GBP base + Adaptive Pricing).
 * There is NO paid-tier data in this file any more.
 *
 * The ONE exception is the free Starter tier: it has no Stripe product (free
 * plans aren't sold, and the strict money-granting metadata schema doesn't fit
 * £0), so its copy lives here and its caps live in config.ts — the single source
 * for free-tier limits.
 *
 * Feature gating reads from resolved `Entitlements` (paid) or config (Starter)
 * via `featureCapFor` / `featureAllowedFor`. The `FeatureKey` list stays in code:
 * Stripe sets a cap's VALUE, it never invents a new feature key.
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

/**
 * A code-defined tier. Only the free Starter is defined this way now (paid tiers
 * come from Stripe); the shape is kept generic for the registry + re-export.
 */
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
 * Paid-tier fields are filled from Stripe (entitlements + display + prices);
 * Starter is filled from the code definition below.
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
  /** Emphasise this card (border/ring). From Stripe `highlight` metadata. */
  highlight: boolean;
  /** Optional ribbon text (e.g. "Most popular"). From Stripe `badge` metadata. */
  badge: string | null;
  /** Free-trial length in days (0 = none). Drives the trial CTA. From Stripe. */
  trialDays: number;
}

/**
 * The free Starter tier — the single code-defined tier (it has no Stripe
 * product). Its caps live in config.ts; this is just its display copy.
 */
export const STARTER_TIER: TierDefinition = {
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
};

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
