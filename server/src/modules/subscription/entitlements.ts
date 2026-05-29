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
 *   - Display copy (name, tagline, feature labels) is NOT here — it stays in code
 *     keyed by `tier_id`. Stripe metadata holds machine values only.
 *
 * Metadata is read through a short-TTL cache to keep Stripe calls cheap and
 * within rate limits; the cache is invalidated on the `product.updated` /
 * `price.updated` webhook (see the plans endpoint) so edits show up promptly.
 */
import Stripe from "stripe";
import { z } from "zod";

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
  } else {
    entitlementCache.clear();
    priceToProduct.clear();
  }
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
    const cached = getCachedByProduct(product.id);
    if (cached) return cached;
  } else {
    product = await stripe.products.retrieve(productId as string);
  }

  const entitlements = parseTierMetadata(product);
  entitlementCache.set(product.id, {
    value: entitlements,
    expiresAt: Date.now() + ENTITLEMENT_CACHE_TTL_MS,
  });
  return entitlements;
}
