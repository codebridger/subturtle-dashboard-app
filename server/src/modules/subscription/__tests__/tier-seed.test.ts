import { describe, it, expect } from "@jest/globals";
import Stripe from "stripe";
import {
  TIER_SEED_SPECS,
  TierSeedSpec,
  buildProductMetadata,
} from "../tier-seed";
import { parseTierProduct } from "../tier-registry.service";

const CADENCE_TO_INTERVAL: Record<string, "month" | "year"> = {
  monthly: "month",
  annual: "year",
};

/** Build the fake Stripe GBP prices a seed spec would create. */
function pricesFor(spec: TierSeedSpec): Stripe.Price[] {
  if (!spec.prices) return [];
  return (["monthly", "annual"] as const).map(
    (cadence) =>
      ({
        id: `price_${spec.tierId}_${cadence}_gbp`,
        active: true,
        currency: "gbp",
        unit_amount: spec.prices![cadence],
        recurring: { interval: CADENCE_TO_INTERVAL[cadence] },
      } as unknown as Stripe.Price)
  );
}

function productFor(spec: TierSeedSpec): Stripe.Product {
  return {
    id: `prod_${spec.tierId}`,
    name: spec.name,
    active: true,
    metadata: buildProductMetadata(spec),
  } as unknown as Stripe.Product;
}

describe("tier seed", () => {
  it("covers exactly the three known tiers", () => {
    expect(TIER_SEED_SPECS.map((s) => s.tierId)).toEqual([
      "starter",
      "learner",
      "fluent",
    ]);
  });

  describe.each(TIER_SEED_SPECS.map((s) => [s.tierId, s] as const))(
    "%s round-trips seed -> metadata -> parseTierProduct",
    (_id, spec) => {
      const def = parseTierProduct(productFor(spec), pricesFor(spec));

      it("preserves identity and copy", () => {
        expect(def.id).toBe(spec.tierId);
        expect(def.status).toBe(spec.status);
        expect(def.userFacingName).toBe(spec.name);
        expect(def.tagline).toBe(spec.tagline);
        expect(def.aiBudgetLabel).toBe(spec.aiBudgetLabel);
        expect(def.featureLabels).toEqual(spec.featureLabels);
      });

      it("preserves budgets, caps and trial", () => {
        expect(def.creditBudget).toBe(Number(spec.creditsAmount));
        expect(def.durationDays).toBe(Number(spec.subscriptionDays));
        expect(def.trialDays).toBe(Number(spec.trialDays));
        expect(def.caps).toEqual(spec.caps);
        // Invariant the old static registry guaranteed.
        expect(def.caps.ai_credits).toBe(def.creditBudget);
      });

      it("derives isPaid + prices from the presence of Stripe prices", () => {
        if (spec.prices) {
          expect(def.isPaid).toBe(true);
          expect(def.amount!.monthly.gbp).toBe(spec.prices.monthly / 100);
          expect(def.amount!.annual.gbp).toBe(spec.prices.annual / 100);
          expect(def.prices!.monthly.gbp).toBe(
            `price_${spec.tierId}_monthly_gbp`
          );
        } else {
          expect(def.isPaid).toBe(false);
          expect(def.prices).toBeNull();
          expect(def.amount).toBeNull();
        }
      });
    }
  );

  it("never leaks the word 'credit' into user-facing copy", () => {
    for (const spec of TIER_SEED_SPECS) {
      const copy = [spec.tagline, spec.aiBudgetLabel, ...spec.featureLabels]
        .join(" ")
        .toLowerCase();
      expect(copy).not.toContain("credit");
    }
  });

  it("stays within Stripe metadata limits (50 keys, key<=40, value<=500)", () => {
    for (const spec of TIER_SEED_SPECS) {
      const md = buildProductMetadata(spec);
      const keys = Object.keys(md);
      expect(keys.length).toBeLessThanOrEqual(50);
      for (const key of keys) {
        expect(key.length).toBeLessThanOrEqual(40);
        expect(md[key].length).toBeLessThanOrEqual(500);
      }
    }
  });
});
