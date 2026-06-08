import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Isolate the webhook logic from Mongo, Stripe, and the subscription service.
jest.mock("@modular-rest/server", () => ({
  getCollection: jest.fn(),
  userManager: { getUserById: jest.fn() },
}));
jest.mock("../../subscription/service", () => ({
  // Default: a brand-new grant, so create-path lifecycle events fire.
  addNewSubscriptionWithCredit: jest.fn(async () => ({ isNewSubscription: true })),
  // Default: a plain renewal (active -> active) — no lifecycle event fires.
  updateSubscriptionStatusByProviderAndSubscriptionId: jest.fn(async () => ({
    success: true,
    message: "ok",
    previousStatus: "active",
  })),
  cancelSubscriptionByProviderAndSubscriptionId: jest.fn(async () => ({
    success: true,
    message: "ok",
    wasTrialing: false,
  })),
}));
jest.mock("../../subscription/entitlements", () => ({
  resolveEntitlements: jest.fn(),
  resolveTierCheckout: jest.fn(),
  clearEntitlementsCache: jest.fn(),
  cachedTierName: jest.fn(() => null), // label falls back to the capitalized tier id
}));
jest.mock("../../subscription/plans", () => ({
  clearPlansCache: jest.fn(),
}));
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: {
    ENTITLEMENT_GRANT_REFUSED: "entitlement-grant_refused",
    TRIAL_STARTED: "trial_started",
    SUBSCRIPTION_STARTED: "subscription_started",
    SUBSCRIPTION_CANCELED: "subscription_canceled",
  },
}));

import { getCollection } from "@modular-rest/server";
import { StripeAdapter } from "../adapters/stripe.adapter";
import {
  addNewSubscriptionWithCredit,
  updateSubscriptionStatusByProviderAndSubscriptionId,
  cancelSubscriptionByProviderAndSubscriptionId,
} from "../../subscription/service";
import {
  resolveEntitlements,
  clearEntitlementsCache,
} from "../../subscription/entitlements";
import { clearPlansCache } from "../../subscription/plans";
import { trackServerEvent } from "../../../utils/analytics";

const entitlements: any = {
  tierId: "learner",
  creditsGranted: 300_000_000,
  voiceMinutesGranted: 90,
  durationDays: 30,
  trialDays: 3,
  status: "live",
};

function createdEvent() {
  return {
    type: "customer.subscription.created",
    data: {
      object: {
        customer: "cus_1",
        id: "sub_1",
        status: "trialing",
        trial_end: 1234,
        items: {
          data: [
            {
              price: { id: "price_1", recurring: { interval: "month" } },
              current_period_start: 1000,
              current_period_end: 2000,
            },
          ],
        },
      },
    },
  };
}

describe("StripeAdapter.handleWebhook (metadata-driven grants)", () => {
  let adapter: StripeAdapter;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    (getCollection as any).mockReturnValue({
      findOne: jest.fn(async () => ({ user_id: "u1" })), // stripe_customer -> userId
    });
    adapter = new StripeAdapter("sk_test_dummy");
  });

  it("grants from product metadata on customer.subscription.created", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    const res = await adapter.handleWebhook(createdEvent());
    expect(res.success).toBe(true);
    expect(addNewSubscriptionWithCredit).toHaveBeenCalledTimes(1);
    const args: any = (addNewSubscriptionWithCredit as any).mock.calls[0][0];
    expect(args.creditAmount).toBe(300_000_000);
    expect(args.voiceMinutes).toBe(90);
    expect(args.grantedPeriodEndUnixTimestamp).toBe(2000);
    expect(args.stripeSubscriptionId).toBe("sub_1");
    expect(args.tier).toBe("learner");
    expect(args.subscriptionType).toBe("monthly");
    expect(args.entitlements).toEqual(entitlements);
    // Label falls back to the capitalized tier id when no product name is cached.
    expect(args.paymentMetaData.stripe.label).toBe("Learner");
  });

  it("FAIL-SAFE: refuses (no grant) and alerts when metadata is invalid", async () => {
    (resolveEntitlements as any).mockRejectedValue(new Error("bad metadata"));
    const res = await adapter.handleWebhook(createdEvent());
    expect(res.success).toBe(false); // -> webhook returns non-2xx -> Stripe retries
    expect(addNewSubscriptionWithCredit).not.toHaveBeenCalled(); // never guesses
    expect(trackServerEvent).toHaveBeenCalledWith(
      "entitlement-grant_refused",
      "u1",
      expect.anything()
    );
  });

  it("fires trial_started when a subscription is created as trialing", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    await adapter.handleWebhook(createdEvent());
    expect(trackServerEvent).toHaveBeenCalledWith("trial_started", "u1", {
      cadence: "monthly",
      tier: "learner",
    });
  });

  it("fires subscription_canceled (was_trialing flag) on customer.subscription.deleted", async () => {
    const event = {
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_1", id: "sub_1", status: "canceled" } },
    };
    const res = await adapter.handleWebhook(event);
    expect(res.success).toBe(true);
    expect(trackServerEvent).toHaveBeenCalledWith(
      "subscription_canceled",
      "u1",
      { was_trialing: false }
    );
  });

  it("fires subscription_started (via_trial) on the trialing -> active transition", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    // The transition is detected from OUR stored prior status, not Stripe's
    // previous_attributes: the record was "trialing" before this update.
    (updateSubscriptionStatusByProviderAndSubscriptionId as any).mockResolvedValueOnce({
      success: true,
      message: "ok",
      previousStatus: "trialing",
    });
    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_1",
          id: "sub_1",
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          items: {
            data: [
              {
                price: { id: "price_1", recurring: { interval: "month" } },
                current_period_start: 2000,
                current_period_end: 4000,
              },
            ],
          },
        },
        previous_attributes: { status: "trialing" },
      },
    };
    const res = await adapter.handleWebhook(event);
    expect(res.success).toBe(true);
    expect(trackServerEvent).toHaveBeenCalledWith(
      "subscription_started",
      "u1",
      { cadence: "monthly", tier: "learner", via_trial: true }
    );
  });

  it("refills via the renewal path on customer.subscription.updated (cadence from interval)", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_1",
          id: "sub_1",
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          items: {
            data: [
              {
                price: { id: "price_1", recurring: { interval: "year" } },
                current_period_start: 2000,
                current_period_end: 4000,
              },
            ],
          },
        },
        previous_attributes: {},
      },
    };
    const res = await adapter.handleWebhook(event);
    expect(res.success).toBe(true);
    expect(updateSubscriptionStatusByProviderAndSubscriptionId).toHaveBeenCalledTimes(1);
    const args: any = (updateSubscriptionStatusByProviderAndSubscriptionId as any).mock
      .calls[0][0];
    expect(args.creditAmount).toBe(300_000_000);
    expect(args.voiceMinutes).toBe(90);
    expect(args.subscriptionType).toBe("annual"); // year interval
    expect(args.endDateUnixTimestamp).toBe(4000);
    expect(args.entitlements).toEqual(entitlements);
    // A renewal (active -> active, default mock previousStatus) is not a start.
    expect(trackServerEvent).not.toHaveBeenCalledWith(
      "subscription_started",
      expect.anything(),
      expect.anything()
    );
  });

  it("fires subscription_started (via_trial:false) on a direct active create", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    const event = createdEvent();
    (event.data.object as any).status = "active"; // no trial — returning customer
    await adapter.handleWebhook(event);
    expect(trackServerEvent).toHaveBeenCalledWith("subscription_started", "u1", {
      cadence: "monthly",
      tier: "learner",
      via_trial: false,
    });
  });

  it("does NOT re-fire lifecycle events on a redelivered (idempotent) create", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    // The DB grant is idempotent on redelivery -> isNewSubscription:false.
    (addNewSubscriptionWithCredit as any).mockResolvedValueOnce({
      isNewSubscription: false,
      idempotent: true,
    });
    await adapter.handleWebhook(createdEvent());
    expect(trackServerEvent).not.toHaveBeenCalledWith(
      "trial_started",
      expect.anything(),
      expect.anything()
    );
    expect(trackServerEvent).not.toHaveBeenCalledWith(
      "subscription_started",
      expect.anything(),
      expect.anything()
    );
  });

  it("fires subscription_started (via_trial:false) on an incomplete -> active transition", async () => {
    (resolveEntitlements as any).mockResolvedValue(entitlements);
    // SCA/3DS flow: created as "incomplete", clears to "active" later.
    (updateSubscriptionStatusByProviderAndSubscriptionId as any).mockResolvedValueOnce({
      success: true,
      message: "ok",
      previousStatus: "incomplete",
    });
    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_1",
          id: "sub_1",
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          items: {
            data: [
              {
                price: { id: "price_1", recurring: { interval: "month" } },
                current_period_start: 2000,
                current_period_end: 4000,
              },
            ],
          },
        },
        previous_attributes: {},
      },
    };
    await adapter.handleWebhook(event);
    expect(trackServerEvent).toHaveBeenCalledWith("subscription_started", "u1", {
      cadence: "monthly",
      tier: "learner",
      via_trial: false,
    });
  });

  it("fires subscription_canceled with was_trialing:true when a trial is canceled", async () => {
    (cancelSubscriptionByProviderAndSubscriptionId as any).mockResolvedValueOnce({
      success: true,
      message: "ok",
      wasTrialing: true,
    });
    const event = {
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_1", id: "sub_1", status: "canceled" } },
    };
    await adapter.handleWebhook(event);
    expect(trackServerEvent).toHaveBeenCalledWith("subscription_canceled", "u1", {
      was_trialing: true,
    });
  });

  it("does NOT fire subscription_canceled when the cancel did not apply", async () => {
    (cancelSubscriptionByProviderAndSubscriptionId as any).mockResolvedValueOnce({
      success: false,
      message: "Subscription not found",
      wasTrialing: false,
    });
    const event = {
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_1", id: "sub_1", status: "canceled" } },
    };
    await adapter.handleWebhook(event);
    expect(trackServerEvent).not.toHaveBeenCalledWith(
      "subscription_canceled",
      expect.anything(),
      expect.anything()
    );
  });

  it("clears the entitlement + plans caches on product.updated", async () => {
    const event = { type: "product.updated", data: { object: { id: "prod_1" } } };
    const res = await adapter.handleWebhook(event);
    expect(res.success).toBe(true);
    expect(clearEntitlementsCache).toHaveBeenCalledWith("prod_1");
    expect(clearPlansCache).toHaveBeenCalled();
  });

  it("clears caches on price.updated using the price's product id", async () => {
    const event = {
      type: "price.updated",
      data: { object: { id: "price_x", product: "prod_2" } },
    };
    const res = await adapter.handleWebhook(event);
    expect(res.success).toBe(true);
    expect(clearEntitlementsCache).toHaveBeenCalledWith("prod_2");
    expect(clearPlansCache).toHaveBeenCalled();
  });
});
