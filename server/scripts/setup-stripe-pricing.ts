/**
 * Idempotent Stripe pricing setup — Council 004 ladder (GBP base + Adaptive Pricing).
 *
 * Run:  yarn setup:stripe        (uses STRIPE_SECRET_KEY from server/.env)
 * Re-run safely — products/prices are matched by metadata and reused.
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
 *   5. Prints the resulting product + price ids for verification.
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
      "Unlimited text chat with the AI coach",
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

async function main(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in server/.env");
  }
  const mode = process.env.STRIPE_SECRET_KEY.startsWith("sk_live")
    ? "LIVE"
    : "TEST";
  console.log(`Stripe pricing setup (Council 004, GBP base) - ${mode} mode\n`);

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

  console.log(
    "\nReminder: enable Adaptive Pricing in the Stripe Dashboard and restrict who can edit product metadata (it now grants money)."
  );
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
