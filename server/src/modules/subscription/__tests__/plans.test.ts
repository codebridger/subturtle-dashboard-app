import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { getSubscriptionPlansCached, clearPlansCache } from "../plans";

function meta(
  tier_id: string,
  rank: string,
  voice: string,
  wi: string,
  sh: string,
  trial = "0"
): Record<string, string> {
  return {
    schema_version: "1",
    tier_id,
    tier_rank: rank,
    status: "live",
    credits_granted: "300000000",
    voice_minutes_granted: voice,
    save_words_cap: "unlimited",
    text_chat_cap: "unlimited",
    live_sessions_cap: "unlimited",
    weekly_insights: wi,
    session_history: sh,
    duration_days: "30",
    trial_days: trial,
  };
}

// Products carry BOTH machine entitlements and display copy in metadata (ADR-004);
// the card name is the product's native `name`.
const products = {
  data: [
    {
      id: "prod_coach",
      name: "Coach",
      metadata: {
        ...meta("coach", "3", "300", "true", "true"),
        tagline: "Speak English every day with your AI coach.",
        ai_budget_label: "300 minutes of voice chat a month",
        feature_1: "Everything in Learner",
        feature_2: "300 minutes of voice chat a month",
      },
    },
    {
      id: "prod_reader",
      name: "Reader",
      metadata: {
        ...meta("reader", "1", "0", "false", "false"),
        tagline: "Read, save, and chat with AI about every phrase you meet.",
        ai_budget_label: "voice top-ups any time",
        feature_1: "Save as many phrases as you want",
      },
    },
    {
      id: "prod_learner",
      name: "Learner",
      metadata: {
        ...meta("learner", "2", "90", "true", "true", "3"),
        tagline: "Make real progress — read with AI, then practice out loud.",
        ai_budget_label: "90 minutes of voice chat a month",
        feature_1: "Everything in Reader",
        feature_2: "90 minutes of voice chat a month",
        highlight: "true",
        badge: "Most popular",
      },
    },
  ],
};
const pricesByProduct: Record<string, any> = {
  prod_reader: {
    data: [
      { currency: "gbp", recurring: { interval: "month" }, unit_amount: 449 },
      { currency: "gbp", recurring: { interval: "year" }, unit_amount: 4299 },
    ],
  },
  prod_learner: {
    data: [
      { currency: "gbp", recurring: { interval: "month" }, unit_amount: 1099 },
      { currency: "gbp", recurring: { interval: "year" }, unit_amount: 10499 },
    ],
  },
  prod_coach: {
    data: [
      { currency: "gbp", recurring: { interval: "month" }, unit_amount: 2499 },
      { currency: "gbp", recurring: { interval: "year" }, unit_amount: 23999 },
    ],
  },
};

function okStripe(): any {
  return {
    products: { list: jest.fn(async () => products) },
    prices: { list: jest.fn(async ({ product }: any) => pricesByProduct[product] || { data: [] }) },
  };
}
function downStripe(): any {
  return {
    products: {
      list: jest.fn(async () => {
        throw new Error("Stripe down");
      }),
    },
    prices: { list: jest.fn() },
  };
}

describe("getSubscriptionPlansCached", () => {
  beforeEach(() => {
    clearPlansCache();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  // NOTE: this MUST be the first test — it relies on there being no
  // last-known-good snapshot yet (the module starts fresh per test file).
  it("throws when Stripe is down and there is no last-known-good snapshot", async () => {
    await expect(getSubscriptionPlansCached(downStripe())).rejects.toThrow();
  });

  it("builds from Stripe: Starter first then by tier_rank, GBP pricing, no 'credit' copy", async () => {
    const plans = await getSubscriptionPlansCached(okStripe());
    expect(plans.map((p) => p.id)).toEqual(["starter", "reader", "learner", "coach"]);
    expect(plans.find((p) => p.id === "learner")!.pricing?.monthly.gbp).toBe(10.99);
    expect(plans.find((p) => p.id === "coach")!.pricing?.annual.gbp).toBe(239.99);
    expect(plans.find((p) => p.id === "starter")!.pricing).toBeNull();
    const copy = plans
      .flatMap((p) => [p.tagline, p.aiBudgetLabel, ...p.featureLabels])
      .join(" ")
      .toLowerCase();
    expect(copy).not.toContain("credit");
  });

  it("projects display copy + highlight/badge/trialDays from Stripe metadata", async () => {
    const plans = await getSubscriptionPlansCached(okStripe());
    const learner = plans.find((p) => p.id === "learner")!;
    expect(learner.name).toBe("Learner"); // from product.name
    expect(learner.tagline).toContain("Make real progress");
    expect(learner.featureLabels).toEqual([
      "Everything in Reader",
      "90 minutes of voice chat a month",
    ]);
    expect(learner.highlight).toBe(true);
    expect(learner.badge).toBe("Most popular");
    expect(learner.trialDays).toBe(3);

    const reader = plans.find((p) => p.id === "reader")!;
    expect(reader.highlight).toBe(false);
    expect(reader.badge).toBeNull();
    expect(reader.trialDays).toBe(0);
  });

  it("serves the warm cache without re-reading Stripe", async () => {
    await getSubscriptionPlansCached(okStripe()); // populate cache
    const s2 = downStripe();
    const plans = await getSubscriptionPlansCached(s2);
    expect(plans).toHaveLength(4);
    expect(s2.products.list).not.toHaveBeenCalled(); // served from cache
  });

  it("falls back to last-known-good when Stripe is down after a cache clear", async () => {
    await getSubscriptionPlansCached(okStripe()); // success -> last-known-good set
    clearPlansCache();
    const plans = await getSubscriptionPlansCached(downStripe());
    // never empty: serves the last successful build (real Stripe data)
    expect(plans.map((p) => p.id)).toEqual(["starter", "reader", "learner", "coach"]);
  });
});
