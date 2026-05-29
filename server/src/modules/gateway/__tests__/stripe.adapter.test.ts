import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the heavy/IO dependencies the adapter pulls in at module load.
jest.mock("@modular-rest/server", () => ({
  getCollection: jest.fn(),
  userManager: { getUserById: jest.fn() },
}));
jest.mock("../../subscription/service", () => ({
  addNewSubscriptionWithCredit: jest.fn(),
  cancelSubscriptionByProviderAndSubscriptionId: jest.fn(),
  updateSubscriptionStatusByProviderAndSubscriptionId: jest.fn(),
}));
jest.mock("../../subscription/tiers", () => ({
  getTierRegistry: jest.fn(),
}));
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: {
    TRIAL_CONVERTED: "trial-converted",
    TRIAL_CANCELED: "trial-canceled",
    STARTER_AI_EXHAUSTED: "starter-ai-exhausted",
  },
}));

import { StripeAdapter } from "../adapters/stripe.adapter";
import {
  addNewSubscriptionWithCredit,
  cancelSubscriptionByProviderAndSubscriptionId,
  updateSubscriptionStatusByProviderAndSubscriptionId,
} from "../../subscription/service";
import { getTierRegistry } from "../../subscription/tiers";
import { getCollection } from "@modular-rest/server";

const LEARNER_TIER = {
  id: "learner",
  status: "live",
  userFacingName: "Learner",
  tagline: "",
  isPaid: true,
  stripeProductId: "prod_learner",
  prices: {
    monthly: { gbp: "price_learner_m_gbp" },
    annual: { gbp: "price_learner_a_gbp" },
  },
  amount: { monthly: { gbp: 8.99 }, annual: { gbp: 85.99 } },
  creditBudget: 300_000_000,
  durationDays: 30,
  trialDays: 3,
  caps: {} as any,
  featureLabels: [],
  aiBudgetLabel: "",
};

let fakeRegistry: any;

/** Construct an adapter and swap in a fake Stripe client. */
function makeAdapter(stripe: any) {
  const adapter = new StripeAdapter("sk_test_x");
  adapter.stripe = stripe;
  return adapter;
}

/** Point getCollection at a collection whose findOne resolves to `record`. */
function stubCollection(record: any) {
  (getCollection as any).mockReturnValue({
    findOne: jest.fn<any>().mockResolvedValue(record),
    updateOne: jest.fn<any>().mockResolvedValue({}),
  });
}

function subObject(overrides: any = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "trialing",
    trial_end: 1_700_000_000,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: "price_learner_m_gbp" },
          current_period_start: 1000,
          current_period_end: 2000,
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeRegistry = {
    resolveByPriceId: jest.fn<any>().mockResolvedValue({
      tier: LEARNER_TIER,
      cadence: "monthly",
      currency: "gbp",
    }),
    getTier: jest.fn<any>().mockResolvedValue(LEARNER_TIER),
    invalidate: jest.fn(),
  };
  (getTierRegistry as any).mockReturnValue(fakeRegistry);
  (addNewSubscriptionWithCredit as any).mockResolvedValue({});
  (updateSubscriptionStatusByProviderAndSubscriptionId as any).mockResolvedValue(
    { success: true, message: "ok" }
  );
  (cancelSubscriptionByProviderAndSubscriptionId as any).mockResolvedValue({
    success: true,
    message: "ok",
    wasTrialing: false,
  });
});

describe("StripeAdapter.handleWebhook — customer.subscription.created", () => {
  it("creates the subscription with the tier credit budget + presentment currency", async () => {
    stubCollection({ user_id: "user_1" });
    const stripe = {
      checkout: {
        sessions: {
          list: jest.fn<any>().mockResolvedValue({
            data: [{ presentment_details: { presentment_currency: "usd" } }],
          }),
        },
      },
    };
    const adapter = makeAdapter(stripe);

    const res = await adapter.handleWebhook({
      type: "customer.subscription.created",
      data: { object: subObject() },
    } as any);

    expect(res.success).toBe(true);
    expect(addNewSubscriptionWithCredit).toHaveBeenCalledTimes(1);
    const arg = (addNewSubscriptionWithCredit as any).mock.calls[0][0];
    expect(arg.creditAmount).toBe(300_000_000);
    expect(arg.tier).toBe("learner");
    expect(arg.subscriptionType).toBe("monthly");
    expect(arg.priceId).toBe("price_learner_m_gbp");
    expect(arg.paymentMetaData.stripe.presentment_currency).toBe("usd");
  });

  it("omits presentment currency when the checkout session has none (GBP buyer / Adaptive off)", async () => {
    stubCollection({ user_id: "user_1" });
    const stripe = {
      checkout: { sessions: { list: jest.fn<any>().mockResolvedValue({ data: [] }) } },
    };
    const adapter = makeAdapter(stripe);

    await adapter.handleWebhook({
      type: "customer.subscription.created",
      data: { object: subObject() },
    } as any);

    const arg = (addNewSubscriptionWithCredit as any).mock.calls[0][0];
    expect(arg.paymentMetaData.stripe.presentment_currency).toBeUndefined();
  });

  it("rejects a price with no matching tier", async () => {
    stubCollection({ user_id: "user_1" });
    fakeRegistry.resolveByPriceId.mockResolvedValue(null);
    const stripe = {
      checkout: { sessions: { list: jest.fn<any>().mockResolvedValue({ data: [] }) } },
    };
    const adapter = makeAdapter(stripe);

    const res = await adapter.handleWebhook({
      type: "customer.subscription.created",
      data: { object: subObject() },
    } as any);

    expect(res.success).toBe(false);
    expect(addNewSubscriptionWithCredit).not.toHaveBeenCalled();
  });
});

describe("StripeAdapter.handleWebhook — update / delete", () => {
  it("refills the credit budget on a subscription.updated (renewal)", async () => {
    stubCollection({ user_id: "user_1" });
    const adapter = makeAdapter({});

    const res = await adapter.handleWebhook({
      type: "customer.subscription.updated",
      data: {
        object: subObject({ status: "active", trial_end: null }),
        previous_attributes: {},
      },
    } as any);

    expect(res.success).toBe(true);
    const arg = (updateSubscriptionStatusByProviderAndSubscriptionId as any).mock
      .calls[0][0];
    expect(arg.creditAmount).toBe(300_000_000);
    expect(arg.tier).toBe("learner");
    expect(arg.subscriptionType).toBe("monthly");
  });

  it("cancels on subscription.deleted", async () => {
    stubCollection({ user_id: "user_1" });
    const adapter = makeAdapter({});

    const res = await adapter.handleWebhook({
      type: "customer.subscription.deleted",
      data: { object: subObject({ status: "canceled" }) },
    } as any);

    expect(res.success).toBe(true);
    const arg = (cancelSubscriptionByProviderAndSubscriptionId as any).mock
      .calls[0][0];
    expect(arg.subscriptionId).toBe("sub_1");
  });
});

describe("StripeAdapter.handleWebhook — cache invalidation", () => {
  it.each([
    "product.updated",
    "product.created",
    "product.deleted",
    "price.updated",
    "price.created",
    "price.deleted",
  ])("invalidates the tier cache on %s", async (type) => {
    const adapter = makeAdapter({});
    const res = await adapter.handleWebhook({ type, data: { object: {} } } as any);
    expect(res.success).toBe(true);
    expect(fakeRegistry.invalidate).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate on unrelated events", async () => {
    const adapter = makeAdapter({});
    await adapter.handleWebhook({
      type: "customer.updated",
      data: { object: {} },
    } as any);
    expect(fakeRegistry.invalidate).not.toHaveBeenCalled();
  });
});

describe("StripeAdapter.createCheckoutSession — GBP base + Adaptive Pricing", () => {
  it("uses the GBP base price and enables adaptive_pricing", async () => {
    stubCollection({ get: () => "cus_1" });
    const sessionsCreate = jest
      .fn<any>()
      .mockResolvedValue({ id: "cs_1", url: "https://pay", metadata: {} });
    const stripe = {
      customers: { retrieve: jest.fn<any>().mockResolvedValue({ deleted: false }) },
      prices: {
        retrieve: jest
          .fn<any>()
          .mockResolvedValue({ unit_amount: 899, currency: "gbp" }),
      },
      checkout: { sessions: { create: sessionsCreate } },
    };
    const adapter = makeAdapter(stripe);

    const res = await adapter.createCheckoutSession({
      userId: "user_1",
      tierId: "learner",
      cadence: "monthly",
      successUrl: "https://s",
      cancelUrl: "https://c",
    } as any);

    expect(res.sessionId).toBe("cs_1");
    const createArg = sessionsCreate.mock.calls[0][0] as any;
    expect(createArg.line_items[0].price).toBe("price_learner_m_gbp");
    expect(createArg.adaptive_pricing).toEqual({ enabled: true });
    expect(createArg.mode).toBe("subscription");
    // The 3-day trial is applied in code from the tier.
    expect(createArg.subscription_data.trial_period_days).toBe(3);
  });

  it("rejects checkout for a dark/unavailable tier", async () => {
    fakeRegistry.getTier.mockResolvedValue({ ...LEARNER_TIER, status: "dark" });
    const adapter = makeAdapter({});
    await expect(
      adapter.createCheckoutSession({
        userId: "user_1",
        tierId: "learner",
        cadence: "monthly",
      } as any)
    ).rejects.toThrow(/not available/);
  });
});
