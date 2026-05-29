/**
 * Tier type definitions for SubTurtle's 3-tier pricing ladder.
 *
 * The tier DATA (names, taglines, caps, credit budgets, trial days, prices,
 * amounts) is no longer hardcoded here — Stripe is the single source of truth.
 * The runtime reads tiers from Stripe products + prices via
 * `TierRegistryService` (defined in ./tier-registry.service and re-exported at
 * the bottom of this file). This file holds only the shared types and the
 * service handle, so a product/marketing change in the Stripe Dashboard is
 * picked up without a code deploy.
 *
 * "Monetize any feature with the same standard": every monetizable capability is
 * a `FeatureKey` with a per-tier cap in `caps`. To monetize a NEW feature:
 *   1. add a `FeatureKey` (and to `FEATURE_KEYS` in the service)
 *   2. add a `caps_<feature>` metadata key to each tier product in Stripe
 *   3. gate the feature's entry point on that cap
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
  /** User-facing name — never "Pro"/"Premium". From Stripe product.name. */
  userFacingName: string;
  tagline: string;
  isPaid: boolean;
  /** Stripe product ID. */
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

// The Stripe-backed registry is the runtime source of truth for the data above.
export {
  TierRegistryService,
  getTierRegistry,
  parseTierProduct,
} from "./tier-registry.service";
export type { ResolvedPrice } from "./tier-registry.service";
