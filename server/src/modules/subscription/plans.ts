/**
 * Public pricing plans — built from LIVE Stripe products (ADR-004).
 *
 * `getSubscriptionPlans` (the anonymous, high-traffic pricing endpoint) reads the
 * tier products from Stripe and combines each product's parsed entitlements with
 * the code-side DISPLAY COPY keyed by tier_id (so the user-facing labels — which
 * must never contain the word "credit" — stay under code review). The free
 * Starter tier has no Stripe product; it comes from code.
 *
 * Because the page now depends on Stripe at read time, it is wrapped in:
 *   - a short TTL cache (one Stripe read serves many page loads),
 *   - a last-known-good snapshot (the most recent successful build), and
 *   - a baked-in code fallback (the registry projection),
 * so the page NEVER renders an empty list when Stripe is slow or down.
 *
 * The cache is invalidated on product/price webhooks (clearPlansCache, called
 * from the Stripe webhook handler) so a Stripe edit shows up without waiting for
 * the TTL.
 *
 * Lives in its own module (not functions.ts) so the Stripe webhook can import
 * clearPlansCache without creating a functions.ts <-> gateway import cycle.
 */
import Stripe from "stripe";
import { listTierEntitlements } from "./entitlements";
import { TIERS, PublicTierPlan } from "./tiers";

// The public pricing page is high-traffic and changes rarely — a few minutes of
// staleness is fine, and product/price webhooks clear the cache on real edits.
const PLANS_CACHE_TTL_MS = 5 * 60 * 1000;

let plansCache: { value: PublicTierPlan[]; expiresAt: number } | null = null;
let lastKnownGood: PublicTierPlan[] | null = null;

/** Project one registry tier (code display copy + GBP amounts) to a plan. */
function planFromRegistry(id: keyof typeof TIERS): PublicTierPlan {
  const t = TIERS[id];
  return {
    id: t.id,
    status: t.status,
    name: t.userFacingName,
    tagline: t.tagline,
    isPaid: t.isPaid,
    featureLabels: t.featureLabels,
    aiBudgetLabel: t.aiBudgetLabel,
    pricing: t.amount,
  };
}

/**
 * Baked-in fallback: the registry projection of all tiers. Used only when Stripe
 * is unreachable and there is no last-known-good yet — guarantees a non-empty
 * pricing page.
 */
export function getFallbackPlans(): PublicTierPlan[] {
  return (Object.keys(TIERS) as (keyof typeof TIERS)[]).map(planFromRegistry);
}

async function buildFromStripe(stripe: Stripe): Promise<PublicTierPlan[]> {
  const products = await listTierEntitlements(stripe);
  products.sort((a, b) => a.entitlements.tierRank - b.entitlements.tierRank);

  const paid: PublicTierPlan[] = [];
  for (const { entitlements, monthlyGbp, annualGbp } of products) {
    const display = TIERS[entitlements.tierId];
    if (!display) continue; // no code display copy for this tier_id -> skip
    paid.push({
      id: entitlements.tierId,
      status: entitlements.status,
      name: display.userFacingName,
      tagline: display.tagline,
      isPaid: true,
      featureLabels: display.featureLabels,
      aiBudgetLabel: display.aiBudgetLabel,
      pricing: {
        monthly: monthlyGbp != null ? { gbp: monthlyGbp } : {},
        annual: annualGbp != null ? { gbp: annualGbp } : {},
      },
    });
  }

  // Starter (free) — from code, no Stripe product.
  return [planFromRegistry("starter"), ...paid];
}

/**
 * Return the public plans, reading through the TTL cache and falling back to the
 * last-known-good snapshot (then the baked-in code fallback) if Stripe fails.
 * Never returns an empty list.
 */
export async function getSubscriptionPlansCached(
  stripe: Stripe
): Promise<PublicTierPlan[]> {
  if (plansCache && plansCache.expiresAt > Date.now()) {
    return plansCache.value;
  }
  try {
    const plans = await buildFromStripe(stripe);
    plansCache = { value: plans, expiresAt: Date.now() + PLANS_CACHE_TTL_MS };
    lastKnownGood = plans;
    return plans;
  } catch (err: any) {
    console.error(
      `[subscription] plans: Stripe read failed, serving last-known-good/fallback: ${
        err?.message || err
      }`
    );
    return lastKnownGood ?? getFallbackPlans();
  }
}

/** Drop the cached plans so the next read rebuilds from Stripe. Called from the
 *  product/price Stripe webhook. */
export function clearPlansCache(): void {
  plansCache = null;
}
