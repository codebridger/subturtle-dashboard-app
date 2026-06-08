/**
 * Public pricing plans — built from LIVE Stripe products (ADR-004).
 *
 * `getSubscriptionPlans` (the anonymous, high-traffic pricing endpoint) reads the
 * paid tiers entirely from Stripe: entitlements (entitlements.ts), display copy
 * (display.ts), and GBP prices. Nothing about a paid tier lives in code. The free
 * Starter tier has no Stripe product, so it alone comes from code (STARTER_TIER).
 *
 * Resilience without hard-coded plan data:
 *   - a short TTL cache (one Stripe read serves many page loads), and
 *   - a last-known-good snapshot (the most recent successful build — REAL Stripe
 *     data, not invented), served if a later Stripe read fails.
 * There is deliberately NO baked-in plan fallback: if Stripe has never succeeded
 * (cold start + outage), this throws and the frontend shows a "payment system
 * issue, check back soon" message rather than rendering stale code values.
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
import { STARTER_TIER, PublicTierPlan } from "./tiers";

// The public pricing page is high-traffic and changes rarely — a few minutes of
// staleness is fine, and product/price webhooks clear the cache on real edits.
const PLANS_CACHE_TTL_MS = 5 * 60 * 1000;

let plansCache: { value: PublicTierPlan[]; expiresAt: number } | null = null;
let lastKnownGood: PublicTierPlan[] | null = null;

/** "reader" -> "Reader". Last-resort label when a Stripe product has no name. */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The free Starter plan, projected from its code definition (no Stripe product). */
function starterPlan(): PublicTierPlan {
  const t = STARTER_TIER;
  return {
    id: t.id,
    status: t.status,
    name: t.userFacingName,
    tagline: t.tagline,
    isPaid: false,
    featureLabels: t.featureLabels,
    aiBudgetLabel: t.aiBudgetLabel,
    pricing: null,
    highlight: false,
    badge: null,
    trialDays: 0,
  };
}

async function buildFromStripe(stripe: Stripe): Promise<PublicTierPlan[]> {
  const products = await listTierEntitlements(stripe);
  products.sort((a, b) => a.entitlements.tierRank - b.entitlements.tierRank);

  const paid: PublicTierPlan[] = products.map(
    ({ entitlements, display, monthlyGbp, annualGbp }) => ({
      id: entitlements.tierId,
      status: entitlements.status,
      name: display.name || capitalize(entitlements.tierId),
      tagline: display.tagline,
      isPaid: true,
      featureLabels: display.featureLabels,
      aiBudgetLabel: display.aiBudgetLabel,
      pricing: {
        monthly: monthlyGbp != null ? { gbp: monthlyGbp } : {},
        annual: annualGbp != null ? { gbp: annualGbp } : {},
      },
      highlight: display.highlight,
      badge: display.badge,
      trialDays: entitlements.trialDays,
    })
  );

  // Starter (free) — from code, no Stripe product. Always first.
  return [starterPlan(), ...paid];
}

/**
 * Return the public plans, reading through the TTL cache and falling back to the
 * last-known-good snapshot (real Stripe data) if a later read fails. THROWS if
 * Stripe fails and there is no snapshot yet, so the caller can surface a
 * "payment system unavailable" state instead of inventing plan data.
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
    if (lastKnownGood) {
      console.error(
        `[subscription] plans: Stripe read failed, serving last-known-good: ${
          err?.message || err
        }`
      );
      return lastKnownGood;
    }
    console.error(
      `[subscription] plans: Stripe read failed with no snapshot, surfacing error: ${
        err?.message || err
      }`
    );
    throw err;
  }
}

/** Drop the cached plans so the next read rebuilds from Stripe. Called from the
 *  product/price Stripe webhook. Keeps the last-known-good snapshot (the safety
 *  net) intact. */
export function clearPlansCache(): void {
  plansCache = null;
}
