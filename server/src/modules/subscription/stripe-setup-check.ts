/**
 * Stripe setup self-check (runs once at server startup).
 *
 * The app's catalog lives in Stripe and is provisioned by
 * `scripts/setup-stripe-pricing.ts` (run manually). This module verifies, at
 * boot, that the pieces the app depends on are actually present — the three tier
 * products and the Customer Portal configuration — and LOGS a clear verdict so an
 * operator can tell from the server logs whether `yarn setup:stripe` still needs
 * to be run. It never throws: a Stripe/network hiccup must not break startup.
 *
 * It also captures the portal configuration's id (resolved here, once, instead of
 * per request) so the "Change plan" / portal flows can pin it. Each server
 * instance runs this at its own boot and logs its own result; a restart re-checks
 * and re-logs, which is also how a config created AFTER startup gets picked up.
 */
import Stripe from "stripe";
import { PaymentAdapterFactory } from "../gateway/adapters";
import { listTierEntitlements } from "./entitlements";

// Must match the marker written by scripts/setup-stripe-pricing.ts.
const PORTAL_CONFIG_MARKER = "setup-stripe-pricing";
const EXPECTED_TIERS = ["reader", "learner", "coach"];

let resolvedPortalConfigId: string | undefined;

/**
 * The Customer Portal configuration id resolved at startup, or undefined if it
 * wasn't found / hasn't been checked yet. Callers pass it to
 * billingPortal.sessions.create; when undefined, Stripe uses the account default.
 */
export function getManagedPortalConfigId(): string | undefined {
  return resolvedPortalConfigId;
}

/**
 * Check the Stripe catalog and log whether the manual setup script must be run.
 * Safe to call fire-and-forget at startup — all failures are swallowed + logged.
 */
export async function verifyStripeSetup(): Promise<void> {
  let stripe: Stripe;
  try {
    stripe = PaymentAdapterFactory.getStripeAdapter().stripe;
  } catch (e: any) {
    console.warn(
      `[stripe-setup] Stripe adapter unavailable; skipping setup check (${
        e?.message || e
      })`
    );
    return;
  }

  const missing: string[] = [];
  try {
    const tiers = await listTierEntitlements(stripe);
    const foundTierIds = new Set<string>(tiers.map((t) => t.entitlements.tierId));
    const missingTiers = EXPECTED_TIERS.filter((id) => !foundTierIds.has(id));
    if (missingTiers.length) {
      missing.push(`tier products [${missingTiers.join(", ")}]`);
    }

    const configs = await stripe.billingPortal.configurations.list({
      limit: 100,
    });
    const portal = configs.data.find(
      (c) => c.metadata?.managed_by === PORTAL_CONFIG_MARKER
    );
    resolvedPortalConfigId = portal?.id;
    if (!portal) missing.push("customer-portal config");
  } catch (e: any) {
    console.warn(
      `[stripe-setup] could not verify Stripe setup (${e?.message || e})`
    );
    return;
  }

  if (missing.length === 0) {
    console.log(
      `[stripe-setup] OK — tier products + portal config present (portal ${resolvedPortalConfigId}).`
    );
  } else {
    console.warn(
      `[stripe-setup] INCOMPLETE — missing: ${missing.join("; ")}.\n` +
        "[stripe-setup] Run `yarn setup:stripe` in server/ to provision it."
    );
  }
}
