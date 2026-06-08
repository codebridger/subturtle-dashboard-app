/**
 * Idempotent Stripe pricing setup — Council 004 ladder (GBP base + Adaptive Pricing).
 *
 * Run:  yarn setup:stripe                 (uses STRIPE_SECRET_KEY from server/.env)
 *       yarn setup:stripe --dry-run       (preview every create/update/archive; writes nothing)
 *       yarn setup:stripe --confirm-live  (required to mutate a LIVE / sk_live account)
 * Re-run safely — products / prices / portal config are matched by metadata and
 * reused; a legacy product is archived only when it has NO active subscriptions.
 *
 * SOURCE OF TRUTH: ADR-004 makes Stripe product metadata the source of truth for
 * tier entitlements. This script WRITES that metadata (the S1 schema) onto each
 * product and validates it with the SAME parser the server uses, so a typo here
 * fails before it reaches Stripe. After payment the backend READS that metadata
 * to grant credits + voice minutes.
 *
 * What it does:
 *   1. Archives every active legacy product that is not a Council 004 tier or a
 *      voice top-up pack (retires the old Council 002 Learner / Fluent products
 *      and their per-currency prices).
 *   2. Creates/reuses the Reader, Learner, Coach products, each carrying full
 *      entitlement metadata (schema_version, credits_granted,
 *      voice_minutes_granted, caps, flags, trial_days, ...) AND display copy
 *      (tagline, feature_1..N bullets, ai_budget_label, highlight, badge). The
 *      product NAME is the card name. The backend reads ALL of this from Stripe
 *      at runtime — these literals only seed it.
 *   3. Creates/reuses ONE GBP monthly + ONE GBP annual recurring price per tier.
 *      Non-GBP customers see local currency via Stripe Adaptive Pricing (a
 *      Dashboard setting — see MANUAL STEPS); we settle in GBP. No per-currency
 *      prices.
 *   4. Creates/reuses the two one-shot GBP voice top-up packs (30 min, 120 min).
 *   5. Creates/reuses the Customer Portal configuration behind the "Change plan"
 *      flow — pinning the plan-switch ladder to the SAME tier products + GBP
 *      prices above (plus cancel / payment-method / invoice / customer features),
 *      so the portal can't offer a plan the catalog lacks and the flow no longer
 *      depends on the Dashboard default. The backend resolves it live by a
 *      `managed_by` metadata marker.
 *   6. Prints the resulting product + price (+ portal config) ids for verification.
 *
 * The backend resolves price ids LIVE from product metadata (checkout + the
 * plans endpoint look the product up by tier_id and read its active GBP price),
 * so you do NOT paste these ids into code — they are printed only to confirm the
 * result.
 *
 * Prices (GBP, monthly / annual):
 *   Reader £4.49 / £42.99 · Learner £10.99 / £104.99 · Coach £24.99 / £239.99
 *   Voice packs (one-shot): 30 min £4.49 · 120 min £15.99
 *
 * --- MANUAL STEPS (cannot be done through this script) ---
 *   • Enable Adaptive Pricing: Stripe Dashboard -> Settings -> Payments ->
 *     "Adaptive Pricing" -> On. Required for non-GBP customers to be shown their
 *     local currency at checkout while we settle in GBP.
 *   • RESTRICT who can edit product metadata. Under ADR-004 a metadata edit now
 *     GRANTS MONEY (credits / voice minutes) with no code review. Treat Stripe
 *     edit access as production access and review metadata changes like a deploy.
 *   • Customer Portal legal links: step 5 enables the portal's plan-switch
 *     feature, but Stripe still needs a privacy-policy + terms URL. If your
 *     account has no default Branding URLs, set STRIPE_PORTAL_PRIVACY_URL and
 *     STRIPE_PORTAL_TOS_URL in server/.env; otherwise the account defaults apply.
 *
 * Stripe prices are immutable: if a price with matching metadata exists but its
 * amount/interval differs, a fresh price is created and the stale one archived.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
import Stripe from "stripe";
import {
  ENTITLEMENT_SCHEMA_VERSION,
  parseTierMetadata,
} from "../src/modules/subscription/entitlements";
import { parseTierDisplay } from "../src/modules/subscription/display";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// CLI flags (forwarded by `yarn setup:stripe <flags>`):
//   --dry-run       read-only preview; writes nothing to Stripe.
//   --confirm-live  required guard before mutating a LIVE (sk_live) account.
const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM_LIVE = process.argv.includes("--confirm-live");

type Cadence = "monthly" | "annual";
const CADENCES: Cadence[] = ["monthly", "annual"];
const CADENCE_TO_INTERVAL: Record<Cadence, "month" | "year"> = {
  monthly: "month",
  annual: "year",
};
// GBP is the single settlement currency. Adaptive Pricing handles presentment.
const CURRENCY = "gbp";

interface TierSpec {
  tierId: string;
  name: string;
  tierRank: number;
  status: "live" | "dark";
  /** Internal credit budget per 30-day window — never shown to users. Covers the
   *  cheap features (translation, text-only Live, Smart Review); voice is metered
   *  separately in minutes on paid tiers. */
  creditsGranted: number;
  voiceMinutesGranted: number;
  saveWordsCap: string; // "unlimited" or a non-negative integer
  textChatCap: string; // monthly text-chat cap ("unlimited" or an integer)
  textChatMaxMessages: string; // per-chat message cap ("unlimited" or an integer)
  liveSessionsCap: string;
  weeklyInsights: boolean;
  sessionHistory: boolean;
  durationDays: number;
  trialDays: number;
  /** GBP amounts in minor units (pence). */
  prices: Record<Cadence, number>;
  // --- Display copy (the runtime source of truth is Stripe; these seed it). ---
  /** One-line card subtitle. */
  tagline: string;
  /** Card bullets — must not contain the word "credit". */
  featureLabels: string[];
  /** Voice/AI budget label for the comparison table. */
  aiBudgetLabel: string;
  /** Emphasise this card (border/ring) on the pricing page. */
  highlight: boolean;
  /** Ribbon text (e.g. "Most popular"); "" for none. */
  badge: string;
}

// Canonical Council 004 entitlements. Prices come from the council price table;
// the credit budgets are internal cost-accounting headroom (generous, since the
// cheap features are "unlimited" on paid tiers and only guarded by anti-abuse).
const TIER_SPECS: TierSpec[] = [
  {
    tierId: "reader",
    name: "Reader",
    tierRank: 1,
    status: "live",
    creditsGranted: 200_000_000,
    voiceMinutesGranted: 0, // overage packs only
    saveWordsCap: "unlimited",
    // Reader text chat capped (Council 004 follow-up 2026-05-30): 60 chats / month,
    // 60 messages / chat — a second upgrade lever toward Learner (unlimited text).
    textChatCap: "60",
    textChatMaxMessages: "60",
    liveSessionsCap: "unlimited",
    weeklyInsights: false,
    sessionHistory: false,
    durationDays: 30,
    trialDays: 0,
    prices: { monthly: 449, annual: 4299 },
    tagline: "Read, save, and chat with AI about every phrase you meet.",
    featureLabels: [
      "Save as many phrases as you want",
      "60 text chats per month",
      "Unlimited translations",
      "Unlimited Smart Review",
      "Voice top-ups when you want them",
    ],
    aiBudgetLabel: "voice top-ups any time",
    highlight: false,
    badge: "",
  },
  {
    tierId: "learner",
    name: "Learner",
    tierRank: 2,
    status: "live",
    creditsGranted: 300_000_000,
    voiceMinutesGranted: 90,
    saveWordsCap: "unlimited",
    textChatCap: "unlimited",
    textChatMaxMessages: "unlimited",
    liveSessionsCap: "unlimited",
    weeklyInsights: true,
    sessionHistory: true,
    durationDays: 30,
    trialDays: 3, // 3-day CC-required trial unlocks Learner
    prices: { monthly: 1099, annual: 10499 },
    tagline: "Make real progress — read with AI, then practice out loud.",
    featureLabels: [
      "Everything in Reader",
      "90 minutes of voice chat a month",
      "Weekly progress insights",
      "Full session history",
    ],
    aiBudgetLabel: "90 minutes of voice chat a month",
    highlight: true,
    badge: "Most popular",
  },
  {
    tierId: "coach",
    name: "Coach",
    tierRank: 3,
    status: "live",
    creditsGranted: 600_000_000,
    voiceMinutesGranted: 300,
    saveWordsCap: "unlimited",
    textChatCap: "unlimited",
    textChatMaxMessages: "unlimited",
    liveSessionsCap: "unlimited",
    weeklyInsights: true,
    sessionHistory: true,
    durationDays: 30,
    trialDays: 0,
    prices: { monthly: 2499, annual: 23999 },
    tagline: "Speak English every day with your AI coach.",
    featureLabels: [
      "Everything in Learner",
      "300 minutes of voice chat a month",
      "Top up voice minutes any time",
    ],
    aiBudgetLabel: "300 minutes of voice chat a month",
    highlight: false,
    badge: "",
  },
];

interface PackSpec {
  key: string;
  name: string;
  voiceMinutes: number;
  amountGbp: number; // minor units (pence)
  expiryDays: number;
}
// Voice-minute overage packs — one-shot charges that $inc the active
// subscription's voice_minutes_total (the metering engine is a separate Council
// 004 workstream; this script only creates the products/prices).
const PACK_SPECS: PackSpec[] = [
  { key: "topup_30", name: "Voice top-up — 30 minutes", voiceMinutes: 30, amountGbp: 449, expiryDays: 90 },
  { key: "topup_120", name: "Voice top-up — 120 minutes", voiceMinutes: 120, amountGbp: 1599, expiryDays: 90 },
];

const KNOWN_TIER_IDS = TIER_SPECS.map((t) => t.tierId);
const KNOWN_PACK_KEYS = PACK_SPECS.map((p) => p.key);
// Marker stamped on the Customer Portal configuration so this script can find &
// reuse it (idempotent) and the backend can resolve it live without pasted ids.
const PORTAL_CONFIG_MARKER = "setup-stripe-pricing";

/** Build + self-validate a tier product's entitlement + display metadata. */
function tierMetadata(spec: TierSpec): Stripe.MetadataParam {
  const metadata: Record<string, string> = {
    schema_version: ENTITLEMENT_SCHEMA_VERSION,
    tier_id: spec.tierId,
    tier_rank: String(spec.tierRank),
    status: spec.status,
    credits_granted: String(spec.creditsGranted),
    voice_minutes_granted: String(spec.voiceMinutesGranted),
    save_words_cap: spec.saveWordsCap,
    text_chat_cap: spec.textChatCap,
    text_chat_max_messages: spec.textChatMaxMessages,
    live_sessions_cap: spec.liveSessionsCap,
    weekly_insights: String(spec.weeklyInsights),
    session_history: String(spec.sessionHistory),
    duration_days: String(spec.durationDays),
    trial_days: String(spec.trialDays),
    // Display copy — Stripe is the RUNTIME source of truth (display.ts reads
    // these); the literals above/here only SEED it. Card name = product.name.
    tagline: spec.tagline,
    ai_budget_label: spec.aiBudgetLabel,
    highlight: String(spec.highlight),
    badge: spec.badge,
  };
  spec.featureLabels.forEach((label, i) => {
    metadata[`feature_${i + 1}`] = label;
  });

  // Validate with the server's OWN parsers — a typo fails here, not in Stripe.
  parseTierMetadata({ id: `(local:${spec.tierId})`, metadata }); // machine values (LOUD)
  const display = parseTierDisplay({ name: spec.name, metadata }); // display copy
  if (display.featureLabels.length !== spec.featureLabels.length) {
    throw new Error(`feature bullets did not round-trip for "${spec.tierId}"`);
  }
  const copy = [display.tagline, display.aiBudgetLabel, ...display.featureLabels]
    .join(" ")
    .toLowerCase();
  if (copy.includes("credit")) {
    throw new Error(`user-facing copy must not contain "credit" ("${spec.tierId}")`);
  }
  return metadata;
}

function packMetadata(spec: PackSpec): Stripe.MetadataParam {
  return {
    schema_version: ENTITLEMENT_SCHEMA_VERSION,
    kind: "voice_topup",
    pack_key: spec.key,
    voice_minutes: String(spec.voiceMinutes),
    pack_expiry_days: String(spec.expiryDays),
  };
}

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

// Live subscription statuses — a product with a subscription in any of these
// still has paying (or trialing) customers, so it must not be archived.
const LIVE_SUB_STATUSES = ["active", "trialing", "past_due", "unpaid"];

/**
 * True if any active/trialing/past_due/unpaid subscription references a price of
 * this product. Used to avoid "parking" a product customers are still on —
 * archiving wouldn't cancel their subs, but it blocks new checkouts and we'd
 * rather retire such products deliberately, not as a side effect of this script.
 */
async function hasActiveSubscriptions(productId: string): Promise<boolean> {
  const prices = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });
  for (const price of prices) {
    const subs = await stripe.subscriptions.list({
      price: price.id,
      status: "all",
      limit: 100,
    });
    if (subs.data.some((s) => LIVE_SUB_STATUSES.includes(s.status))) return true;
  }
  return false;
}

async function archiveLegacyProducts(): Promise<void> {
  const products = await listAll<Stripe.Product>(
    (p) => stripe.products.list(p),
    { active: true }
  );
  for (const product of products) {
    const md = product.metadata || {};
    const isCurrentTier = !!md.tier_id && KNOWN_TIER_IDS.includes(md.tier_id);
    const isCurrentPack =
      md.kind === "voice_topup" &&
      !!md.pack_key &&
      KNOWN_PACK_KEYS.includes(md.pack_key);
    if (isCurrentTier || isCurrentPack) continue;

    // Never PARK a product customers are still subscribed to: archiving blocks
    // NEW checkouts (existing subs keep billing), but we'd rather leave it active
    // and let an operator retire it deliberately once subscribers have moved off.
    if (await hasActiveSubscriptions(product.id)) {
      console.warn(
        `  skip archive ${product.id} ("${product.name}") — has active subscriptions`
      );
      continue;
    }

    console.log(`  archiving legacy product ${product.id} ("${product.name}")`);
    // Archiving the product retires it — its prices become unusable for new
    // checkouts. We deliberately do NOT archive prices individually: Stripe
    // forbids archiving a product's default_price, and there is no need.
    await stripe.products.update(product.id, { active: false });
  }
}

async function upsertTierProduct(spec: TierSpec): Promise<Stripe.Product> {
  const metadata = tierMetadata(spec);
  const existing = await listAll<Stripe.Product>((p) => stripe.products.list(p));
  const match = existing.find((p) => p.metadata?.tier_id === spec.tierId);
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

async function upsertTierPrice(
  productId: string,
  spec: TierSpec,
  cadence: Cadence
): Promise<string> {
  const amount = spec.prices[cadence];
  const interval = CADENCE_TO_INTERVAL[cadence];
  const existing = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });

  const exact = existing.find(
    (p) =>
      p.active &&
      p.currency === CURRENCY &&
      p.unit_amount === amount &&
      p.recurring?.interval === interval &&
      p.metadata?.tier_id === spec.tierId &&
      p.metadata?.cadence === cadence
  );
  if (exact) {
    console.log(`    reused   ${cadence} GBP -> ${exact.id}`);
    return exact.id;
  }

  // Stripe prices are immutable — archive any stale price in the same slot.
  for (const stale of existing) {
    if (
      stale.active &&
      stale.metadata?.tier_id === spec.tierId &&
      stale.metadata?.cadence === cadence
    ) {
      await stripe.prices.update(stale.id, { active: false });
      console.log(`    archived stale ${cadence} ${stale.id}`);
    }
  }

  const created = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: CURRENCY,
    recurring: { interval },
    nickname: `${spec.name} ${cadence} GBP`,
    metadata: { tier_id: spec.tierId, cadence },
  });
  console.log(`    created  ${cadence} GBP -> ${created.id}`);
  return created.id;
}

async function upsertPackProduct(spec: PackSpec): Promise<Stripe.Product> {
  const metadata = packMetadata(spec);
  const existing = await listAll<Stripe.Product>((p) => stripe.products.list(p));
  const match = existing.find(
    (p) => p.metadata?.kind === "voice_topup" && p.metadata?.pack_key === spec.key
  );
  if (match) {
    const updated = await stripe.products.update(match.id, {
      name: spec.name,
      active: true,
      metadata,
    });
    console.log(`  reused pack ${updated.id} (${spec.name})`);
    return updated;
  }
  const created = await stripe.products.create({ name: spec.name, metadata });
  console.log(`  created pack ${created.id} (${spec.name})`);
  return created;
}

async function upsertPackPrice(
  productId: string,
  spec: PackSpec
): Promise<string> {
  const existing = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
    product: productId,
  });
  const exact = existing.find(
    (p) =>
      p.active &&
      p.currency === CURRENCY &&
      p.unit_amount === spec.amountGbp &&
      !p.recurring && // one-shot
      p.metadata?.pack_key === spec.key
  );
  if (exact) {
    console.log(`    reused   pack price GBP -> ${exact.id}`);
    return exact.id;
  }
  for (const stale of existing) {
    if (stale.active && stale.metadata?.pack_key === spec.key) {
      await stripe.prices.update(stale.id, { active: false });
      console.log(`    archived stale pack price ${stale.id}`);
    }
  }
  const created = await stripe.prices.create({
    product: productId,
    unit_amount: spec.amountGbp,
    currency: CURRENCY,
    nickname: `${spec.name} GBP`,
    metadata: { kind: "voice_topup", pack_key: spec.key },
  });
  console.log(`    created  pack price GBP -> ${created.id}`);
  return created.id;
}

/**
 * Create/reuse the Customer Portal configuration that powers the "Change plan"
 * flow (service.createSubscriptionUpdatePortalUrl). It pins the plan-switch
 * ladder to the SAME tier products + GBP prices this script just built — so the
 * portal can never offer a tier/price the catalog doesn't have — and turns on the
 * cancel / payment-method / invoice / customer-update features. Idempotent:
 * matched and reused by the `managed_by` metadata marker. The backend resolves
 * this config LIVE by the same marker (no id pasted into code), mirroring how it
 * resolves prices.
 *
 * Stripe needs a privacy-policy + terms URL for the portal; it uses the account's
 * default Branding URLs unless STRIPE_PORTAL_PRIVACY_URL / STRIPE_PORTAL_TOS_URL
 * are set, in which case we send those explicitly.
 */
async function upsertPortalConfiguration(
  tierResult: Record<
    string,
    { productId: string; prices: Record<Cadence, string> }
  >
): Promise<string> {
  // The ladder customers can switch between in the portal: each tier product with
  // its monthly + annual GBP prices (Stripe caps this at 10 products).
  const products = TIER_SPECS.map((spec) => ({
    product: tierResult[spec.tierId].productId,
    prices: [
      tierResult[spec.tierId].prices.monthly,
      tierResult[spec.tierId].prices.annual,
    ],
  }));

  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    metadata: { managed_by: PORTAL_CONFIG_MARKER },
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products,
      },
      subscription_cancel: { enabled: true },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["address", "email", "tax_id"],
      },
    },
  };

  // Legal URLs are required only when the account has no default Branding URLs.
  const businessProfile: Stripe.BillingPortal.ConfigurationCreateParams.BusinessProfile =
    {};
  if (process.env.STRIPE_PORTAL_PRIVACY_URL)
    businessProfile.privacy_policy_url = process.env.STRIPE_PORTAL_PRIVACY_URL;
  if (process.env.STRIPE_PORTAL_TOS_URL)
    businessProfile.terms_of_service_url = process.env.STRIPE_PORTAL_TOS_URL;
  if (Object.keys(businessProfile).length)
    params.business_profile = businessProfile;

  const existing = await listAll<Stripe.BillingPortal.Configuration>((p) =>
    stripe.billingPortal.configurations.list(p)
  );
  const match = existing.find(
    (c) => c.metadata?.managed_by === PORTAL_CONFIG_MARKER
  );
  if (match) {
    const updated = await stripe.billingPortal.configurations.update(
      match.id,
      params as Stripe.BillingPortal.ConfigurationUpdateParams
    );
    console.log(`  reused portal configuration ${updated.id}`);
    return updated.id;
  }
  const created = await stripe.billingPortal.configurations.create(params);
  console.log(`  created portal configuration ${created.id}`);
  return created.id;
}

/**
 * Read-only preview (--dry-run): reports the create / reuse / archive each step
 * WOULD take, writing nothing. Lets you eyeball duplicates and — most importantly
 * — exactly which legacy products would be archived (and which are skipped because
 * they still have active subscriptions) before touching Stripe.
 */
async function printPlan(): Promise<void> {
  const allProducts = await listAll<Stripe.Product>((p) =>
    stripe.products.list(p)
  );

  console.log("Tier products + prices:");
  for (const spec of TIER_SPECS) {
    const match = allProducts.find((p) => p.metadata?.tier_id === spec.tierId);
    console.log(
      `  ${match ? "reuse " : "CREATE"} product ${spec.name}${
        match ? ` (${match.id})` : ""
      }`
    );
    if (match) {
      const prices = await listAll<Stripe.Price>((p) => stripe.prices.list(p), {
        product: match.id,
      });
      for (const cadence of CADENCES) {
        const interval = CADENCE_TO_INTERVAL[cadence];
        const exact = prices.find(
          (pr) =>
            pr.active &&
            pr.currency === CURRENCY &&
            pr.unit_amount === spec.prices[cadence] &&
            pr.recurring?.interval === interval &&
            pr.metadata?.cadence === cadence
        );
        console.log(
          `      ${exact ? "reuse " : "CREATE"} ${cadence} GBP price${
            exact ? ` (${exact.id})` : ""
          }`
        );
      }
    } else {
      console.log("      CREATE monthly + annual GBP prices");
    }
  }

  console.log("\nVoice top-up packs:");
  for (const spec of PACK_SPECS) {
    const match = allProducts.find(
      (p) =>
        p.metadata?.kind === "voice_topup" && p.metadata?.pack_key === spec.key
    );
    console.log(
      `  ${match ? "reuse " : "CREATE"} ${spec.name}${
        match ? ` (${match.id})` : ""
      }`
    );
  }

  console.log("\nLegacy archive:");
  let archiveCount = 0;
  for (const product of allProducts) {
    if (!product.active) continue;
    const md = product.metadata || {};
    const isCurrentTier = !!md.tier_id && KNOWN_TIER_IDS.includes(md.tier_id);
    const isCurrentPack =
      md.kind === "voice_topup" &&
      !!md.pack_key &&
      KNOWN_PACK_KEYS.includes(md.pack_key);
    if (isCurrentTier || isCurrentPack) continue;
    archiveCount++;
    if (await hasActiveSubscriptions(product.id)) {
      console.log(
        `  SKIP    ${product.id} ("${product.name}") — has active subscriptions`
      );
    } else {
      console.log(`  ARCHIVE ${product.id} ("${product.name}")`);
    }
  }
  if (archiveCount === 0) console.log("  (nothing to archive)");

  console.log("\nCustomer portal:");
  const configs = await listAll<Stripe.BillingPortal.Configuration>((p) =>
    stripe.billingPortal.configurations.list(p)
  );
  const portalMatch = configs.find(
    (c) => c.metadata?.managed_by === PORTAL_CONFIG_MARKER
  );
  console.log(
    `  ${portalMatch ? "reuse " : "CREATE"} portal configuration${
      portalMatch ? ` (${portalMatch.id})` : ""
    }`
  );
}

async function main(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in server/.env");
  }
  const mode = process.env.STRIPE_SECRET_KEY.startsWith("sk_live")
    ? "LIVE"
    : "TEST";

  // Don't let a stray `yarn setup:stripe` mutate PRODUCTION. LIVE writes require
  // an explicit --confirm-live; --dry-run is always safe (it writes nothing).
  if (mode === "LIVE" && !DRY_RUN && !CONFIRM_LIVE) {
    throw new Error(
      "Refusing to modify LIVE Stripe data. Re-run with --dry-run to preview, or --confirm-live to proceed."
    );
  }

  console.log(
    `Stripe pricing setup (Council 004, GBP base) - ${mode} mode${
      DRY_RUN ? " [DRY RUN]" : ""
    }\n`
  );

  if (DRY_RUN) {
    await printPlan();
    console.log("\nDry run complete — no changes written.");
    return;
  }

  console.log("Archiving legacy products...");
  await archiveLegacyProducts();

  const tierResult: Record<
    string,
    { productId: string; prices: Record<Cadence, string> }
  > = {};
  for (const spec of TIER_SPECS) {
    console.log(`\n${spec.name}:`);
    const product = await upsertTierProduct(spec);
    const prices = { monthly: "", annual: "" } as Record<Cadence, string>;
    for (const cadence of CADENCES) {
      prices[cadence] = await upsertTierPrice(product.id, spec, cadence);
    }
    tierResult[spec.tierId] = { productId: product.id, prices };
  }

  const packResult: Record<string, { productId: string; priceId: string }> = {};
  console.log(`\nVoice top-up packs:`);
  for (const spec of PACK_SPECS) {
    const product = await upsertPackProduct(spec);
    const priceId = await upsertPackPrice(product.id, spec);
    packResult[spec.key] = { productId: product.id, priceId };
  }

  console.log(`\nCustomer portal:`);
  let portalConfigId = "";
  try {
    portalConfigId = await upsertPortalConfiguration(tierResult);
  } catch (err: any) {
    // Non-fatal — the catalog above is already in place. The backend falls back to
    // the account's default portal configuration when ours is absent, so "Change
    // plan" still opens; it just isn't pinned to this ladder until this succeeds.
    console.warn(
      `  WARNING: could not set portal configuration: ${err?.message || err}`
    );
    console.warn(
      `  If this is a legal-URL error, set STRIPE_PORTAL_PRIVACY_URL + STRIPE_PORTAL_TOS_URL (or Dashboard Branding URLs) and re-run.`
    );
  }

  console.log(
    "\n\n=== Council 004 Stripe ids (verification only — backend resolves these live from metadata) ===\n"
  );
  for (const tierId of KNOWN_TIER_IDS) {
    const r = tierResult[tierId];
    console.log(`${tierId}:  product ${r.productId}`);
    console.log(`  monthly GBP: ${r.prices.monthly}`);
    console.log(`  annual  GBP: ${r.prices.annual}`);
  }
  for (const key of KNOWN_PACK_KEYS) {
    const r = packResult[key];
    console.log(`${key}:  product ${r.productId}  price ${r.priceId}`);
  }
  if (portalConfigId) {
    console.log(`portal configuration: ${portalConfigId}`);
  }

  // Everything above is provisioned via the API. These three are account-level
  // settings the API can't (or shouldn't) flip for you — surface them in the run
  // report so they're never silently forgotten.
  console.log("\n\n=== Manual steps (NOT done by this script) ===\n");
  console.log(
    "  1. Adaptive Pricing — Dashboard -> Settings -> Payments -> Adaptive Pricing -> On.\n" +
      "     Lets non-GBP customers see local currency at checkout while we settle in GBP."
  );
  console.log(
    "  2. Restrict who can edit product metadata — under ADR-004 a metadata edit GRANTS\n" +
      "     MONEY (credits / voice minutes). Treat Stripe edit access as production access."
  );
  if (portalConfigId) {
    console.log(
      "  3. Customer Portal — plan-switching configured automatically (id above). Revisit\n" +
        "     only to change branding or the privacy / terms URLs."
    );
  } else {
    console.log(
      "  3. Customer Portal — NOT configured (step 5 failed above). Set STRIPE_PORTAL_PRIVACY_URL\n" +
        "     + STRIPE_PORTAL_TOS_URL in server/.env and re-run, or enable subscription updates by\n" +
        "     hand under Dashboard -> Settings -> Billing -> Customer portal."
    );
  }
}

main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Stripe setup failed:", err);
    process.exit(1);
  });
