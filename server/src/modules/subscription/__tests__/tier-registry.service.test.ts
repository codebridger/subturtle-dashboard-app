import { describe, it, expect, jest } from "@jest/globals";
import Stripe from "stripe";
import {
  TierRegistryService,
  parseTierProduct,
} from "../tier-registry.service";

/**
 * Build the full, valid metadata block for a tier product. Individual tests
 * override single keys to exercise the strict parser.
 */
function tierMetadata(overrides: Record<string, string> = {}) {
  return {
    tierId: "learner",
    status: "live",
    tagline: "Make real progress.",
    creditsAmount: "300000000",
    subscriptionDays: "30",
    trialDays: "3",
    aiBudgetLabel: "full monthly budget",
    featureLabels: JSON.stringify(["Save as many phrases", "Full AI budget"]),
    caps_save_words: "null",
    caps_smart_review: "null",
    caps_ai_credits: "300000000",
    caps_weekly_insights: "null",
    caps_session_history: "null",
    caps_live_conversations: "null",
    ...overrides,
  };
}

function product(
  id: string,
  name: string,
  metadata: Record<string, string>,
  active = true
): Stripe.Product {
  return { id, name, active, metadata } as unknown as Stripe.Product;
}

function price(
  id: string,
  productId: string,
  currency: string,
  unitAmount: number,
  interval: "month" | "year"
): Stripe.Price {
  return {
    id,
    active: true,
    currency,
    unit_amount: unitAmount,
    recurring: { interval },
    product: productId,
  } as unknown as Stripe.Price;
}

function apiList<T>(data: T[]): Stripe.ApiList<T> {
  return { object: "list", data, has_more: false, url: "" } as Stripe.ApiList<T>;
}

/**
 * Minimal in-memory Stripe double. `products.list` / `prices.list` are jest
 * mocks so tests can assert call counts (cache behaviour) and swap in failures.
 */
function makeStripe(
  products: Stripe.Product[],
  pricesByProduct: Record<string, Stripe.Price[]>
) {
  const productsList = jest.fn<any>(() => Promise.resolve(apiList(products)));
  const pricesList = jest.fn<any>((params: any) =>
    Promise.resolve(apiList(pricesByProduct[params.product] || []))
  );
  const stripe = {
    products: { list: productsList },
    prices: { list: pricesList },
  } as unknown as Stripe;
  return { stripe, productsList, pricesList };
}

const flush = () => new Promise((res) => setImmediate(res));

const STARTER = product("prod_starter", "Starter", {
  ...tierMetadata({
    tierId: "starter",
    status: "live",
    tagline: "Start learning English.",
    creditsAmount: "5000000",
    trialDays: "0",
    aiBudgetLabel: "a taste each month",
    caps_save_words: "200",
    caps_ai_credits: "5000000",
    caps_weekly_insights: "0",
    caps_session_history: "0",
    caps_live_conversations: "3",
  }),
});
const LEARNER = product("prod_learner", "Learner", tierMetadata());
const FLUENT = product("prod_fluent", "Fluent", {
  ...tierMetadata({
    tierId: "fluent",
    status: "dark",
    creditsAmount: "600000000",
    trialDays: "0",
    caps_ai_credits: "600000000",
  }),
});
const LEGACY = product("prod_legacy", "Old Pro", { foo: "bar" });

const PRICES: Record<string, Stripe.Price[]> = {
  prod_learner: [
    price("price_learner_m_gbp", "prod_learner", "gbp", 899, "month"),
    price("price_learner_a_gbp", "prod_learner", "gbp", 8599, "year"),
    price("price_learner_m_usd", "prod_learner", "usd", 999, "month"),
  ],
  prod_fluent: [price("price_fluent_m_gbp", "prod_fluent", "gbp", 1499, "month")],
};

function freshService(opts: { now?: () => number; ttlMs?: number } = {}) {
  const { stripe, productsList, pricesList } = makeStripe(
    [STARTER, LEARNER, FLUENT, LEGACY],
    PRICES
  );
  const service = new TierRegistryService(stripe, opts);
  return { service, productsList, pricesList };
}

describe("parseTierProduct", () => {
  it("maps a paid product + prices to a TierDefinition", () => {
    const def = parseTierProduct(LEARNER, PRICES.prod_learner);
    expect(def.id).toBe("learner");
    expect(def.userFacingName).toBe("Learner");
    expect(def.status).toBe("live");
    expect(def.isPaid).toBe(true);
    expect(def.creditBudget).toBe(300_000_000);
    expect(def.durationDays).toBe(30);
    expect(def.trialDays).toBe(3);
    expect(def.caps.save_words).toBeNull();
    expect(def.caps.ai_credits).toBe(300_000_000);
    expect(def.prices!.monthly.gbp).toBe("price_learner_m_gbp");
    expect(def.prices!.annual.gbp).toBe("price_learner_a_gbp");
    expect(def.prices!.monthly.usd).toBe("price_learner_m_usd");
    expect(def.amount!.monthly.gbp).toBe(8.99);
    expect(def.amount!.annual.gbp).toBe(85.99);
  });

  it("treats a product with no prices as the free tier", () => {
    const def = parseTierProduct(STARTER, []);
    expect(def.isPaid).toBe(false);
    expect(def.prices).toBeNull();
    expect(def.amount).toBeNull();
    expect(def.caps.save_words).toBe(200);
    expect(def.caps.weekly_insights).toBe(0);
    expect(def.trialDays).toBe(0);
  });

  it("rejects an unknown tierId", () => {
    expect(() => parseTierProduct(LEGACY, [])).toThrow(/unknown tierId/);
  });

  it("rejects an invalid status", () => {
    const bad = product("p", "X", tierMetadata({ status: "coming-soon" }));
    expect(() => parseTierProduct(bad, [])).toThrow(/status/);
  });

  it("rejects malformed featureLabels JSON", () => {
    const bad = product("p", "X", tierMetadata({ featureLabels: "[not json" }));
    expect(() => parseTierProduct(bad, [])).toThrow(/featureLabels.*JSON/);
  });

  it("rejects a non-array featureLabels JSON", () => {
    const bad = product("p", "X", tierMetadata({ featureLabels: '"a string"' }));
    expect(() => parseTierProduct(bad, [])).toThrow(/array of strings/);
  });

  it("rejects a missing required key", () => {
    const md = tierMetadata();
    delete (md as any).tagline;
    expect(() => parseTierProduct(product("p", "X", md), [])).toThrow(
      /tagline is required/
    );
  });

  it("rejects an invalid cap value", () => {
    const bad = product("p", "X", tierMetadata({ caps_save_words: "lots" }));
    expect(() => parseTierProduct(bad, [])).toThrow(/caps_save_words/);
  });

  it("rejects a malformed integer field", () => {
    const bad = product("p", "X", tierMetadata({ creditsAmount: "3.5" }));
    expect(() => parseTierProduct(bad, [])).toThrow(/creditsAmount/);
  });
});

describe("TierRegistryService", () => {
  it("loads and exposes tiers by id", async () => {
    const { service } = freshService();
    expect((await service.getTier("learner"))!.userFacingName).toBe("Learner");
    expect((await service.getTier("starter"))!.isPaid).toBe(false);
    expect(await service.getTier("nope" as any)).toBeNull();
  });

  it("ignores products without a known tierId", async () => {
    const { service } = freshService();
    const ids = (await service.listTiers()).map((t) => t.id);
    expect(ids).toEqual(["starter", "learner", "fluent"]);
  });

  it("liveTiers excludes dark tiers", async () => {
    const { service } = freshService();
    const ids = (await service.liveTiers()).map((t) => t.id);
    expect(ids).toContain("starter");
    expect(ids).toContain("learner");
    expect(ids).not.toContain("fluent");
  });

  it("resolves a price ID to tier/cadence/currency", async () => {
    const { service } = freshService();
    const resolved = await service.resolveByPriceId("price_learner_a_gbp");
    expect(resolved!.tier.id).toBe("learner");
    expect(resolved!.cadence).toBe("annual");
    expect(resolved!.currency).toBe("gbp");
    expect(await service.resolveByPriceId("price_missing")).toBeNull();
  });

  it("resolves a product ID to its tier", async () => {
    const { service } = freshService();
    expect((await service.resolveByProductId("prod_fluent"))!.id).toBe("fluent");
    expect(await service.resolveByProductId("prod_missing")).toBeNull();
  });

  it("caches within the TTL (one Stripe products.list per window)", async () => {
    const clock = { t: 0 };
    const { service, productsList } = freshService({
      now: () => clock.t,
      ttlMs: 1000,
    });
    await service.getTier("learner");
    await service.getTier("fluent");
    await service.listTiers();
    expect(productsList).toHaveBeenCalledTimes(1);
  });

  it("refreshes in the background after the TTL (stale-while-revalidate)", async () => {
    const clock = { t: 0 };
    const { service, productsList } = freshService({
      now: () => clock.t,
      ttlMs: 1000,
    });
    await service.getTier("learner");
    expect(productsList).toHaveBeenCalledTimes(1);

    clock.t = 2000; // past TTL
    await service.getTier("learner"); // serves stale, schedules refresh
    await flush();
    expect(productsList).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good cache when a refresh fails", async () => {
    const clock = { t: 0 };
    const { service, productsList } = freshService({
      now: () => clock.t,
      ttlMs: 1000,
    });
    await service.getTier("learner");

    productsList.mockRejectedValueOnce(new Error("Stripe down"));
    clock.t = 2000;
    // Stale read still returns data; the background refresh fails silently.
    expect((await service.getTier("learner"))!.id).toBe("learner");
    await flush();
    expect((await service.getTier("learner"))!.id).toBe("learner");
  });

  it("throws on a cold-start load failure (no cache to fall back to)", async () => {
    const { stripe, productsList } = makeStripe([], {});
    productsList.mockRejectedValueOnce(new Error("Stripe down"));
    const service = new TierRegistryService(stripe);
    await expect(service.getTier("learner")).rejects.toThrow("Stripe down");
  });

  it("throws when Stripe has no tier products", async () => {
    const { stripe } = makeStripe([LEGACY], {});
    const service = new TierRegistryService(stripe);
    await expect(service.listTiers()).rejects.toThrow(/no tier products/);
  });

  it("re-fetches after invalidate()", async () => {
    const clock = { t: 0 };
    const { service, productsList } = freshService({
      now: () => clock.t,
      ttlMs: 1_000_000,
    });
    await service.getTier("learner");
    expect(productsList).toHaveBeenCalledTimes(1);
    service.invalidate();
    await service.getTier("learner");
    expect(productsList).toHaveBeenCalledTimes(2);
  });
});
