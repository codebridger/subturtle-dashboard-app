import { describe, it, expect } from "@jest/globals";
import { STARTER_TIER, featureCapFor, featureAllowedFor } from "../tiers";
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
    textChatMaxMessages: null,
    liveSessionsCap: null,
    weeklyInsights: true,
    sessionHistory: true,
    durationDays: 30,
    trialDays: 3,
    ...overrides,
  };
}

describe("tiers (free Starter in code; paid tiers come from Stripe)", () => {
  describe("STARTER_TIER", () => {
    it("is the free tier: no price, and no 'credit' in user-facing copy", () => {
      expect(STARTER_TIER.id).toBe("starter");
      expect(STARTER_TIER.isPaid).toBe(false);
      expect(STARTER_TIER.amount).toBeNull();
      const copy = [
        STARTER_TIER.tagline,
        STARTER_TIER.aiBudgetLabel,
        ...STARTER_TIER.featureLabels,
      ]
        .join(" ")
        .toLowerCase();
      expect(copy).not.toContain("credit");
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
});
