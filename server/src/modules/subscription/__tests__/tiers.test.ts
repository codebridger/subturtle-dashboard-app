import { describe, it, expect } from "@jest/globals";
import {
  TIERS,
  getTier,
  liveTiers,
  resolveTierByPriceId,
  resolveTierByProductId,
  tierAllowsFeature,
  featureCap,
} from "../tiers";

describe("tier registry", () => {
  describe("getTier", () => {
    it("returns the requested tier definition", () => {
      expect(getTier("starter").userFacingName).toBe("Starter");
      expect(getTier("learner").userFacingName).toBe("Learner");
      expect(getTier("fluent").userFacingName).toBe("Fluent");
    });
  });

  describe("liveTiers", () => {
    it("includes live tiers and excludes dark ones", () => {
      const ids = liveTiers().map((t) => t.id);
      expect(ids).toContain("starter");
      expect(ids).toContain("learner");
      expect(ids).not.toContain("fluent"); // Fluent ships dark
    });
  });

  describe("resolveTierByPriceId", () => {
    it("round-trips a known price ID to tier/cadence/currency", () => {
      const priceId = TIERS.learner.prices!.annual.gbp!;
      const resolved = resolveTierByPriceId(priceId);
      expect(resolved).not.toBeNull();
      expect(resolved!.tier.id).toBe("learner");
      expect(resolved!.cadence).toBe("annual");
      expect(resolved!.currency).toBe("gbp");
    });

    it("resolves a dark tier's price ID", () => {
      const priceId = TIERS.fluent.prices!.monthly.usd!;
      const resolved = resolveTierByPriceId(priceId);
      expect(resolved!.tier.id).toBe("fluent");
      expect(resolved!.cadence).toBe("monthly");
      expect(resolved!.currency).toBe("usd");
    });

    it("returns null for an unknown price ID", () => {
      expect(resolveTierByPriceId("price_does_not_exist")).toBeNull();
    });
  });

  describe("resolveTierByProductId", () => {
    it("resolves known product IDs", () => {
      expect(resolveTierByProductId(TIERS.learner.stripeProductId!)!.id).toBe(
        "learner"
      );
      expect(resolveTierByProductId(TIERS.fluent.stripeProductId!)!.id).toBe(
        "fluent"
      );
    });

    it("returns null for an unknown product ID", () => {
      expect(resolveTierByProductId("prod_does_not_exist")).toBeNull();
    });

    it("has no Stripe product for the free Starter tier", () => {
      expect(TIERS.starter.stripeProductId).toBeNull();
    });
  });

  describe("tierAllowsFeature", () => {
    it("locks weekly insights and session history on Starter", () => {
      expect(tierAllowsFeature("starter", "weekly_insights")).toBe(false);
      expect(tierAllowsFeature("starter", "session_history")).toBe(false);
    });

    it("allows capped-but-available features on Starter", () => {
      expect(tierAllowsFeature("starter", "save_words")).toBe(true);
      expect(tierAllowsFeature("starter", "ai_credits")).toBe(true);
      expect(tierAllowsFeature("starter", "smart_review")).toBe(true);
      expect(tierAllowsFeature("starter", "live_conversations")).toBe(true);
    });

    it("unlocks the gated features on Learner", () => {
      expect(tierAllowsFeature("learner", "weekly_insights")).toBe(true);
      expect(tierAllowsFeature("learner", "session_history")).toBe(true);
    });
  });

  describe("featureCap", () => {
    it("returns the hard cap, 0 for locked, null for unlimited", () => {
      expect(featureCap("starter", "save_words")).toBe(200);
      expect(featureCap("starter", "weekly_insights")).toBe(0);
      expect(featureCap("learner", "save_words")).toBeNull();
    });

    it("exposes each tier's AI credit budget", () => {
      expect(featureCap("starter", "ai_credits")).toBe(5_000_000);
      expect(featureCap("learner", "ai_credits")).toBe(300_000_000);
      expect(featureCap("fluent", "ai_credits")).toBe(600_000_000);
    });
  });

  describe("registry invariants", () => {
    it("keeps caps.ai_credits in sync with creditBudget", () => {
      for (const tier of Object.values(TIERS)) {
        expect(tier.caps.ai_credits).toBe(tier.creditBudget);
      }
    });

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
      expect(getTier("learner").trialDays).toBe(3);
      expect(getTier("fluent").trialDays).toBe(0);
    });
  });
});
