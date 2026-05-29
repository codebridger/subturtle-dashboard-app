import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  parseTierMetadata,
  resolveEntitlements,
  resolveTierCheckout,
  listTierEntitlements,
  clearEntitlementsCache,
  EntitlementParseError,
} from "../entitlements";

const validMeta: Record<string, string> = {
  schema_version: "1",
  tier_id: "learner",
  tier_rank: "2",
  status: "live",
  credits_granted: "300000000",
  voice_minutes_granted: "90",
  save_words_cap: "unlimited",
  text_chat_cap: "unlimited",
  live_sessions_cap: "unlimited",
  weekly_insights: "true",
  session_history: "true",
  duration_days: "30",
  trial_days: "3",
};

describe("parseTierMetadata", () => {
  it("parses valid metadata into typed entitlements", () => {
    const e = parseTierMetadata({ id: "prod_x", metadata: validMeta });
    expect(e.tierId).toBe("learner");
    expect(e.tierRank).toBe(2);
    expect(e.creditsGranted).toBe(300_000_000);
    expect(e.voiceMinutesGranted).toBe(90);
    expect(e.saveWordsCap).toBeNull(); // "unlimited" -> null
    expect(e.weeklyInsights).toBe(true);
    expect(e.sessionHistory).toBe(true);
    expect(e.trialDays).toBe(3);
  });

  it("trims + lower-cases booleans and 'unlimited'", () => {
    const e = parseTierMetadata({
      id: "p",
      metadata: { ...validMeta, weekly_insights: " True ", save_words_cap: "UNLIMITED" },
    });
    expect(e.weeklyInsights).toBe(true);
    expect(e.saveWordsCap).toBeNull();
  });

  it("parses a numeric cap", () => {
    const e = parseTierMetadata({ id: "p", metadata: { ...validMeta, save_words_cap: "200" } });
    expect(e.saveWordsCap).toBe(200);
  });

  it.each([
    ["missing required key", { ...validMeta, credits_granted: undefined as any }],
    ["non-numeric number", { ...validMeta, voice_minutes_granted: "9o" }],
    ["credits below min", { ...validMeta, credits_granted: "5" }],
    ["credits above max", { ...validMeta, credits_granted: "999999999999" }],
    ["unknown schema_version", { ...validMeta, schema_version: "2" }],
    ["unknown tier_id", { ...validMeta, tier_id: "fluent" }],
    ["bad boolean", { ...validMeta, weekly_insights: "yes" }],
    ["bad status", { ...validMeta, status: "hidden" }],
    ["bad cap", { ...validMeta, save_words_cap: "lots" }],
  ])("throws loudly on %s (never guesses)", (_label, metadata) => {
    expect(() => parseTierMetadata({ id: "prod_bad", metadata: metadata as any })).toThrow(
      EntitlementParseError
    );
  });

  it("error message names the product and the offending key", () => {
    expect.assertions(2);
    try {
      parseTierMetadata({ id: "prod_bad", metadata: { ...validMeta, credits_granted: "5" } });
    } catch (e: any) {
      expect(e.message).toContain("prod_bad");
      expect(e.message).toContain("credits_granted");
    }
  });
});

describe("resolveEntitlements (cache)", () => {
  beforeEach(() => clearEntitlementsCache());

  it("fetches by priceId and caches by product (one fetch for two calls)", async () => {
    const product = { id: "prod_learner", metadata: validMeta };
    const retrieve = jest.fn(async () => ({ product }));
    const stripe: any = { prices: { retrieve } };
    const a = await resolveEntitlements(stripe, { priceId: "price_1" });
    const b = await resolveEntitlements(stripe, { priceId: "price_1" });
    expect(a.tierId).toBe("learner");
    expect(b.tierId).toBe("learner");
    expect(retrieve).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it("re-fetches after the cache is fully cleared", async () => {
    const product = { id: "prod_learner", metadata: validMeta };
    const retrieve = jest.fn(async () => ({ product }));
    const stripe: any = { prices: { retrieve } };
    await resolveEntitlements(stripe, { priceId: "price_1" });
    clearEntitlementsCache(); // full clear also drops the price->product map
    await resolveEntitlements(stripe, { priceId: "price_1" });
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it("after a product-only clear, re-reads the product by id (skips the price fetch)", async () => {
    const product = { id: "prod_learner", metadata: validMeta };
    const priceRetrieve = jest.fn(async () => ({ product }));
    const productRetrieve = jest.fn(async () => product);
    const stripe: any = {
      prices: { retrieve: priceRetrieve },
      products: { retrieve: productRetrieve },
    };
    await resolveEntitlements(stripe, { priceId: "price_1" }); // price fetch + cache
    clearEntitlementsCache("prod_learner"); // keeps price->product map
    await resolveEntitlements(stripe, { priceId: "price_1" });
    expect(priceRetrieve).toHaveBeenCalledTimes(1); // not fetched again
    expect(productRetrieve).toHaveBeenCalledTimes(1); // re-read by product id
  });

  it("throws on invalid metadata rather than guessing", async () => {
    const product = { id: "prod_bad", metadata: { ...validMeta, credits_granted: "5" } };
    const stripe: any = { prices: { retrieve: jest.fn(async () => ({ product })) } };
    await expect(resolveEntitlements(stripe, { priceId: "price_bad" })).rejects.toThrow(
      EntitlementParseError
    );
  });
});

describe("listTierEntitlements", () => {
  it("returns parsed tier products with GBP prices; skips packs and unparseable products", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const products = {
      data: [
        {
          id: "prod_reader",
          metadata: {
            ...validMeta,
            tier_id: "reader",
            tier_rank: "1",
            voice_minutes_granted: "0",
            weekly_insights: "false",
            session_history: "false",
            trial_days: "0",
          },
        },
        { id: "prod_pack", metadata: { kind: "voice_topup", pack_key: "topup_30" } }, // no tier_id -> skip
        { id: "prod_bad", metadata: { ...validMeta, tier_id: "coach", credits_granted: "5" } }, // bad -> skip
      ],
    };
    const pricesByProduct: Record<string, any> = {
      prod_reader: {
        data: [
          { currency: "gbp", recurring: { interval: "month" }, unit_amount: 449 },
          { currency: "gbp", recurring: { interval: "year" }, unit_amount: 4299 },
          { currency: "usd", recurring: { interval: "month" }, unit_amount: 499 }, // ignored
        ],
      },
    };
    const stripe: any = {
      products: { list: jest.fn(async () => products) },
      prices: { list: jest.fn(async ({ product }: any) => pricesByProduct[product] || { data: [] }) },
    };
    const out = await listTierEntitlements(stripe);
    expect(out).toHaveLength(1);
    expect(out[0].entitlements.tierId).toBe("reader");
    expect(out[0].monthlyGbp).toBe(4.49);
    expect(out[0].annualGbp).toBe(42.99);
  });
});

describe("resolveTierCheckout (adaptive GBP)", () => {
  const products = { data: [{ id: "prod_learner", metadata: validMeta }] };
  function stripeWith(prices: any[]): any {
    return {
      products: { list: jest.fn(async () => products) },
      prices: { list: jest.fn(async () => ({ data: prices })) },
    };
  }

  it("resolves the GBP price + entitlements; settlement currency is GBP", async () => {
    const stripe = stripeWith([
      { id: "price_m", currency: "gbp", recurring: { interval: "month" }, unit_amount: 1099 },
      { id: "price_y", currency: "gbp", recurring: { interval: "year" }, unit_amount: 10499 },
      { id: "price_usd", currency: "usd", recurring: { interval: "month" }, unit_amount: 1299 },
    ]);
    const r = await resolveTierCheckout(stripe, "learner", "monthly");
    expect(r.priceId).toBe("price_m");
    expect(r.currency).toBe("gbp"); // settlement currency, not presentment
    expect(r.unitAmount).toBe(1099);
    expect(r.entitlements.tierId).toBe("learner");
  });

  it("throws when no active product exists for the tier", async () => {
    const stripe: any = {
      products: { list: jest.fn(async () => ({ data: [] })) },
      prices: { list: jest.fn() },
    };
    await expect(resolveTierCheckout(stripe, "learner", "monthly")).rejects.toThrow(
      EntitlementParseError
    );
  });

  it("throws when there is no GBP price for the cadence", async () => {
    const stripe = stripeWith([
      { id: "price_usd", currency: "usd", recurring: { interval: "month" }, unit_amount: 1299 },
    ]);
    await expect(resolveTierCheckout(stripe, "learner", "monthly")).rejects.toThrow(/GBP/);
  });
});
