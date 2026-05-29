/**
 * Idempotent Stripe pricing setup for the 3-tier ladder (Council 002).
 *
 * Run:  yarn setup:stripe   (uses STRIPE_SECRET_KEY from server/.env)
 * Re-run safely — products/prices are matched by metadata and reused.
 *
 * What it does:
 *   1. Archives any active product that does not carry one of our tier IDs
 *      (the retired Pro/Premium plan, stray test products).
 *   2. Creates/reuses the Starter (free), Learner, and Fluent products and
 *      writes the full metadata schema read by TierRegistryService:
 *      tierId, status, tagline, creditsAmount, subscriptionDays, trialDays,
 *      aiBudgetLabel, featureLabels (JSON), caps_<feature>.
 *   3. Creates/reuses ONE recurring GBP price per cadence for each paid tier,
 *      and archives every other active price on the product (the legacy USD/EUR
 *      matrix, stale prices). Stripe Adaptive Pricing converts the GBP base to
 *      the buyer's local currency at checkout — see the Adaptive Pricing toggle
 *      in Stripe Dashboard -> Settings -> Adaptive Pricing (enable in TEST+LIVE).
 *
 * Stripe is the source of truth at runtime: the server reads these products via
 * TierRegistryService. The seed values live in
 * src/modules/subscription/tier-seed.ts; this script just pushes them to Stripe.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
import Stripe from "stripe";
import { Cadence } from "../src/modules/subscription/tiers";
import {
  TIER_SEED_SPECS,
  TierSeedSpec,
  buildProductMetadata,
} from "../src/modules/subscription/tier-seed";

const KNOWN_TIER_IDS = TIER_SEED_SPECS.map((t) => t.tierId);
const CADENCES: Cadence[] = ["monthly", "annual"];
// Base currency only; Adaptive Pricing handles the rest at checkout.
const BASE_CURRENCY = "gbp";
const CADENCE_TO_INTERVAL: Record<Cadence, "month" | "year"> = {
  monthly: "month",
  annual: "year",
};

async function listAll<T extends { id: string }>(
  lister: (params: any) => Promise<Stripe.ApiList<T>>,
  params: Record<string, any> = {}
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;
  while (true) {
    const page = await lister({ limit: 100, ...params, starting_after });
    out.push(...page.data);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return out;
}

async function archiveLegacyProducts(stripe: Stripe): Promise<void> {
  const products = await listAll<Stripe.Product>(
    (p) => stripe.products.list(p),
    { active: true }
  );
  for (const product of products) {
    const tierId = product.metadata?.tierId;
    if (tierId && KNOWN_TIER_IDS.includes(tierId)) continue;
    console.log(`  archiving legacy product ${product.id} ("${product.name}")`);
    // Archiving the product retires it — its prices become unusable for new
    // checkouts. We deliberately do NOT archive the prices individually:
    // Stripe forbids archiving a product's default_price, and there's no need.
    await stripe.products.update(product.id, { active: false });
  }
}

async function upsertProduct(
  stripe: Stripe,
  spec: TierSeedSpec
): Promise<Stripe.Product> {
  const existing = await listAll<Stripe.Product>((p) =>
    stripe.products.list(p)
  );
  const metadata = buildProductMetadata(spec);
  const match = existing.find((p) => p.metadata?.tierId === spec.tierId);
  if (match) {
    const updated = await stripe.products.update(match.id, {
      name: spec.name,
      active: true,
      metadata,
    });
    console.log(`  reused product ${updated.id} (${spec.name})`);
    return updated;
  }
  const created = await stripe.products.create({ name: spec.name, metadata });
  console.log(`  created product ${created.id} (${spec.name})`);
  return created;
}

async function upsertPrice(
  stripe: Stripe,
  productId: string,
  spec: TierSeedSpec,
  cadence: Cadence
): Promise<string> {
  const amount = spec.prices![cadence];
  const interval = CADENCE_TO_INTERVAL[cadence];
  const existing = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });

  const exactMatch = existing.find(
    (p) =>
      p.active &&
      p.metadata?.tierId === spec.tierId &&
      p.metadata?.cadence === cadence &&
      p.currency === BASE_CURRENCY &&
      p.unit_amount === amount &&
      p.recurring?.interval === interval
  );
  if (exactMatch) {
    console.log(`    reused   ${cadence}/gbp -> ${exactMatch.id}`);
    return exactMatch.id;
  }

  // Stripe prices are immutable — a stale GBP price (different amount) is left
  // for archiveOtherPrices to retire below.
  const created = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: BASE_CURRENCY,
    recurring: { interval },
    nickname: `${spec.name} ${cadence} GBP`,
    metadata: { tierId: spec.tierId, cadence, currency: BASE_CURRENCY },
  });
  console.log(`    created  ${cadence}/gbp -> ${created.id}`);
  return created.id;
}

/**
 * Archive every active price on the product that isn't in `keep`. Clean-slate
 * cleanup: removes the legacy USD/EUR matrix and any stale GBP prices, leaving
 * only the current GBP-per-cadence set. A product's default_price can't be
 * archived, so it is first repointed at a kept price.
 */
async function archiveOtherPrices(
  stripe: Stripe,
  productId: string,
  keep: Set<string>
): Promise<void> {
  const existing = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });
  const product = await stripe.products.retrieve(productId);
  const defaultPriceId =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id;
  if (keep.size > 0 && defaultPriceId && !keep.has(defaultPriceId)) {
    await stripe.products.update(productId, {
      default_price: keep.values().next().value,
    });
  }
  for (const price of existing) {
    if (!price.active || keep.has(price.id)) continue;
    try {
      await stripe.prices.update(price.id, { active: false });
      console.log(`    archived ${price.currency} ${price.id}`);
    } catch (err: any) {
      console.warn(`    could not archive ${price.id}: ${err?.message || err}`);
    }
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set in server/.env");
  }
  const stripe = new Stripe(apiKey);
  const mode = apiKey.startsWith("sk_live") ? "LIVE" : "TEST";
  console.log(`Stripe pricing setup - ${mode} mode\n`);

  console.log("Archiving non-conforming products...");
  await archiveLegacyProducts(stripe);

  for (const spec of TIER_SEED_SPECS) {
    console.log(`\n${spec.name}:`);
    const product = await upsertProduct(stripe, spec);
    const keep = new Set<string>();
    if (spec.prices) {
      for (const cadence of CADENCES) {
        keep.add(await upsertPrice(stripe, product.id, spec, cadence));
      }
    } else {
      console.log("  (free tier — no prices)");
    }
    // Clean slate: archive the legacy USD/EUR matrix + any stale prices.
    await archiveOtherPrices(stripe, product.id, keep);
  }

  console.log(
    "\nDone. Tier products + GBP prices + metadata are live in Stripe; the" +
      " server reads them at runtime via TierRegistryService (no code paste" +
      " needed). Remember to enable Adaptive Pricing in the Dashboard (TEST+LIVE)."
  );
}

// Only run when invoked directly (yarn setup:stripe), so tests can import the
// pure helpers/seed without a Stripe key or network calls.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Stripe setup failed:", err);
      process.exit(1);
    });
}
