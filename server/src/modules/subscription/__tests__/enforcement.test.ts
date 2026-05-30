import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@modular-rest/server", () => ({ getCollection: jest.fn() }));

import { getCollection } from "@modular-rest/server";
import {
  getEffectiveCap,
  assertFeatureEnabled,
  assertWithinCap,
  EntitlementLimitError,
  TIER_LIMIT_REACHED_CODE,
} from "../enforcement";
import {
  FREEMIUM_DEFAULT_SAVE_WORDS,
  FREEMIUM_DEFAULT_LIVED_SESSIONS,
} from "../../../config";

/** Point getGateContext's subscription lookup at a given active-sub doc (or null). */
function mockActiveSubscription(doc: any) {
  (getCollection as any).mockReturnValue({ findOne: jest.fn(async () => doc) });
}

// Only the cap-relevant fields are read by featureCapFor.
const learnerEnt: any = {
  saveWordsCap: null,
  liveSessionsCap: null,
  weeklyInsights: true,
  sessionHistory: true,
};
const readerEnt: any = {
  saveWordsCap: null,
  liveSessionsCap: null,
  weeklyInsights: false,
  sessionHistory: false,
};

describe("entitlement enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("free user (no active subscription)", () => {
    beforeEach(() => mockActiveSubscription(null));

    it("resolves free caps from config", async () => {
      expect(await getEffectiveCap("u1", "save_words")).toBe(
        FREEMIUM_DEFAULT_SAVE_WORDS
      );
      expect(await getEffectiveCap("u1", "live_sessions")).toBe(
        FREEMIUM_DEFAULT_LIVED_SESSIONS
      );
      expect(await getEffectiveCap("u1", "smart_review")).toBeNull(); // unlimited
      expect(await getEffectiveCap("u1", "weekly_insights")).toBe(0); // locked
    });

    it("locks weekly_insights and session_history", async () => {
      await expect(assertFeatureEnabled("u1", "weekly_insights")).rejects.toThrow(
        EntitlementLimitError
      );
      await expect(
        assertFeatureEnabled("u1", "session_history")
      ).rejects.toThrow(TIER_LIMIT_REACHED_CODE);
    });

    it("allows save_words below the cap and blocks at/over it", async () => {
      await expect(
        assertWithinCap("u1", "save_words", FREEMIUM_DEFAULT_SAVE_WORDS - 1)
      ).resolves.toBeUndefined();
      await expect(
        assertWithinCap("u1", "save_words", FREEMIUM_DEFAULT_SAVE_WORDS)
      ).rejects.toThrow(EntitlementLimitError);
    });
  });

  describe("paid Learner (full snapshot)", () => {
    beforeEach(() => mockActiveSubscription({ entitlements: learnerEnt }));

    it("unlimited save_words and unlocked insights/history", async () => {
      expect(await getEffectiveCap("u1", "save_words")).toBeNull();
      await expect(
        assertWithinCap("u1", "save_words", 10_000)
      ).resolves.toBeUndefined();
      await expect(
        assertFeatureEnabled("u1", "weekly_insights")
      ).resolves.toBeUndefined();
      await expect(
        assertFeatureEnabled("u1", "session_history")
      ).resolves.toBeUndefined();
    });
  });

  describe("paid Reader (insights/history off)", () => {
    beforeEach(() => mockActiveSubscription({ entitlements: readerEnt }));

    it("unlimited saves but insights still locked", async () => {
      await expect(
        assertWithinCap("u1", "save_words", 999_999)
      ).resolves.toBeUndefined();
      await expect(
        assertFeatureEnabled("u1", "weekly_insights")
      ).rejects.toThrow(EntitlementLimitError);
    });
  });

  describe("paid subscription missing its snapshot (legacy/data gap)", () => {
    beforeEach(() => mockActiveSubscription({ user_id: "u1" })); // active, no entitlements

    it("treats the user as unlimited so a payer is never wrongly gated", async () => {
      expect(await getEffectiveCap("u1", "save_words")).toBeNull();
      await expect(
        assertFeatureEnabled("u1", "weekly_insights")
      ).resolves.toBeUndefined();
    });
  });

  it("EntitlementLimitError carries the stable code + feature", () => {
    const err = new EntitlementLimitError("save_words", 200, 200);
    expect(err.code).toBe(TIER_LIMIT_REACHED_CODE);
    expect(err.feature).toBe("save_words");
    expect(err.message).toContain(TIER_LIMIT_REACHED_CODE);
  });
});
