/**
 * Tier display copy + shared tier types (Council 004 ladder).
 *
 * Under ADR-004, Stripe product metadata is the source of truth for paid-tier
 * ENTITLEMENTS (credits, voice minutes, caps, flags) — parsed in entitlements.ts.
 * This file holds the DISPLAY COPY keyed by tier_id (names, taglines, card
 * bullets) and the shared tier types. The free Starter tier's limits live in
 * config.ts — the single source for free-tier caps.
 *
 * Feature gating reads from resolved `Entitlements` (paid) or config (Starter)
 * via `featureCapFor` / `featureAllowedFor` — NOT from a static per-tier cap
 * table. The `FeatureKey` list stays in code: Stripe sets a cap's VALUE, it never
 * invents a new feature key.
 *
 * TRANSITION NOTE: `stripeProductId` / `prices` (Stripe ids) are now resolved
 * live from Stripe, so they are `null` here; `amount` / `creditBudget` /
 * `durationDays` / `trialDays` are kept only until the webhook (S2), plans (S3),
 * and checkout (S7) read them from Stripe — S8 then removes them, leaving this
 * file as display copy + types only.
 */
import type { Entitlements } from "./entitlements";
import {
  FREEMIUM_DEFAULT_SAVE_WORDS,
  FREEMIUM_DEFAULT_LIVED_SESSIONS,
} from "../../config";

export type TierId = "starter" | "reader" | "learner" | "coach";
export type Cadence = "monthly" | "annual";
export type Currency = "usd" | "eur" | "gbp";
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

export interface TierPrices {
  monthly: Partial<Record<Currency, string>>; // Stripe price IDs
  annual: Partial<Record<Currency, string>>;
}

export interface TierAmounts {
  monthly: Partial<Record<Currency, number>>; // display amounts, major units
  annual: Partial<Record<Currency, number>>;
}

export interface TierDefinition {
  id: TierId;
  status: TierStatus;
  /** User-facing name — never "Pro"/"Premium". */
  userFacingName: string;
  tagline: string;
  isPaid: boolean;
  /** Stripe product ID — resolved live from Stripe now; null in code. */
  stripeProductId: string | null;
  /** Stripe price IDs — resolved live from Stripe now; null in code. */
  prices: TierPrices | null;
  /** Display amounts per cadence/currency; GBP base (Adaptive Pricing localizes). */
  amount: TierAmounts | null;
  /** Internal AI credit budget mirror — source of truth is Stripe metadata. */
  creditBudget: number;
  /** Length of a billing/allocation window in days. */
  durationDays: number;
  /** Credit-card-required free trial length in days; 0 = no trial. */
  trialDays: number;
  /** Plain-English card bullets — must not contain the word "credit". */
  featureLabels: string[];
  /** Plain-English label for the AI/voice budget on the comparison table. */
  aiBudgetLabel: string;
}

/**
 * Public, bundle-safe projection of a tier — what `getSubscriptionPlans` returns.
 * Deliberately omits Stripe price IDs and the raw credit budget.
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
    stripeProductId: null,
    prices: null,
    amount: null,
    creditBudget: 5_000_000,
    durationDays: 30,
    trialDays: 0,
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
    stripeProductId: null,
    prices: null,
    amount: {
      monthly: { gbp: 4.49 },
      annual: { gbp: 42.99 },
    },
    creditBudget: 200_000_000,
    durationDays: 30,
    trialDays: 0,
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
    stripeProductId: null,
    prices: null,
    amount: {
      monthly: { gbp: 10.99 },
      annual: { gbp: 104.99 },
    },
    creditBudget: 300_000_000,
    durationDays: 30,
    trialDays: 3,
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
    stripeProductId: null,
    prices: null,
    amount: {
      monthly: { gbp: 24.99 },
      annual: { gbp: 239.99 },
    },
    creditBudget: 600_000_000,
    durationDays: 30,
    trialDays: 0,
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
 * Resolve a Stripe price ID back to its tier + cadence + currency from the code
 * registry. DEPRECATED: price ids are resolved live from Stripe now (the
 * registry holds none), so this returns null. Kept only until the webhook (S2)
 * stops importing it; removed in S8.
 */
export function resolveTierByPriceId(
  priceId: string
): { tier: TierDefinition; cadence: Cadence; currency: Currency } | null {
  const cadences: Cadence[] = ["monthly", "annual"];
  for (const tier of Object.values(TIERS)) {
    if (!tier.prices) continue;
    for (const cadence of cadences) {
      const byCurrency = tier.prices[cadence];
      for (const currency of Object.keys(byCurrency) as Currency[]) {
        if (byCurrency[currency] === priceId) {
          return { tier, cadence, currency };
        }
      }
    }
  }
  return null;
}

/** Resolve a Stripe product ID back to its tier. DEPRECATED (see above). */
export function resolveTierByProductId(
  productId: string
): TierDefinition | null {
  return (
    Object.values(TIERS).find((t) => t.stripeProductId === productId) || null
  );
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
