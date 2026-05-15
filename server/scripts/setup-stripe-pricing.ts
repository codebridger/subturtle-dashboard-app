/**
 * Idempotent Stripe pricing setup for the 3-tier ladder (Council 002).
 *
 * Run:  yarn setup:stripe   (uses STRIPE_SECRET_KEY from server/.env)
 * Re-run safely — existing products/prices are matched by metadata and reused.
 *
 * What it does:
 *   1. Archives any active legacy product (the retired Pro/Premium plan) that
 *      does not carry one of our tier IDs.
 *   2. Creates/reuses the Learner and Fluent products.
 *   3. Creates/reuses 12 prices — each tier x {monthly, annual} x {usd, eur, gbp}.
 *   4. Prints a ready-to-paste block of IDs for `tiers.ts`.
 *
 * Stripe prices are immutable: if a price with matching metadata exists but its
 * amount/interval differs, a fresh price is created and the stale one archived.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

type Cadence = "monthly" | "annual";
type Currency = "usd" | "eur" | "gbp";

interface TierSpec {
  tierId: string;
  name: string;
  creditsAmount: string; // internal credit budget per 30-day window
  subscriptionDays: string;
  /** Amounts in minor units (cents / pence). */
  prices: Record<Cadence, Record<Currency, number>>;
}

const TIER_SPECS: TierSpec[] = [
  {
    tierId: "learner",
    name: "Learner",
    creditsAmount: "300000000",
    subscriptionDays: "30",
    prices: {
      monthly: { usd: 999, eur: 999, gbp: 899 },
      annual: { usd: 9599, eur: 9599, gbp: 8599 },
    },
  },
  {
    tierId: "fluent",
    name: "Fluent",
    creditsAmount: "600000000",
    subscriptionDays: "30",
    prices: {
      monthly: { usd: 1699, eur: 1699, gbp: 1499 },
      annual: { usd: 15999, eur: 15999, gbp: 14399 },
    },
  },
];

const KNOWN_TIER_IDS = TIER_SPECS.map((t) => t.tierId);
const CADENCES: Cadence[] = ["monthly", "annual"];
const CURRENCIES: Currency[] = ["usd", "eur", "gbp"];
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

async function archiveLegacyProducts(): Promise<void> {
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

async function upsertProduct(spec: TierSpec): Promise<Stripe.Product> {
  const existing = await listAll<Stripe.Product>((p) =>
    stripe.products.list(p)
  );
  const metadata = {
    tierId: spec.tierId,
    creditsAmount: spec.creditsAmount,
    subscriptionDays: spec.subscriptionDays,
  };
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
  productId: string,
  spec: TierSpec,
  cadence: Cadence,
  currency: Currency
): Promise<string> {
  const amount = spec.prices[cadence][currency];
  const interval = CADENCE_TO_INTERVAL[cadence];
  const existing = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });

  const exactMatch = existing.find(
    (p) =>
      p.active &&
      p.metadata?.tierId === spec.tierId &&
      p.metadata?.cadence === cadence &&
      p.metadata?.currency === currency &&
      p.unit_amount === amount &&
      p.recurring?.interval === interval
  );
  if (exactMatch) {
    console.log(`    reused   ${cadence}/${currency} -> ${exactMatch.id}`);
    return exactMatch.id;
  }

  // Stripe prices are immutable — archive any stale price in the same slot.
  for (const stale of existing) {
    if (
      stale.active &&
      stale.metadata?.tierId === spec.tierId &&
      stale.metadata?.cadence === cadence &&
      stale.metadata?.currency === currency
    ) {
      await stripe.prices.update(stale.id, { active: false });
      console.log(`    archived stale ${cadence}/${currency} ${stale.id}`);
    }
  }

  const created = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency,
    recurring: { interval },
    nickname: `${spec.name} ${cadence} ${currency.toUpperCase()}`,
    metadata: { tierId: spec.tierId, cadence, currency },
  });
  console.log(`    created  ${cadence}/${currency} -> ${created.id}`);
  return created.id;
}

async function main(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in server/.env");
  }
  const mode = process.env.STRIPE_SECRET_KEY.startsWith("sk_live")
    ? "LIVE"
    : "TEST";
  console.log(`Stripe pricing setup - ${mode} mode\n`);

  console.log("Archiving legacy products...");
  await archiveLegacyProducts();

  const result: Record<
    string,
    { productId: string; prices: Record<Cadence, Record<Currency, string>> }
  > = {};

  for (const spec of TIER_SPECS) {
    console.log(`\n${spec.name}:`);
    const product = await upsertProduct(spec);
    const prices: Record<Cadence, Record<Currency, string>> = {
      monthly: {} as Record<Currency, string>,
      annual: {} as Record<Currency, string>,
    };
    for (const cadence of CADENCES) {
      for (const currency of CURRENCIES) {
        prices[cadence][currency] = await upsertPrice(
          product.id,
          spec,
          cadence,
          currency
        );
      }
    }
    result[spec.tierId] = { productId: product.id, prices };
  }

  console.log(
    "\n\n=== Paste these IDs into server/src/modules/subscription/tiers.ts ===\n"
  );
  for (const tierId of KNOWN_TIER_IDS) {
    const r = result[tierId];
    const m = r.prices.monthly;
    const a = r.prices.annual;
    console.log(`${tierId}:`);
    console.log(`  stripeProductId: "${r.productId}",`);
    console.log(`  prices: {`);
    console.log(
      `    monthly: { usd: "${m.usd}", eur: "${m.eur}", gbp: "${m.gbp}" },`
    );
    console.log(
      `    annual: { usd: "${a.usd}", eur: "${a.eur}", gbp: "${a.gbp}" },`
    );
    console.log(`  },\n`);
  }
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Stripe setup failed:", err);
    process.exit(1);
  });
