import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// service.ts touches Mongo (getCollection), emits events, and imports the gateway
// adapter factory — mock those so we can unit-test the grant/idempotency logic.
jest.mock("@modular-rest/server", () => ({
  getCollection: jest.fn(),
}));
jest.mock("../events", () => ({
  emitLowCreditsEvent: jest.fn(),
  emitSoftCapEvent: jest.fn(),
  emitSubscriptionChangeEvent: jest.fn(),
  emitSubscriptionExpiredEvent: jest.fn(),
}));
jest.mock("../../gateway/adapters", () => ({
  PaymentAdapterFactory: { getStripeAdapter: jest.fn() },
  PaymentProvider: { STRIPE: "stripe" },
}));
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: {},
}));

import { Types } from "mongoose";
import { getCollection } from "@modular-rest/server";
import {
  addNewSubscriptionWithCredit,
  updateSubscriptionStatusByProviderAndSubscriptionId,
  getVoiceBudget,
  assertVoiceMinutesAvailable,
  debitVoiceMinutes,
} from "../service";
import { EntitlementLimitError } from "../enforcement";
import { PaymentProvider } from "../../gateway/adapters";

const USER = "507f1f77bcf86cd799439011"; // valid ObjectId hex

const entitlements: any = {
  schemaVersion: "1",
  tierId: "learner",
  tierRank: 2,
  status: "live",
  creditsGranted: 300_000_000,
  voiceMinutesGranted: 90,
  saveWordsCap: null,
  textChatCap: null,
  liveSessionsCap: null,
  weeklyInsights: true,
  sessionHistory: true,
  durationDays: 30,
  trialDays: 3,
};

describe("voice-minute metering", () => {
  let col: any;
  beforeEach(() => {
    jest.clearAllMocks();
    col = { findOne: jest.fn(), updateOne: jest.fn(async () => ({})) };
    (getCollection as any).mockReturnValue(col);
  });

  it("reads the budget from the active subscription", async () => {
    col.findOne.mockResolvedValue({
      voice_minutes_total: 90,
      voice_minutes_used: 20,
    });
    const budget = await getVoiceBudget(USER);
    expect(budget).toMatchObject({
      total: 90,
      used: 20,
      remaining: 70,
      scope: "subscription",
    });
  });

  it("allows a voice session while minutes remain", async () => {
    col.findOne.mockResolvedValue({
      voice_minutes_total: 90,
      voice_minutes_used: 89,
    });
    await expect(assertVoiceMinutesAvailable(USER)).resolves.toBeUndefined();
  });

  it("blocks a voice session when the budget is exhausted (e.g. Reader = 0)", async () => {
    col.findOne.mockResolvedValue({
      voice_minutes_total: 0,
      voice_minutes_used: 0,
    });
    await expect(assertVoiceMinutesAvailable(USER)).rejects.toThrow(
      EntitlementLimitError
    );
  });

  it("debits rounded-up minutes via $inc, keyed by ObjectId", async () => {
    col.findOne.mockResolvedValue({
      voice_minutes_total: 90,
      voice_minutes_used: 0,
    });
    await debitVoiceMinutes(USER, 9.2); // e.g. 552s -> 10 minutes
    const [filter, update] = col.updateOne.mock.calls[0];
    expect(filter.user_id).toBeInstanceOf(Types.ObjectId);
    expect(update).toEqual({ $inc: { voice_minutes_used: 10 } });
  });

  it("does not write when there is nothing to debit", async () => {
    col.findOne.mockResolvedValue({
      voice_minutes_total: 90,
      voice_minutes_used: 0,
    });
    await debitVoiceMinutes(USER, 0);
    expect(col.updateOne).not.toHaveBeenCalled();
  });

  it("falls back to the freemium allocation when there is no subscription", async () => {
    // getVoiceBudget: subscription lookup misses, then getOrCreateFreemiumAllocation hits.
    col.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        toObject: () => ({
          _id: "fc1",
          voice_minutes_total: 5,
          voice_minutes_used: 5,
        }),
      });
    await expect(assertVoiceMinutesAvailable(USER)).rejects.toThrow(
      EntitlementLimitError
    );
  });
});

describe("addNewSubscriptionWithCredit — idempotency + snapshot", () => {
  let col: any;
  beforeEach(() => {
    jest.clearAllMocks();
    col = {
      findOne: jest.fn(),
      updateMany: jest.fn(async () => ({})),
      create: jest.fn(async (doc: any) => ({
        _id: "sub_new",
        end_date: doc.end_date,
        available_credit: 0,
      })),
      updateOne: jest.fn(async () => ({})),
    };
    (getCollection as any).mockReturnValue(col);
  });

  it("skips creating a second doc when this Stripe sub was already granted for this period", async () => {
    col.findOne.mockResolvedValue({
      _id: "sub_existing",
      granted_period_end: new Date(2000 * 1000),
      total_credits: 300_000_000,
      credits_used: 10,
      end_date: new Date(2000 * 1000),
    });
    const res: any = await addNewSubscriptionWithCredit({
      userId: USER,
      creditAmount: entitlements.creditsGranted,
      voiceMinutes: 90,
      startDateUnixTimestamp: 1000,
      endDateUnixTimestamp: 2000,
      grantedPeriodEndUnixTimestamp: 2000,
      stripeSubscriptionId: "sub_1",
      entitlements,
      tier: "learner",
      paymentMetaData: { provider: "stripe", stripe: { subscription_id: "sub_1" } },
    });
    expect(res.idempotent).toBe(true);
    expect(col.create).not.toHaveBeenCalled();
    expect(col.updateMany).not.toHaveBeenCalled();
  });

  it("creates a new subscription seeded with the entitlement snapshot + voice budget + period marker", async () => {
    col.findOne.mockResolvedValue(null);
    await addNewSubscriptionWithCredit({
      userId: USER,
      creditAmount: entitlements.creditsGranted,
      voiceMinutes: 90,
      startDateUnixTimestamp: 1000,
      endDateUnixTimestamp: 2000,
      grantedPeriodEndUnixTimestamp: 2000,
      stripeSubscriptionId: "sub_1",
      entitlements,
      tier: "learner",
      subscriptionType: "monthly",
      paymentMetaData: { provider: "stripe", stripe: { subscription_id: "sub_1" } },
    });
    expect(col.updateMany).toHaveBeenCalled(); // deactivate prior active subs
    expect(col.create).toHaveBeenCalledTimes(1);
    const doc = col.create.mock.calls[0][0];
    expect(doc.total_credits).toBe(300_000_000);
    expect(doc.voice_minutes_total).toBe(90);
    expect(doc.voice_minutes_used).toBe(0);
    expect(doc.tier).toBe("learner");
    expect(doc.entitlements).toEqual(entitlements);
    expect(doc.granted_period_end).toEqual(new Date(2000 * 1000));
  });
});

describe("updateSubscriptionStatusByProviderAndSubscriptionId — lock at purchase, re-read at renewal", () => {
  let col: any;
  beforeEach(() => {
    jest.clearAllMocks();
    col = { findOne: jest.fn(), updateOne: jest.fn(async () => ({})) };
    (getCollection as any).mockReturnValue(col);
  });

  function current(grantedEndUnix: number) {
    return {
      _id: "sub1",
      start_date: new Date(1000 * 1000),
      end_date: new Date(2000 * 1000),
      granted_period_end: new Date(grantedEndUnix * 1000),
    };
  }

  it("refills credits + voice + re-reads the snapshot on a real period rollover", async () => {
    col.findOne.mockResolvedValue(current(2000));
    await updateSubscriptionStatusByProviderAndSubscriptionId({
      provider: PaymentProvider.STRIPE,
      subscriptionId: "sub_1",
      status: "active",
      startDateUnixTimestamp: 2000,
      endDateUnixTimestamp: 4000, // newer than the granted period (2000)
      tier: "learner",
      subscriptionType: "monthly",
      priceId: "price_1",
      creditAmount: 300_000_000,
      voiceMinutes: 90,
      entitlements,
    });
    const set = col.updateOne.mock.calls[0][1].$set;
    expect(set.total_credits).toBe(300_000_000);
    expect(set.credits_used).toBe(0);
    expect(set.voice_minutes_total).toBe(90);
    expect(set.voice_minutes_used).toBe(0);
    expect(set.entitlements).toEqual(entitlements);
    expect(set.granted_period_end).toEqual(new Date(4000 * 1000));
  });

  it("does NOT refill on the same/older period (idempotent + out-of-order safe), still syncs status", async () => {
    col.findOne.mockResolvedValue(current(4000)); // already granted up to 4000
    await updateSubscriptionStatusByProviderAndSubscriptionId({
      provider: PaymentProvider.STRIPE,
      subscriptionId: "sub_1",
      status: "active",
      startDateUnixTimestamp: 2000,
      endDateUnixTimestamp: 4000, // not newer than granted (4000) -> no re-grant
      tier: "learner",
      subscriptionType: "monthly",
      priceId: "price_1",
      creditAmount: 300_000_000,
      voiceMinutes: 90,
      entitlements,
      cancelAtPeriodEnd: true,
    });
    const set = col.updateOne.mock.calls[0][1].$set;
    expect(set.total_credits).toBeUndefined(); // no refill
    expect(set.voice_minutes_total).toBeUndefined();
    expect(set.granted_period_end).toBeUndefined();
    expect(set.status).toBe("active"); // status/flags still synced
    expect(set.cancel_at_period_end).toBe(true);
  });
});
