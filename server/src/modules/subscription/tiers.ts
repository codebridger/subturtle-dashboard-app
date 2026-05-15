/**
 * Tier registry — the single source of truth for SubTurtle's 3-tier pricing ladder.
 *
 * Pure data + pure helpers, with ZERO db/Stripe imports, so it is trivially
 * unit-testable and safe to import from both the plans RPC and the Stripe webhook.
 *
 * "Monetize any feature with the same standard": every monetizable capability is a
 * `FeatureKey` with a per-tier cap in `caps`. To monetize a NEW feature:
 *   1. add a `FeatureKey`
 *   2. add its cap to all three tiers
 *   3. call `tierAllowsFeature(tierId, key)` at the feature's entry point
 *
 * STRIPE IDS: the `stripeProductId` / `prices.*` values below are PLACEHOLDERS.
 * Run `yarn setup:stripe` (Phase 2) and paste the printed real IDs over them.
 */

export type TierId = "starter" | "learner" | "fluent";
export type Cadence = "monthly" | "annual";
export type Currency = "usd" | "eur" | "gbp";
export type TierStatus = "live" | "dark"; // dark = "Coming soon, Notify me"

/**
 * Every monetizable capability. A cap of `null` means unlimited, `0` means locked
 * (not available on that tier), a positive number is a hard per-window cap.
 */
export type FeatureKey =
  | "save_words"
  | "smart_review"
  | "ai_credits"
  | "weekly_insights"
  | "session_history"
  | "live_conversations";

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
  /** Stripe product ID; null for the free Starter tier. */
  stripeProductId: string | null;
  /** Stripe price IDs per cadence/currency; null for the free Starter tier. */
  prices: TierPrices | null;
  /** Display amounts per cadence/currency; null for the free Starter tier. */
  amount: TierAmounts | null;
  /** Internal AI credit budget per 30-day window. Never shown to users. */
  creditBudget: number;
  /** Length of a billing/allocation window in days. */
  durationDays: number;
  /** Credit-card-required free trial length in days; 0 = no trial. */
  trialDays: number;
  /** Per-feature caps: null = unlimited, 0 = locked, n = hard cap. */
  caps: Record<FeatureKey, number | null>;
  /** Plain-English card bullets — must not contain the word "credit". */
  featureLabels: string[];
  /** Plain-English label for the AI budget on the comparison table. */
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
  /** null for the free Starter tier. */
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
    caps: {
      save_words: 200,
      smart_review: null,
      ai_credits: 5_000_000, // mirrors creditBudget
      weekly_insights: 0,
      session_history: 0,
      live_conversations: 3,
    },
    featureLabels: [
      "Save up to 200 phrases a month",
      "Unlimited Smart Review flashcards",
      "Hover to translate any subtitle, any time",
      "A taste of AI tools each month",
      "Basic progress stats",
    ],
    aiBudgetLabel: "a taste each month",
  },
  learner: {
    id: "learner",
    status: "live",
    userFacingName: "Learner",
    tagline: "Make real progress. Learn every day without running out of tools.",
    isPaid: true,
    stripeProductId: "prod_UW04JV1WnBPlvv",
    prices: {
      monthly: {
        usd: "price_1TWy4AJzqwOMGRBg9jLyvCxN",
        eur: "price_1TWy4AJzqwOMGRBgFIunKN0o",
        gbp: "price_1TWy4BJzqwOMGRBgiVzYadH7",
      },
      annual: {
        usd: "price_1TWy4CJzqwOMGRBgL0fV6xtm",
        eur: "price_1TWy4CJzqwOMGRBga45x0ptR",
        gbp: "price_1TWy4DJzqwOMGRBgj1vSI9UM",
      },
    },
    amount: {
      monthly: { usd: 9.99, eur: 9.99, gbp: 8.99 },
      annual: { usd: 95.99, eur: 95.99, gbp: 85.99 },
    },
    creditBudget: 300_000_000,
    durationDays: 30,
    trialDays: 3,
    caps: {
      save_words: null,
      smart_review: null,
      ai_credits: 300_000_000, // mirrors creditBudget
      weekly_insights: null,
      session_history: null,
      live_conversations: null,
    },
    featureLabels: [
      "Save as many phrases as you want — no limits",
      "Full AI translation budget for daily practice",
      "Live AI voice conversations — plenty each month",
      "Weekly progress insights",
      "Full session history",
    ],
    aiBudgetLabel: "full monthly budget",
  },
  fluent: {
    id: "fluent",
    status: "dark", // not buyable until "Mini Lectures" (PRFAQ-003) ships
    userFacingName: "Fluent",
    tagline: "For learners who are ready to go further.",
    isPaid: true,
    stripeProductId: "prod_UW04hTRTzN7iiB",
    prices: {
      monthly: {
        usd: "price_1TWy4EJzqwOMGRBgAr1Fp6o3",
        eur: "price_1TWy4EJzqwOMGRBgEjgAjUU7",
        gbp: "price_1TWy4FJzqwOMGRBgtqdREIq3",
      },
      annual: {
        usd: "price_1TWy4FJzqwOMGRBgUhy6mVXk",
        eur: "price_1TWy4GJzqwOMGRBgvLf7ZxoX",
        gbp: "price_1TWy4GJzqwOMGRBgTLq1K5Cb",
      },
    },
    amount: {
      monthly: { usd: 16.99, eur: 16.99, gbp: 14.99 },
      annual: { usd: 159.99, eur: 159.99, gbp: 143.99 },
    },
    creditBudget: 600_000_000,
    durationDays: 30,
    trialDays: 0,
    caps: {
      save_words: null,
      smart_review: null,
      ai_credits: 600_000_000, // mirrors creditBudget
      weekly_insights: null,
      session_history: null,
      live_conversations: null,
    },
    featureLabels: [
      "Everything in Learner",
      "Mini Lectures — short, focused lessons built from real content",
      "Improved Live Sessions with richer feedback",
      "A larger AI budget for longer daily practice",
    ],
    aiBudgetLabel: "larger monthly budget",
  },
};

/** Get a tier definition by id. */
export function getTier(id: TierId): TierDefinition {
  return TIERS[id];
}

/** Tiers currently visible/sellable as live — excludes "dark" tiers like Fluent. */
export function liveTiers(): TierDefinition[] {
  return Object.values(TIERS).filter((t) => t.status === "live");
}

/**
 * Resolve a Stripe price ID back to its tier + cadence + currency.
 * Used by the Stripe webhook to derive entitlements from an incoming subscription.
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

/** Resolve a Stripe product ID back to its tier. */
export function resolveTierByProductId(
  productId: string
): TierDefinition | null {
  return (
    Object.values(TIERS).find((t) => t.stripeProductId === productId) || null
  );
}

/** Whether a tier grants access to a feature at all (cap !== 0). */
export function tierAllowsFeature(id: TierId, feature: FeatureKey): boolean {
  return TIERS[id].caps[feature] !== 0;
}

/** The per-tier cap for a feature: null = unlimited, 0 = locked, n = hard cap. */
export function featureCap(id: TierId, feature: FeatureKey): number | null {
  return TIERS[id].caps[feature];
}
