/**
 * Tier entitlements — Stripe product metadata is the source of truth (ADR-004).
 *
 * Each paid tier is a Stripe product. Its metadata (string-only key/values)
 * carries every entitlement the backend grants after payment: credits, voice
 * minutes, feature caps, feature flags, tier identity, and trial length. This
 * module is the ONLY place that reads and validates that metadata.
 *
 * Design rules from ADR-004:
 *   - Validation is LOUD. A missing key, a bad number, an out-of-range value, or
 *     an unknown `schema_version` throws `EntitlementParseError`. We never guess
 *     a value, and never silently fall back to a default — the webhook turns a
 *     throw into a refusal (let Stripe retry + alert), per the "fail safe =
 *     refuse, not guess" rule.
 *   - `tier_id` is validated against a fixed code-controlled list. It is a
 *     database key on the subscription document, so it must never be free text.
 *   - `credits_granted` and `voice_minutes_granted` directly grant money-costing
 *     value, so they carry hard min/max bounds — a typo (missing or extra zero)
 *     is rejected, not granted.
 *   - This module validates MACHINE values only (the money-granting ones), and is
 *     LOUD on error. User-facing DISPLAY copy (name, tagline, feature bullets,
 *     highlight/badge) also lives on the Stripe product but is parsed leniently
 *     and separately in `display.ts` — a copy typo must never block a grant, and a
 *     bad number must never be shown as harmless.
 *
 * Metadata is read through a short-TTL cache to keep Stripe calls cheap and
 * within rate limits; the cache is invalidated on the `product.updated` /
 * `price.updated` webhook (see the plans endpoint) so edits show up promptly.
 */
import Stripe from "stripe";
import { z } from "zod";
import { parseTierDisplay, TierDisplay } from "./display";

/**
 * Metadata schema version. Bump when the key set or their meaning changes; the
 * parser rejects any product whose `schema_version` is not this exact value, so
 * a half-migrated Stripe account fails loud instead of granting stale shapes.
 */
export const ENTITLEMENT_SCHEMA_VERSION = "1";

/**
 * The fixed, code-controlled set of paid tier ids. Starter is the free tier and
 * has NO Stripe product (its limits live in `config.ts`), so it is not here.
 */
export const PAID_TIER_IDS = ["reader", "learner", "coach"] as const;
export type PaidTierId = (typeof PAID_TIER_IDS)[number];

export type EntitlementStatus = "live" | "dark";

// Hard bounds for the money-granting fields. Anything outside these is treated
// as a metadata error, not an unusual-but-valid value.
export const CREDITS_GRANTED_MIN = 1_000_000; //   1M credits  ($0.01 of spend)
export const CREDITS_GRANTED_MAX = 100_000_000_000; // 100B credits ($1000)
export const VOICE_MINUTES_GRANTED_MIN = 0;
export const VOICE_MINUTES_GRANTED_MAX = 100_000; // 100k minutes / window
export const CAP_MAX = 10_000_000; // sane ceiling for any per-window feature cap

/** How long a parsed product stays cached before we re-read it from Stripe. */
export const ENTITLEMENT_CACHE_TTL_MS = 60_000;

/**
 * The validated, typed entitlements for one paid tier — the shape the webhook,
 * the plans endpoint, and the gating helpers consume. `null` on a cap means
 * "unlimited"; `0` means "locked"; a positive number is a hard per-window cap.
 */
export interface Entitlements {
  schemaVersion: string;
  tierId: PaidTierId;
  tierRank: number;
  status: EntitlementStatus;
  creditsGranted: number;
  voiceMinutesGranted: number;
  saveWordsCap: number | null;
  textChatCap: number | null;
  textChatMaxMessages: number | null;
  liveSessionsCap: number | null;
  weeklyInsights: boolean;
  sessionHistory: boolean;
  durationDays: number;
  trialDays: number;
}

/** Thrown for any invalid / missing / out-of-range entitlement metadata. */
export class EntitlementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementParseError";
  }
}

// --- string -> typed field coercers (Stripe metadata values are all strings) ---

/** A non-negative integer string, bounded to [min, max]. */
const zIntInRange = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => /^\d+$/.test(s), { message: "must be a non-negative integer" })
    .transform((s) => parseInt(s, 10))
    .refine((n) => n >= min && n <= max, {
      message: `must be in range [${min}, ${max}]`,
    });

/** Exactly "true" or "false" (case/space-insensitive) — nothing else. */
const zBool = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => s === "true" || s === "false", {
    message: 'must be exactly "true" or "false"',
  })
  .transform((s) => s === "true");

/** "unlimited" -> null, otherwise a non-negative integer capped at CAP_MAX. */
const zCap = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => s === "unlimited" || /^\d+$/.test(s), {
    message: 'must be "unlimited" or a non-negative integer',
  })
  .transform((s) => (s === "unlimited" ? null : parseInt(s, 10)))
  .refine((n) => n === null || n <= CAP_MAX, {
    message: `cap exceeds max ${CAP_MAX}`,
  });

/**
 * The metadata contract. Keys are snake_case to match what an engineer types in
 * the Stripe dashboard. Missing keys surface as zod "Required" errors, so the
 * parser already covers the "missing key" failure mode.
 */
const entitlementMetadataSchema = z.object({
  schema_version: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s === ENTITLEMENT_SCHEMA_VERSION, {
      message: `unknown schema_version (expected "${ENTITLEMENT_SCHEMA_VERSION}")`,
    }),
  tier_id: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => (PAID_TIER_IDS as readonly string[]).includes(s), {
      message: `unknown tier_id (expected one of ${PAID_TIER_IDS.join(", ")})`,
    }),
  tier_rank: zIntInRange(0, 100),
  status: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => s === "live" || s === "dark", {
      message: 'must be "live" or "dark"',
    }),
  credits_granted: zIntInRange(CREDITS_GRANTED_MIN, CREDITS_GRANTED_MAX),
  voice_minutes_granted: zIntInRange(
    VOICE_MINUTES_GRANTED_MIN,
    VOICE_MINUTES_GRANTED_MAX
  ),
  save_words_cap: zCap,
  text_chat_cap: zCap,
  // Optional for back-compat: products seeded before this field default to
  // "unlimited" (null) until the next `yarn setup:stripe` run re-seeds them.
  text_chat_max_messages: zCap.optional(),
  live_sessions_cap: zCap,
  weekly_insights: zBool,
  session_history: zBool,
  duration_days: zIntInRange(1, 366),
  trial_days: zIntInRange(0, 90),
});

/**
 * Validate and parse one Stripe product's metadata into typed `Entitlements`.
 * Pure (no network) — pass any `{ id, metadata }`, which makes it trivial to
 * unit-test the failure modes. Throws `EntitlementParseError` on any problem,
 * with a message naming the product and the offending key(s).
 */
export function parseTierMetadata(
  product: Pick<Stripe.Product, "id" | "metadata">
): Entitlements {
  const result = entitlementMetadataSchema.safeParse(product.metadata || {});
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new EntitlementParseError(
      `Invalid entitlement metadata on Stripe product ${product.id}: ${issues}`
    );
  }
  const d = result.data;
  return {
    schemaVersion: d.schema_version,
    tierId: d.tier_id as PaidTierId,
    tierRank: d.tier_rank,
    status: d.status as EntitlementStatus,
    creditsGranted: d.credits_granted,
    voiceMinutesGranted: d.voice_minutes_granted,
    saveWordsCap: d.save_words_cap,
    textChatCap: d.text_chat_cap,
    textChatMaxMessages: d.text_chat_max_messages ?? null,
    liveSessionsCap: d.live_sessions_cap,
    weeklyInsights: d.weekly_insights,
    sessionHistory: d.session_history,
    durationDays: d.duration_days,
    trialDays: d.trial_days,
  };
}

// --- short-TTL resolver cache (keyed by Stripe product id) ---

interface CacheEntry {
  value: Entitlements;
  expiresAt: number;
}
const entitlementCache = new Map<string, CacheEntry>();
// Prices are immutable in Stripe and bound to one product, so a price->product
// mapping is stable and can be cached without a TTL (saves a price fetch on warm
// lookups). Cleared together with the entitlement cache.
const priceToProduct = new Map<string, string>();
// The product NAME (the user-facing tier label, e.g. "Learner") captured whenever
// we fetch a product, so the webhook can stamp the subscription label from Stripe
// (the source of truth) without a second round-trip. Keyed by product id.
const productNameCache = new Map<string, string>();

function getCachedByProduct(productId: string): Entitlements | null {
  const entry = entitlementCache.get(productId);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (entry) entitlementCache.delete(productId);
  return null;
}

/**
 * Drop cached entitlements so the next read re-fetches from Stripe. Called from
 * the `product.updated` / `price.updated` webhook so a Stripe edit shows up
 * without waiting for the TTL. Pass a product id to clear one, or nothing to
 * clear all (also clears the price->product map).
 */
export function clearEntitlementsCache(productId?: string): void {
  if (productId) {
    entitlementCache.delete(productId);
    productNameCache.delete(productId);
  } else {
    entitlementCache.clear();
    priceToProduct.clear();
    productNameCache.clear();
  }
}

/**
 * The cached Stripe product NAME for an already-resolved tier (the user-facing
 * label, e.g. "Learner"). Returns null if the product has not been resolved this
 * TTL window — the caller falls back. Pass the same priceId/productId previously
 * passed to `resolveEntitlements`; no Stripe call is made here.
 */
export function cachedTierName(opts: {
  priceId?: string;
  productId?: string;
}): string | null {
  let productId = opts.productId;
  if (!productId && opts.priceId) productId = priceToProduct.get(opts.priceId);
  if (!productId) return null;
  return productNameCache.get(productId) ?? null;
}

/**
 * Resolve typed entitlements for a Stripe price id or product id, reading
 * through the short-TTL cache. Throws `EntitlementParseError` if the metadata is
 * missing/invalid (the caller decides what "refuse" means for its path).
 */
export async function resolveEntitlements(
  stripe: Stripe,
  opts: { priceId?: string; productId?: string }
): Promise<Entitlements> {
  if (!opts.priceId && !opts.productId) {
    throw new EntitlementParseError(
      "resolveEntitlements requires a priceId or productId"
    );
  }

  // Resolve the product id first so the cache lookup and invalidation are always
  // product-keyed (matching the product.updated webhook).
  let productId = opts.productId;
  if (!productId && opts.priceId) {
    productId = priceToProduct.get(opts.priceId);
  }
  if (productId) {
    const cached = getCachedByProduct(productId);
    if (cached) return cached;
  }

  let product: Stripe.Product;
  if (!productId && opts.priceId) {
    const price = await stripe.prices.retrieve(opts.priceId, {
      expand: ["product"],
    });
    const p = price.product;
    if (typeof p === "string" || (p as Stripe.DeletedProduct).deleted) {
      throw new EntitlementParseError(
        `Stripe price ${opts.priceId} has no usable product`
      );
    }
    product = p as Stripe.Product;
    priceToProduct.set(opts.priceId, product.id);
    productNameCache.set(product.id, (product.name || "").trim());
    const cached = getCachedByProduct(product.id);
    if (cached) return cached;
  } else {
    product = await stripe.products.retrieve(productId as string);
    productNameCache.set(product.id, (product.name || "").trim());
  }

  const entitlements = parseTierMetadata(product);
  entitlementCache.set(product.id, {
    value: entitlements,
    expiresAt: Date.now() + ENTITLEMENT_CACHE_TTL_MS,
  });
  return entitlements;
}

/** One active tier product with its parsed entitlements, display copy, and GBP prices. */
export interface TierProductPlan {
  entitlements: Entitlements;
  /** User-facing copy (name, tagline, bullets, highlight/badge) from Stripe. */
  display: TierDisplay;
  /** Display amounts in major GBP units (e.g. 10.99), or null if not found. */
  monthlyGbp: number | null;
  annualGbp: number | null;
}

/**
 * List every active tier product (those carrying `tier_id` metadata) with its
 * parsed entitlements and GBP monthly/annual prices. Voice top-up packs and any
 * non-tier products are skipped.
 *
 * Unlike the webhook path, a product whose metadata FAILS to parse is skipped
 * (with a warning) rather than thrown: one malformed product must not break the
 * anonymous, high-traffic pricing page. The plans endpoint's last-known-good
 * fallback covers a total Stripe outage.
 */
export async function listTierEntitlements(
  stripe: Stripe
): Promise<TierProductPlan[]> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const out: TierProductPlan[] = [];
  for (const product of products.data) {
    if (!product.metadata?.tier_id) continue; // skip packs / non-tier products
    let entitlements: Entitlements;
    try {
      entitlements = parseTierMetadata(product);
    } catch (err: any) {
      console.warn(
        `[entitlements] skipping product ${product.id} on plans list: ${
          err?.message || err
        }`
      );
      continue;
    }
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });
    let monthlyGbp: number | null = null;
    let annualGbp: number | null = null;
    for (const price of prices.data) {
      if (price.currency !== "gbp" || !price.recurring) continue;
      const amount = price.unit_amount != null ? price.unit_amount / 100 : null;
      if (price.recurring.interval === "month") monthlyGbp = amount;
      else if (price.recurring.interval === "year") annualGbp = amount;
    }
    out.push({
      entitlements,
      display: parseTierDisplay(product),
      monthlyGbp,
      annualGbp,
    });
  }
  return out;
}

/**
 * Resolve the single GBP price id + entitlements for a tier/cadence, live from
 * Stripe — used by checkout. Non-GBP customers are localized by Stripe Adaptive
 * Pricing; we always charge against the GBP base price and settle in GBP. Throws
 * if the tier product, its metadata, or its GBP price for the cadence is
 * missing/invalid.
 */
export async function resolveTierCheckout(
  stripe: Stripe,
  tierId: string,
  cadence: "monthly" | "annual"
): Promise<{
  priceId: string;
  productId: string;
  entitlements: Entitlements;
  unitAmount: number | null; // minor units (pence)
  currency: string; // gbp (settlement)
}> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((p) => p.metadata?.tier_id === tierId);
  if (!product) {
    throw new EntitlementParseError(
      `No active Stripe product for tier "${tierId}"`
    );
  }
  const entitlements = parseTierMetadata(product);
  if (entitlements.status !== "live") {
    throw new EntitlementParseError(`Tier "${tierId}" is not live for checkout`);
  }
  const interval = cadence === "annual" ? "year" : "month";
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const price = prices.data.find(
    (p) => p.currency === "gbp" && p.recurring?.interval === interval
  );
  if (!price) {
    throw new EntitlementParseError(
      `No active GBP ${cadence} price for tier "${tierId}"`
    );
  }
  return {
    priceId: price.id,
    productId: product.id,
    entitlements,
    unitAmount: price.unit_amount,
    currency: price.currency,
  };
}
