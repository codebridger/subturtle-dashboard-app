import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@modular-rest/server", () => ({ getCollection: jest.fn() }));

import { Types } from "mongoose";
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

// Valid 24-hex ObjectId — getGateContext wraps userId in Types.ObjectId().
const USER = "507f1f77bcf86cd799439011";

let findOneMock: jest.Mock<any>;
/** Point getGateContext's subscription lookup at a given active-sub doc (or null). */
function mockActiveSubscription(doc: any) {
  findOneMock = jest.fn<any>(async () => doc);
  (getCollection as any).mockReturnValue({ findOne: findOneMock });
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

    it("queries the subscription by ObjectId, not the raw string", async () => {
      await getEffectiveCap(USER, "save_words");
      const query = findOneMock.mock.calls[0][0] as any;
      expect(query.user_id).toBeInstanceOf(Types.ObjectId);
      expect(String(query.user_id)).toBe(USER);
    });

    it("resolves free caps from config", async () => {
      expect(await getEffectiveCap(USER, "save_words")).toBe(
        FREEMIUM_DEFAULT_SAVE_WORDS
      );
      expect(await getEffectiveCap(USER, "live_sessions")).toBe(
        FREEMIUM_DEFAULT_LIVED_SESSIONS
      );
      expect(await getEffectiveCap(USER, "smart_review")).toBeNull(); // unlimited
      expect(await getEffectiveCap(USER, "weekly_insights")).toBe(0); // locked
    });

    it("locks weekly_insights and session_history", async () => {
      await expect(assertFeatureEnabled(USER, "weekly_insights")).rejects.toThrow(
        EntitlementLimitError
      );
      await expect(
        assertFeatureEnabled(USER, "session_history")
      ).rejects.toThrow(TIER_LIMIT_REACHED_CODE);
    });

    it("allows save_words below the cap and blocks at/over it", async () => {
      await expect(
        assertWithinCap(USER, "save_words", FREEMIUM_DEFAULT_SAVE_WORDS - 1)
      ).resolves.toBeUndefined();
      await expect(
        assertWithinCap(USER, "save_words", FREEMIUM_DEFAULT_SAVE_WORDS)
      ).rejects.toThrow(EntitlementLimitError);
    });
  });

  describe("paid Learner (full snapshot)", () => {
    beforeEach(() => mockActiveSubscription({ entitlements: learnerEnt }));

    it("unlimited save_words and unlocked insights/history", async () => {
      expect(await getEffectiveCap(USER, "save_words")).toBeNull();
      await expect(
        assertWithinCap(USER, "save_words", 10_000)
      ).resolves.toBeUndefined();
      await expect(
        assertFeatureEnabled(USER, "weekly_insights")
      ).resolves.toBeUndefined();
      await expect(
        assertFeatureEnabled(USER, "session_history")
      ).resolves.toBeUndefined();
    });
  });

  describe("paid Reader (insights/history off)", () => {
    beforeEach(() => mockActiveSubscription({ entitlements: readerEnt }));

    it("unlimited saves but insights still locked", async () => {
      await expect(
        assertWithinCap(USER, "save_words", 999_999)
      ).resolves.toBeUndefined();
      await expect(
        assertFeatureEnabled(USER, "weekly_insights")
      ).rejects.toThrow(EntitlementLimitError);
    });
  });

  describe("paid subscription missing its snapshot (legacy/data gap)", () => {
    beforeEach(() => mockActiveSubscription({ user_id: USER })); // active, no entitlements

    it("treats the user as unlimited so a payer is never wrongly gated", async () => {
      expect(await getEffectiveCap(USER, "save_words")).toBeNull();
      await expect(
        assertFeatureEnabled(USER, "weekly_insights")
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
