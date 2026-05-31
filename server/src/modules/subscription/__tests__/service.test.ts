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
  voiceSessionMaxSeconds,
  debitVoiceMinutes,
  addVoiceMinutesPack,
  computeVoiceBalance,
  carryForwardTopUps,
  assertAndConsumeTextChat,
  getTextChatMessageCap,
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

describe("voiceSessionMaxSeconds (pure session-duration policy)", () => {
  it("caps a free session at the per-session limit (5 min)", () => {
    expect(voiceSessionMaxSeconds({ remaining: 5, scope: "freemium" })).toBe(300);
    // Even with a large remaining, free never exceeds the per-session cap.
    expect(voiceSessionMaxSeconds({ remaining: 50, scope: "freemium" })).toBe(300);
  });

  it("never exceeds the user's remaining minutes (free)", () => {
    // 3 left -> a 3:00 session, not the full 5:00 cap.
    expect(voiceSessionMaxSeconds({ remaining: 3, scope: "freemium" })).toBe(180);
  });

  it("returns 0 when out of minutes (clamped, never negative)", () => {
    expect(voiceSessionMaxSeconds({ remaining: 0, scope: "freemium" })).toBe(0);
    expect(voiceSessionMaxSeconds({ remaining: -2, scope: "freemium" })).toBe(0);
  });

  it("bounds a paid session only by remaining (no per-session cap)", () => {
    expect(voiceSessionMaxSeconds({ remaining: 90, scope: "subscription" })).toBe(5400);
    expect(voiceSessionMaxSeconds({ remaining: 0, scope: "subscription" })).toBe(0);
  });
});

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

// Days from now as a Date (for top-up purchased_at / expires_at).
const day = (n: number) => new Date(Date.now() + n * 86400e3);

describe("computeVoiceBalance — top-up allocation + 90-day expiry", () => {
  it("base only, no packs", () => {
    const b = computeVoiceBalance({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 20,
      top_ups: [],
    });
    expect(b).toMatchObject({ base: 90, used: 20, total: 90, remaining: 70 });
    expect(b.activeTopUps).toEqual([]);
  });

  it("adds a non-expired pack to total + remaining", () => {
    const e1 = day(30);
    const b = computeVoiceBalance({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 0,
      top_ups: [
        { session_id: "s1", pack_size: 30, minutes: 30, purchased_at: day(-1), expires_at: e1 },
      ],
    });
    expect(b.total).toBe(120);
    expect(b.remaining).toBe(120);
    expect(b.activeTopUps).toEqual([
      { pack_size: 30, minutes_remaining: 30, expires_at: e1 },
    ]);
  });

  it("allocates usage base-first, then spills into the pack", () => {
    // base 90, used 100 -> base exhausted, 10 spills into the 30-min pack
    const b = computeVoiceBalance({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 100,
      top_ups: [
        { session_id: "s1", pack_size: 30, minutes: 30, purchased_at: day(-1), expires_at: day(30) },
      ],
    });
    expect(b.remaining).toBe(20); // 0 base + (30 - 10)
    expect(b.activeTopUps[0].minutes_remaining).toBe(20);
  });

  it("excludes expired packs from total, remaining, and the active list", () => {
    const b = computeVoiceBalance({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 0,
      top_ups: [
        { session_id: "old", pack_size: 30, minutes: 30, purchased_at: day(-100), expires_at: day(-1) },
      ],
    });
    expect(b.total).toBe(90);
    expect(b.remaining).toBe(90);
    expect(b.activeTopUps).toEqual([]);
  });

  it("consumes packs oldest-first across two packs", () => {
    // base 90, used 110 -> 20 overflow: older 30-pack takes 20 (10 left), newer 120-pack untouched
    const e1 = day(80);
    const e2 = day(88);
    const b = computeVoiceBalance({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 110,
      top_ups: [
        { session_id: "old", pack_size: 30, minutes: 30, purchased_at: day(-10), expires_at: e1 },
        { session_id: "new", pack_size: 120, minutes: 120, purchased_at: day(-2), expires_at: e2 },
      ],
    });
    expect(b.activeTopUps).toEqual([
      { pack_size: 30, minutes_remaining: 10, expires_at: e1 },
      { pack_size: 120, minutes_remaining: 120, expires_at: e2 },
    ]);
    expect(b.remaining).toBe(130);
  });
});

describe("carryForwardTopUps — renewal survival", () => {
  it("folds surviving packs' remaining forward and drops expired ones", () => {
    const e1 = day(40); // survives
    const r = carryForwardTopUps({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 100, // 10 overflow lands on the surviving pack
      top_ups: [
        { session_id: "keep", pack_size: 30, minutes: 30, purchased_at: day(-5), expires_at: e1 },
        { session_id: "gone", pack_size: 30, minutes: 30, purchased_at: day(-100), expires_at: day(-1) },
      ],
    });
    expect(r.minutes).toBe(20);
    expect(r.packs).toHaveLength(1);
    expect(r.packs[0]).toMatchObject({ session_id: "keep", pack_size: 30, minutes: 20, expires_at: e1 });
  });

  it("drops a fully-consumed pack", () => {
    const r = carryForwardTopUps({
      entitlements: { voiceMinutesGranted: 90 },
      voice_minutes_used: 130, // 40 overflow > the 30-min pack -> consumed
      top_ups: [
        { session_id: "x", pack_size: 30, minutes: 30, purchased_at: day(-5), expires_at: day(40) },
      ],
    });
    expect(r.minutes).toBe(0);
    expect(r.packs).toEqual([]);
  });
});

describe("addVoiceMinutesPack — grant + idempotency", () => {
  let col: any;
  beforeEach(() => {
    jest.clearAllMocks();
    col = { findOne: jest.fn(), updateOne: jest.fn() };
    (getCollection as any).mockReturnValue(col);
  });

  it("pushes a ledger entry + $incs voice_minutes_total when applied", async () => {
    col.findOne.mockResolvedValue({ _id: "sub1" });
    col.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const r = await addVoiceMinutesPack({ userId: USER, minutes: 30, packSize: 30, sessionId: "cs_1" });
    expect(r).toMatchObject({ success: true, applied: true, idempotent: false });
    const [filter, update] = col.updateOne.mock.calls[0];
    expect(filter["top_ups.session_id"]).toEqual({ $ne: "cs_1" });
    expect(update.$inc).toEqual({ voice_minutes_total: 30 });
    expect(update.$push.top_ups).toMatchObject({ session_id: "cs_1", pack_size: 30, minutes: 30 });
  });

  it("is idempotent when the session was already applied (no rows modified)", async () => {
    col.findOne.mockResolvedValue({ _id: "sub1" });
    col.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const r = await addVoiceMinutesPack({ userId: USER, minutes: 30, packSize: 30, sessionId: "cs_1" });
    expect(r).toMatchObject({ success: true, applied: false, idempotent: true });
  });

  it("refuses when there is no active subscription", async () => {
    col.findOne.mockResolvedValue(null);
    const r = await addVoiceMinutesPack({ userId: USER, minutes: 30, packSize: 30, sessionId: "cs_1" });
    expect(r).toMatchObject({ success: false, applied: false });
    expect(col.updateOne).not.toHaveBeenCalled();
  });
});

describe("text-chat caps — assertAndConsumeTextChat + getTextChatMessageCap (S16)", () => {
  let col: any;
  beforeEach(() => {
    jest.clearAllMocks();
    col = { findOne: jest.fn(), updateOne: jest.fn(async () => ({})) };
    (getCollection as any).mockReturnValue(col);
  });

  it("Reader under the monthly cap consumes one chat ($inc used)", async () => {
    col.findOne.mockResolvedValue({
      _id: "sub1",
      allowed_text_chats: 60,
      allowed_text_chats_used: 10,
    });
    await expect(assertAndConsumeTextChat(USER)).resolves.toBeUndefined();
    const [, update] = col.updateOne.mock.calls[0];
    expect(update).toEqual({ $inc: { allowed_text_chats_used: 1 } });
  });

  it("Reader at the monthly cap is blocked (no consume)", async () => {
    col.findOne.mockResolvedValue({
      _id: "sub1",
      allowed_text_chats: 60,
      allowed_text_chats_used: 60,
    });
    await expect(assertAndConsumeTextChat(USER)).rejects.toThrow(
      EntitlementLimitError
    );
    expect(col.updateOne).not.toHaveBeenCalled();
  });

  it("an unlimited tier (no stored cap) is a no-op", async () => {
    col.findOne.mockResolvedValue({
      _id: "sub1",
      allowed_text_chats: null,
      allowed_text_chats_used: 999,
    });
    await expect(assertAndConsumeTextChat(USER)).resolves.toBeUndefined();
    expect(col.updateOne).not.toHaveBeenCalled();
  });

  it("free Starter at the cap is blocked", async () => {
    col.findOne
      .mockResolvedValueOnce(null) // no active subscription
      .mockResolvedValueOnce({
        toObject: () => ({
          _id: "fc1",
          allowed_text_chats: 5,
          allowed_text_chats_used: 5,
        }),
      });
    await expect(assertAndConsumeTextChat(USER)).rejects.toThrow(
      EntitlementLimitError
    );
  });

  it("getTextChatMessageCap returns the snapshot cap for a paid Reader", async () => {
    col.findOne.mockResolvedValue({ entitlements: { textChatMaxMessages: 60 } });
    await expect(getTextChatMessageCap(USER)).resolves.toBe(60);
  });

  it("getTextChatMessageCap returns null (unlimited) for Learner / Coach", async () => {
    col.findOne.mockResolvedValue({
      entitlements: { textChatMaxMessages: null },
    });
    await expect(getTextChatMessageCap(USER)).resolves.toBeNull();
  });

  it("getTextChatMessageCap falls back to the freemium message cap", async () => {
    col.findOne.mockResolvedValue(null);
    await expect(getTextChatMessageCap(USER)).resolves.toBe(20);
  });
});
