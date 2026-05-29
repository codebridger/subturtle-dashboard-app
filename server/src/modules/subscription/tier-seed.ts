/**
 * Bootstrap seed for the Stripe tier products — the initial values the
 * `yarn setup:stripe` script pushes into the Stripe Dashboard. After setup runs,
 * **Stripe is the single source of truth**: the runtime reads tiers via
 * `TierRegistryService`, never from this file. Product/marketing edit copy, caps,
 * and prices directly in the Dashboard.
 *
 * `setup:stripe` is therefore a bootstrap/repair tool, not a routine task — it
 * re-converges Stripe metadata to these seed values, so re-running it overwrites
 * any Dashboard edits. Run it intentionally (e.g. first-time setup, or to add a
 * newly-introduced metadata key), not for everyday copy changes.
 *
 * This module holds NO Stripe client and does no I/O, so it is safe to import
 * from both the script and unit tests.
 */
import { Cadence, FeatureKey, TierStatus } from "./tiers";

export interface TierSeedSpec {
  tierId: string;
  status: TierStatus;
  /** Stripe product.name — the user-facing tier name. */
  name: string;
  tagline: string;
  /** Internal AI credit budget per window (mirrors caps.ai_credits). */
  creditsAmount: string;
  subscriptionDays: string;
  trialDays: string;
  aiBudgetLabel: string;
  featureLabels: string[];
  /** Per-feature caps: null = unlimited, 0 = locked, n = hard cap. */
  caps: Record<FeatureKey, number | null>;
  /**
   * Recurring GBP price per cadence, in minor units (pence). Omitted for the
   * free tier. Base currency only — Stripe Adaptive Pricing converts to the
   * buyer's local currency at checkout, so we keep exactly one price per cadence.
   */
  prices?: Record<Cadence, number>;
}

export const TIER_SEED_SPECS: TierSeedSpec[] = [
  {
    tierId: "starter",
    status: "live",
    name: "Starter",
    tagline: "Start learning English from the videos you already watch.",
    creditsAmount: "5000000",
    subscriptionDays: "30",
    trialDays: "0",
    aiBudgetLabel: "a taste each month",
    featureLabels: [
      "Save up to 200 phrases a month",
      "Unlimited Smart Review flashcards",
      "Hover to translate any subtitle, any time",
      "A taste of AI tools each month",
      "Basic progress stats",
    ],
    caps: {
      save_words: 200,
      smart_review: null,
      ai_credits: 5_000_000,
      weekly_insights: 0,
      session_history: 0,
      live_conversations: 3,
    },
    // Free tier — no prices.
  },
  {
    tierId: "learner",
    status: "live",
    name: "Learner",
    tagline: "Make real progress. Learn every day without running out of tools.",
    creditsAmount: "300000000",
    subscriptionDays: "30",
    trialDays: "3",
    aiBudgetLabel: "full monthly budget",
    featureLabels: [
      "Save as many phrases as you want — no limits",
      "Full AI translation budget for daily practice",
      "Live AI voice conversations — plenty each month",
      "Weekly progress insights",
      "Full session history",
    ],
    caps: {
      save_words: null,
      smart_review: null,
      ai_credits: 300_000_000,
      weekly_insights: null,
      session_history: null,
      live_conversations: null,
    },
    prices: {
      monthly: 899,
      annual: 8599,
    },
  },
  {
    tierId: "fluent",
    status: "dark", // not buyable until "Mini Lectures" (PRFAQ-003) ships
    name: "Fluent",
    tagline: "For learners who are ready to go further.",
    creditsAmount: "600000000",
    subscriptionDays: "30",
    trialDays: "0",
    aiBudgetLabel: "larger monthly budget",
    featureLabels: [
      "Everything in Learner",
      "Mini Lectures — short, focused lessons built from real content",
      "Improved Live Sessions with richer feedback",
      "A larger AI budget for longer daily practice",
    ],
    caps: {
      save_words: null,
      smart_review: null,
      ai_credits: 600_000_000,
      weekly_insights: null,
      session_history: null,
      live_conversations: null,
    },
    prices: {
      monthly: 1499,
      annual: 14399,
    },
  },
];

/**
 * Serialize a seed spec into the flat Stripe product `metadata` map that
 * `TierRegistryService.parseTierProduct` reads back. Caps serialize as "null"
 * (unlimited) or a decimal string; `featureLabels` as a JSON array.
 */
export function buildProductMetadata(spec: TierSeedSpec): Record<string, string> {
  const metadata: Record<string, string> = {
    tierId: spec.tierId,
    status: spec.status,
    tagline: spec.tagline,
    creditsAmount: spec.creditsAmount,
    subscriptionDays: spec.subscriptionDays,
    trialDays: spec.trialDays,
    aiBudgetLabel: spec.aiBudgetLabel,
    featureLabels: JSON.stringify(spec.featureLabels),
  };
  for (const feature of Object.keys(spec.caps) as FeatureKey[]) {
    const cap = spec.caps[feature];
    metadata[`caps_${feature}`] = cap === null ? "null" : String(cap);
  }
  return metadata;
}
