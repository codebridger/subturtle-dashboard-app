import { describe, it, expect } from "@jest/globals";
import {
  TIERS,
  getTier,
  liveTiers,
  resolveTierByPriceId,
  resolveTierByProductId,
  featureCapFor,
  featureAllowedFor,
} from "../tiers";
import type { Entitlements } from "../entitlements";
import {
  FREEMIUM_DEFAULT_SAVE_WORDS,
  FREEMIUM_DEFAULT_LIVED_SESSIONS,
} from "../../../config";

/** Build a paid-tier Entitlements object with sensible defaults for gating tests. */
function ent(overrides: Partial<Entitlements> = {}): Entitlements {
  return {
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
    ...overrides,
  };
}

describe("tier registry", () => {
  describe("getTier", () => {
    it("returns the Council 004 tier definitions", () => {
      expect(getTier("starter").userFacingName).toBe("Starter");
      expect(getTier("reader").userFacingName).toBe("Reader");
      expect(getTier("learner").userFacingName).toBe("Learner");
      expect(getTier("coach").userFacingName).toBe("Coach");
    });
  });

  describe("liveTiers", () => {
    it("includes all four Council 004 tiers (none are dark)", () => {
      const ids = liveTiers().map((t) => t.id);
      expect(ids).toEqual(
        expect.arrayContaining(["starter", "reader", "learner", "coach"])
      );
    });
  });

  describe("resolveTierByPriceId / resolveTierByProductId (deprecated)", () => {
    it("returns null — price/product ids are resolved live from Stripe now", () => {
      // The registry no longer carries Stripe ids; these helpers are kept only
      // until the webhook stops importing them (removed in S8).
      expect(resolveTierByPriceId("price_anything")).toBeNull();
      expect(resolveTierByProductId("prod_anything")).toBeNull();
    });
  });

  describe("featureCapFor", () => {
    it("reads free Starter caps from config (null entitlements)", () => {
      expect(featureCapFor(null, "save_words")).toBe(FREEMIUM_DEFAULT_SAVE_WORDS);
      expect(featureCapFor(null, "live_sessions")).toBe(
        FREEMIUM_DEFAULT_LIVED_SESSIONS
      );
      expect(featureCapFor(null, "smart_review")).toBeNull(); // unlimited
      expect(featureCapFor(null, "weekly_insights")).toBe(0); // locked
      expect(featureCapFor(null, "session_history")).toBe(0); // locked
    });

    it("reads paid caps from resolved entitlements", () => {
      const reader = ent({ weeklyInsights: false, sessionHistory: false });
      expect(featureCapFor(reader, "save_words")).toBeNull(); // unlimited
      expect(featureCapFor(reader, "weekly_insights")).toBe(0); // locked on Reader
      expect(featureCapFor(reader, "session_history")).toBe(0);

      const learner = ent({ weeklyInsights: true, sessionHistory: true });
      expect(featureCapFor(learner, "weekly_insights")).toBeNull(); // unlocked
      expect(featureCapFor(learner, "session_history")).toBeNull();
    });
  });

  describe("featureAllowedFor", () => {
    it("locks weekly insights and session history on Starter", () => {
      expect(featureAllowedFor(null, "weekly_insights")).toBe(false);
      expect(featureAllowedFor(null, "session_history")).toBe(false);
    });

    it("allows capped-but-available features on Starter", () => {
      expect(featureAllowedFor(null, "save_words")).toBe(true);
      expect(featureAllowedFor(null, "smart_review")).toBe(true);
      expect(featureAllowedFor(null, "live_sessions")).toBe(true);
    });

    it("unlocks the gated features on a Learner/Coach entitlement", () => {
      const learner = ent({ weeklyInsights: true, sessionHistory: true });
      expect(featureAllowedFor(learner, "weekly_insights")).toBe(true);
      expect(featureAllowedFor(learner, "session_history")).toBe(true);
    });
  });

  describe("registry invariants", () => {
    it("never exposes the word 'credit' in user-facing copy", () => {
      for (const tier of Object.values(TIERS)) {
        const copy = [tier.tagline, tier.aiBudgetLabel, ...tier.featureLabels]
          .join(" ")
          .toLowerCase();
        expect(copy).not.toContain("credit");
      }
    });

    it("only the Learner tier offers a trial at launch", () => {
      expect(getTier("starter").trialDays).toBe(0);
      expect(getTier("reader").trialDays).toBe(0);
      expect(getTier("learner").trialDays).toBe(3);
      expect(getTier("coach").trialDays).toBe(0);
    });
  });
});
