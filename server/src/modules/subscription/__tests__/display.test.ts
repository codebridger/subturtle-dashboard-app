import { describe, it, expect } from "@jest/globals";
import { parseTierDisplay } from "../display";

describe("parseTierDisplay", () => {
  it("projects name (from product.name), tagline, bullets, budget label, highlight, badge", () => {
    const d = parseTierDisplay({
      name: "Learner",
      metadata: {
        tagline: "Make real progress.",
        ai_budget_label: "90 minutes of voice chat a month",
        feature_1: "Everything in Reader",
        feature_2: "90 minutes of voice chat a month",
        feature_3: "Weekly progress insights",
        highlight: "true",
        badge: "Most popular",
      },
    } as any);
    expect(d.name).toBe("Learner");
    expect(d.tagline).toBe("Make real progress.");
    expect(d.aiBudgetLabel).toBe("90 minutes of voice chat a month");
    expect(d.featureLabels).toEqual([
      "Everything in Reader",
      "90 minutes of voice chat a month",
      "Weekly progress insights",
    ]);
    expect(d.highlight).toBe(true);
    expect(d.badge).toBe("Most popular");
  });

  it("orders bullets by index and tolerates gaps + drops blanks", () => {
    const d = parseTierDisplay({
      name: "Coach",
      metadata: {
        feature_3: "third",
        feature_1: "first",
        feature_2: "   ", // blank -> dropped
        feature_5: "fifth", // gap at 4 -> tolerated
      },
    } as any);
    expect(d.featureLabels).toEqual(["first", "third", "fifth"]);
  });

  it("is lenient: missing copy => empty/false/null, never throws", () => {
    const d = parseTierDisplay({ name: "", metadata: {} } as any);
    expect(d.name).toBe("");
    expect(d.tagline).toBe("");
    expect(d.aiBudgetLabel).toBe("");
    expect(d.featureLabels).toEqual([]);
    expect(d.highlight).toBe(false);
    expect(d.badge).toBeNull();
  });

  it("treats a blank badge as null and a non-'true' highlight as false", () => {
    const d = parseTierDisplay({
      name: "Reader",
      metadata: { badge: "  ", highlight: "yes" },
    } as any);
    expect(d.badge).toBeNull();
    expect(d.highlight).toBe(false);
  });

  it("handles missing metadata object", () => {
    const d = parseTierDisplay({ name: "Reader" } as any);
    expect(d.featureLabels).toEqual([]);
    expect(d.badge).toBeNull();
  });
});
