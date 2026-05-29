import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  getSubscriptionPlansCached,
  getFallbackPlans,
  clearPlansCache,
} from "../plans";

function meta(
  tier_id: string,
  rank: string,
  voice: string,
  wi: string,
  sh: string
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
    trial_days: "0",
  };
}

const products = {
  data: [
    { id: "prod_coach", metadata: meta("coach", "3", "300", "true", "true") },
    { id: "prod_reader", metadata: meta("reader", "1", "0", "false", "false") },
    { id: "prod_learner", metadata: meta("learner", "2", "90", "true", "true") },
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

describe("getFallbackPlans (baked-in)", () => {
  it("returns all four tiers; Starter has no pricing", () => {
    const f = getFallbackPlans();
    expect(f.map((p) => p.id)).toEqual(["starter", "reader", "learner", "coach"]);
    expect(f.find((p) => p.id === "starter")!.pricing).toBeNull();
    expect(f.find((p) => p.id === "reader")!.pricing?.monthly.gbp).toBe(4.49);
  });
});

describe("getSubscriptionPlansCached", () => {
  beforeEach(() => {
    clearPlansCache();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("builds from Stripe, Starter first then by tier_rank, GBP pricing, no 'credit' copy", async () => {
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
    // never empty: serves the last successful build
    expect(plans.map((p) => p.id)).toEqual(["starter", "reader", "learner", "coach"]);
  });
});
