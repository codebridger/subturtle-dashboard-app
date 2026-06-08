/**
 * Paid-tier DISPLAY copy — read from Stripe (ADR-004, single source of truth).
 *
 * Council 004 moved tier ENTITLEMENTS into Stripe product metadata
 * (entitlements.ts). This module does the same for the user-facing copy: the
 * card name, tagline, feature bullets, the AI/voice budget label, and the
 * "highlight / badge" flags now live ON the Stripe product too, so a marketing
 * edit is a Stripe edit — no code change, no deploy. The only tier left in code
 * is the free Starter (it has no Stripe product); see tiers.ts.
 *
 * Metadata contract (all keys optional — see "lenient" below):
 *   - product `name`        -> the card name (Stripe's native product name)
 *   - `tagline`             -> one-line subtitle
 *   - `feature_1`..`feature_N` -> card bullets, shown in ascending index order;
 *                              gaps are tolerated, blanks are dropped
 *   - `ai_budget_label`     -> the voice/AI budget label for the comparison table
 *   - `highlight`           -> "true" => emphasised card (border/ring)
 *   - `badge`               -> short ribbon text (e.g. "Most popular"); shown only
 *                              when non-empty
 *
 * Unlike entitlement parsing (which is LOUD — a bad number must never grant
 * money), display parsing is LENIENT: a missing/blank field falls back to an
 * empty value, never throws. The plans endpoint is anonymous and high-traffic, so
 * a copy typo must not 500 the page — it just renders a blank line that signals
 * "fix the Stripe metadata".
 */
import Stripe from "stripe";

/** The user-facing copy for one tier, projected from a Stripe product. */
export interface TierDisplay {
  /** Card name — the Stripe product's native `name` (e.g. "Reader"). */
  name: string;
  tagline: string;
  /** Card bullets in display order. Must not contain the word "credit". */
  featureLabels: string[];
  /** Plain-English voice/AI budget label for the comparison table. */
  aiBudgetLabel: string;
  /** Emphasise this card (border/ring) — was the hard-coded "learner". */
  highlight: boolean;
  /** Optional ribbon text (e.g. "Most popular"); null when unset. */
  badge: string | null;
}

/** Pull the ordered, non-blank `feature_<n>` bullets from product metadata. */
function readFeatureLabels(metadata: Record<string, string>): string[] {
  return Object.keys(metadata)
    .map((key) => {
      const match = /^feature_(\d+)$/.exec(key);
      if (!match) return null;
      const value = (metadata[key] || "").trim();
      return value ? { index: parseInt(match[1], 10), value } : null;
    })
    .filter((x): x is { index: number; value: string } => x !== null)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.value);
}

/**
 * Project one Stripe product to its display copy. Pure (no network) and lenient —
 * pass any `{ name, metadata }`, which makes the failure modes trivial to unit
 * test. The `name` comes from Stripe's native product name, the rest from
 * metadata. Never throws.
 */
export function parseTierDisplay(
  product: Pick<Stripe.Product, "name" | "metadata">
): TierDisplay {
  const metadata = product.metadata || {};
  const badge = (metadata.badge || "").trim();
  return {
    name: (product.name || "").trim(),
    tagline: (metadata.tagline || "").trim(),
    featureLabels: readFeatureLabels(metadata),
    aiBudgetLabel: (metadata.ai_budget_label || "").trim(),
    highlight: (metadata.highlight || "").trim().toLowerCase() === "true",
    badge: badge.length ? badge : null,
  };
}
