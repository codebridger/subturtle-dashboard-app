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
 *
 * TEST vs LIVE:
 *   Stripe has no environment switch — test and live are separate data
 *   namespaces selected purely by the STRIPE_SECRET_KEY prefix:
 *     sk_test_… / rk_test_…  -> TEST
 *     sk_live_… / rk_live_…  -> LIVE   (rk_* are restricted keys)
 *   To target an environment, set the matching key in server/.env (or override
 *   it per run: `STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe`).
 *
 *   Because this script archives every non-conforming product/price, a run
 *   against the wrong account is destructive. LIVE runs are therefore refused
 *   unless explicitly confirmed with STRIPE_ALLOW_LIVE=1:
 *     STRIPE_ALLOW_LIVE=1 yarn setup:stripe
 *
 * DRY RUN:
 *   Preview every create/update/archive without writing anything by passing
 *   --dry-run (or DRY_RUN=1). A dry run is read-only, so it is allowed against
 *   LIVE without the confirmation flag — always dry-run a LIVE run first to see
 *   exactly what would be archived:
 *     DRY_RUN=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe
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
// Placeholder id used in --dry-run for a product/price that would be created,
// so downstream steps know there is nothing real to read or archive yet.
const DRY_NEW = "(would-create)";
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

async function archiveLegacyProducts(
  stripe: Stripe,
  dryRun: boolean
): Promise<void> {
  const products = await listAll<Stripe.Product>(
    (p) => stripe.products.list(p),
    { active: true }
  );
  for (const product of products) {
    const tierId = product.metadata?.tierId;
    if (tierId && KNOWN_TIER_IDS.includes(tierId)) continue;
    if (dryRun) {
      console.log(
        `  [dry-run] would archive legacy product ${product.id} ("${product.name}")`
      );
      continue;
    }
    console.log(`  archiving legacy product ${product.id} ("${product.name}")`);
    // Archiving the product retires it — its prices become unusable for new
    // checkouts. We deliberately do NOT archive the prices individually:
    // Stripe forbids archiving a product's default_price, and there's no need.
    await stripe.products.update(product.id, { active: false });
  }
}

async function upsertProduct(
  stripe: Stripe,
  spec: TierSeedSpec,
  dryRun: boolean
): Promise<Stripe.Product> {
  const existing = await listAll<Stripe.Product>((p) =>
    stripe.products.list(p)
  );
  const metadata = buildProductMetadata(spec);
  const match = existing.find((p) => p.metadata?.tierId === spec.tierId);
  if (match) {
    if (dryRun) {
      console.log(`  [dry-run] would update product ${match.id} (${spec.name})`);
      return match;
    }
    const updated = await stripe.products.update(match.id, {
      name: spec.name,
      active: true,
      metadata,
    });
    console.log(`  reused product ${updated.id} (${spec.name})`);
    return updated;
  }
  if (dryRun) {
    console.log(`  [dry-run] would create product (${spec.name})`);
    return { id: DRY_NEW, name: spec.name, metadata } as unknown as Stripe.Product;
  }
  const created = await stripe.products.create({ name: spec.name, metadata });
  console.log(`  created product ${created.id} (${spec.name})`);
  return created;
}

async function upsertPrice(
  stripe: Stripe,
  productId: string,
  spec: TierSeedSpec,
  cadence: Cadence,
  dryRun: boolean
): Promise<string> {
  const amount = spec.prices![cadence];
  const interval = CADENCE_TO_INTERVAL[cadence];
  // A would-be-created product (dry-run) has no existing prices to compare.
  const existing =
    productId === DRY_NEW
      ? []
      : await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
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

  if (dryRun) {
    console.log(`    [dry-run] would create ${cadence}/gbp (${amount} pence)`);
    return `${DRY_NEW}:${cadence}`;
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
  keep: Set<string>,
  dryRun: boolean
): Promise<void> {
  // A would-be-created product (dry-run) has no prices to archive yet.
  if (productId === DRY_NEW) return;

  const existing = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });
  const toArchive = existing.filter((p) => p.active && !keep.has(p.id));
  if (toArchive.length === 0) return;

  if (dryRun) {
    for (const price of toArchive) {
      console.log(`    [dry-run] would archive ${price.currency} ${price.id}`);
    }
    return;
  }

  // A product's default_price can't be archived — repoint it at a kept price first.
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
  for (const price of toArchive) {
    try {
      await stripe.prices.update(price.id, { active: false });
      console.log(`    archived ${price.currency} ${price.id}`);
    } catch (err: any) {
      console.warn(`    could not archive ${price.id}: ${err?.message || err}`);
    }
  }
}

/**
 * Resolve the Stripe environment a secret key targets, from its prefix.
 *
 * We match the `_live_` segment of BOTH standard (`sk_live_…`) and restricted
 * (`rk_live_…`) keys, rather than only `sk_live`. A naive `startsWith("sk_live")`
 * check would misclassify a restricted live key as TEST — dangerous here,
 * because the script would then archive LIVE products/prices while reporting
 * "TEST mode". Anything that isn't a recognised live key is treated as TEST.
 */
function resolveStripeMode(apiKey: string): "LIVE" | "TEST" {
  return /^(sk|rk)_live_/.test(apiKey) ? "LIVE" : "TEST";
}

async function main(): Promise<void> {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set in server/.env");
  }

  const dryRun =
    process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
  const mode = resolveStripeMode(apiKey);

  // Destructive-run guard: this script rewrites tier products and archives every
  // other product/price, so a run against the wrong account is hard to undo.
  // Require an explicit opt-in for LIVE so a stray live key can never trigger an
  // accidental production mutation. A --dry-run writes nothing, so it is exempt
  // (preview prod freely). Checked BEFORE any Stripe call.
  if (mode === "LIVE" && !dryRun && process.env.STRIPE_ALLOW_LIVE !== "1") {
    throw new Error(
      "Refusing to run against LIVE Stripe without confirmation.\n" +
        "This rewrites tier products/prices and archives everything else.\n" +
        "Preview first with a dry run (read-only, no flag needed):\n" +
        "  DRY_RUN=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe\n" +
        "Then, to actually mutate production, re-run with:\n" +
        "  STRIPE_ALLOW_LIVE=1 STRIPE_SECRET_KEY=sk_live_… yarn setup:stripe"
    );
  }

  const stripe = new Stripe(apiKey);
  console.log(
    `Stripe pricing setup - ${mode} mode${dryRun ? " (DRY RUN — no writes)" : ""}\n`
  );

  console.log(`${dryRun ? "[dry-run] " : ""}Archiving non-conforming products...`);
  await archiveLegacyProducts(stripe, dryRun);

  for (const spec of TIER_SEED_SPECS) {
    console.log(`\n${spec.name}:`);
    const product = await upsertProduct(stripe, spec, dryRun);
    const keep = new Set<string>();
    if (spec.prices) {
      for (const cadence of CADENCES) {
        keep.add(await upsertPrice(stripe, product.id, spec, cadence, dryRun));
      }
    } else {
      console.log("  (free tier — no prices)");
    }
    // Clean slate: archive the legacy USD/EUR matrix + any stale prices.
    await archiveOtherPrices(stripe, product.id, keep, dryRun);
  }

  if (dryRun) {
    console.log(
      "\nDry run complete — no changes made. Re-run without DRY_RUN (and with" +
        " STRIPE_ALLOW_LIVE=1 for LIVE) to apply."
    );
  } else {
    console.log(
      "\nDone. Tier products + GBP prices + metadata are live in Stripe; the" +
        " server reads them at runtime via TierRegistryService (no code paste" +
        " needed). Remember to enable Adaptive Pricing in the Dashboard (TEST+LIVE)."
    );
  }
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
