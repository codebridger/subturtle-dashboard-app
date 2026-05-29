/**
 * TierRegistryService — reads the 3-tier pricing ladder from Stripe at runtime
 * and caches it, so product/marketing can change a tagline, feature label,
 * credit budget, cap, or price in the Stripe Dashboard without a code deploy.
 *
 * Stripe is the single source of truth. A tier product is identified by
 * `product.metadata.tierId`; the rest of the tier definition is read from the
 * other metadata keys (see `parseTierProduct`) and the product's live prices.
 * The result is mapped into the existing `TierDefinition` shape so callers are
 * unchanged.
 *
 * Resilience (the two Stripe-related risks called out in the epic):
 *   - Latency: a 5-minute cache plus stale-while-revalidate means only the very
 *     first (cold) load blocks on Stripe; every later refresh happens in the
 *     background while callers keep reading the last snapshot.
 *   - Bad metadata: the parser is strict and refreshes are atomic — if any tier
 *     product fails to parse, the whole refresh is rejected and the last good
 *     cache is kept (logged), rather than serving a half-broken registry.
 */
import Stripe from "stripe";
import {
  TierId,
  Cadence,
  Currency,
  TierStatus,
  FeatureKey,
  TierDefinition,
  TierPrices,
  TierAmounts,
} from "./tiers";

export const KNOWN_TIER_IDS: TierId[] = ["starter", "learner", "fluent"];

export const FEATURE_KEYS: FeatureKey[] = [
  "save_words",
  "smart_review",
  "ai_credits",
  "weekly_insights",
  "session_history",
  "live_conversations",
];

const TIER_STATUSES: TierStatus[] = ["live", "dark"];

const INTERVAL_TO_CADENCE: Record<string, Cadence> = {
  month: "monthly",
  year: "annual",
};

/** Default cache lifetime: a refresh is triggered once a snapshot is older than this. */
export const TIER_REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;

export interface ResolvedPrice {
  tier: TierDefinition;
  cadence: Cadence;
  currency: Currency;
}

interface TierSnapshot {
  byId: Map<TierId, TierDefinition>;
  loadedAt: number;
}

/** A required string metadata field — present and non-empty. */
function requireString(raw: string | undefined, ctx: string): string {
  if (raw == null || raw.trim() === "") {
    throw new Error(`${ctx} is required`);
  }
  return raw;
}

/**
 * Parse a non-negative integer metadata value. `fallback` (when provided) is
 * used for an absent value — an explicit-but-malformed value still throws.
 */
function parseIntField(
  raw: string | undefined,
  ctx: string,
  fallback?: number
): number {
  if (raw == null || raw.trim() === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${ctx} is required`);
  }
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${ctx} must be a non-negative integer, got "${raw}"`);
  }
  return n;
}

/**
 * Parse a per-feature cap: "null" → unlimited, a non-negative integer → hard cap
 * (0 = locked). Anything else throws so a Dashboard typo can't silently unlock
 * or lock a feature.
 */
function parseCap(raw: string | undefined, ctx: string): number | null {
  if (raw == null || raw.trim() === "") {
    throw new Error(`${ctx} is required`);
  }
  const t = raw.trim();
  if (t.toLowerCase() === "null") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${ctx} must be "null" or a non-negative integer, got "${raw}"`);
  }
  return n;
}

/** Parse the `featureLabels` JSON array of strings. */
function parseFeatureLabels(raw: string | undefined, ctx: string): string[] {
  if (raw == null || raw.trim() === "") {
    throw new Error(`${ctx} is required`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${ctx} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error(`${ctx} must be a JSON array of strings`);
  }
  return parsed as string[];
}

/**
 * Fold a product's active recurring prices into the per-cadence/per-currency
 * `prices` (Stripe price IDs) and `amount` (major-unit display) maps. A tier
 * with no active recurring price is free (`isPaid: false`).
 */
function buildPrices(prices: Stripe.Price[]): {
  prices: TierPrices;
  amount: TierAmounts;
  isPaid: boolean;
} {
  const priceIds: TierPrices = { monthly: {}, annual: {} };
  const amounts: TierAmounts = { monthly: {}, annual: {} };
  let isPaid = false;

  for (const price of prices) {
    if (!price.active || !price.recurring) continue;
    const cadence = INTERVAL_TO_CADENCE[price.recurring.interval];
    if (!cadence) continue;
    const currency = price.currency as Currency;
    priceIds[cadence][currency] = price.id;
    if (price.unit_amount != null) {
      amounts[cadence][currency] = price.unit_amount / 100;
    }
    isPaid = true;
  }

  return { prices: priceIds, amount: amounts, isPaid };
}

/**
 * Map a single Stripe product (plus its prices) to a `TierDefinition`. Throws on
 * any missing/invalid metadata so a bad Dashboard edit is rejected loudly.
 */
export function parseTierProduct(
  product: Stripe.Product,
  prices: Stripe.Price[]
): TierDefinition {
  const md = product.metadata || {};
  const tierId = md.tierId as TierId;
  if (!KNOWN_TIER_IDS.includes(tierId)) {
    throw new Error(`product ${product.id} has unknown tierId "${md.tierId}"`);
  }
  const ctx = (key: string) => `tier "${tierId}" metadata.${key}`;

  const status = md.status as TierStatus;
  if (!TIER_STATUSES.includes(status)) {
    throw new Error(`${ctx("status")} must be "live" or "dark", got "${md.status}"`);
  }

  const caps = {} as Record<FeatureKey, number | null>;
  for (const feature of FEATURE_KEYS) {
    caps[feature] = parseCap(md[`caps_${feature}`], ctx(`caps_${feature}`));
  }

  const { prices: priceMap, amount, isPaid } = buildPrices(prices);

  return {
    id: tierId,
    status,
    userFacingName: product.name,
    tagline: requireString(md.tagline, ctx("tagline")),
    isPaid,
    stripeProductId: product.id,
    prices: isPaid ? priceMap : null,
    amount: isPaid ? amount : null,
    creditBudget: parseIntField(md.creditsAmount, ctx("creditsAmount")),
    durationDays: parseIntField(md.subscriptionDays, ctx("subscriptionDays")),
    trialDays: parseIntField(md.trialDays, ctx("trialDays"), 0),
    caps,
    featureLabels: parseFeatureLabels(md.featureLabels, ctx("featureLabels")),
    aiBudgetLabel: requireString(md.aiBudgetLabel, ctx("aiBudgetLabel")),
  };
}

export class TierRegistryService {
  private stripe: Stripe;
  private cache: TierSnapshot | null = null;
  /** De-dupes concurrent refreshes so a burst of calls makes one Stripe round-trip. */
  private inflight: Promise<Map<TierId, TierDefinition>> | null = null;

  constructor(
    stripe?: Stripe,
    private opts: { ttlMs?: number; now?: () => number } = {}
  ) {
    this.stripe = stripe ?? new Stripe(process.env.STRIPE_SECRET_KEY || "");
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private ttlMs(): number {
    return this.opts.ttlMs ?? TIER_REGISTRY_CACHE_TTL_MS;
  }

  /** Drop the cache so the next read re-fetches from Stripe (used by webhooks/admin RPC). */
  invalidate(): void {
    this.cache = null;
  }

  async getTier(id: TierId): Promise<TierDefinition | null> {
    const byId = await this.ensureLoaded();
    return byId.get(id) ?? null;
  }

  /** All known tiers (live + dark), in canonical ladder order. */
  async listTiers(): Promise<TierDefinition[]> {
    const byId = await this.ensureLoaded();
    return KNOWN_TIER_IDS.map((id) => byId.get(id)).filter(
      (t): t is TierDefinition => !!t
    );
  }

  /** Sellable tiers only — excludes "dark" tiers (e.g. Fluent before launch). */
  async liveTiers(): Promise<TierDefinition[]> {
    return (await this.listTiers()).filter((t) => t.status === "live");
  }

  /** Resolve a Stripe price ID back to its tier + cadence + currency. */
  async resolveByPriceId(priceId: string): Promise<ResolvedPrice | null> {
    const byId = await this.ensureLoaded();
    const cadences: Cadence[] = ["monthly", "annual"];
    for (const tier of byId.values()) {
      if (!tier.prices) continue;
      for (const cadence of cadences) {
        const byCurrency = tier.prices[cadence];
        for (const currency of Object.keys(byCurrency) as Currency[]) {
          if (byCurrency[currency] === priceId) {
            return { tier, cadence, currency };
          }
        }
      }
    }
    return null;
  }

  /** Resolve a Stripe product ID back to its tier. */
  async resolveByProductId(productId: string): Promise<TierDefinition | null> {
    const byId = await this.ensureLoaded();
    for (const tier of byId.values()) {
      if (tier.stripeProductId === productId) return tier;
    }
    return null;
  }

  /**
   * Return the cached snapshot, refreshing as needed. The cold load blocks; a
   * stale snapshot is served immediately while a background refresh runs.
   */
  private async ensureLoaded(): Promise<Map<TierId, TierDefinition>> {
    if (!this.cache) {
      return this.refresh();
    }
    if (this.now() - this.cache.loadedAt >= this.ttlMs()) {
      // Stale-while-revalidate: kick off a background refresh, serve stale now.
      void this.refresh().catch(() => {
        /* refresh() already logs and keeps the last good cache */
      });
    }
    return this.cache.byId;
  }

  private async refresh(): Promise<Map<TierId, TierDefinition>> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const byId = await this.loadFromStripe();
        this.cache = { byId, loadedAt: this.now() };
        return byId;
      } catch (err: any) {
        if (this.cache) {
          console.error(
            "[tier-registry] refresh failed; keeping last good cache:",
            err?.message || err
          );
          return this.cache.byId;
        }
        throw err;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /**
   * Fetch every tier product and its prices from Stripe and parse them into a
   * snapshot. Throws if no tier products exist or any one fails to parse, so the
   * caller can keep the last good cache instead of caching broken data.
   */
  async loadFromStripe(): Promise<Map<TierId, TierDefinition>> {
    const products = await listAll<Stripe.Product>(
      (p) => this.stripe.products.list(p),
      { active: true }
    );
    const tierProducts = products.filter((p) =>
      KNOWN_TIER_IDS.includes(p.metadata?.tierId as TierId)
    );

    const byId = new Map<TierId, TierDefinition>();
    for (const product of tierProducts) {
      const prices = await listAll<Stripe.Price>(
        (p) => this.stripe.prices.list(p),
        { product: product.id, active: true }
      );
      const tier = parseTierProduct(product, prices);
      byId.set(tier.id, tier);
    }

    if (byId.size === 0) {
      throw new Error(
        "[tier-registry] no tier products (metadata.tierId) found in Stripe"
      );
    }
    return byId;
  }
}

/** Page through a Stripe list endpoint, returning every item. */
async function listAll<T extends { id: string }>(
  lister: (params: any) => Promise<Stripe.ApiList<T>>,
  params: Record<string, any> = {}
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await lister({ limit: 100, ...params, starting_after });
    out.push(...page.data);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return out;
}

let defaultInstance: TierRegistryService | null = null;

/** Shared process-wide registry instance (lazy so env/Stripe init is deferred). */
export function getTierRegistry(): TierRegistryService {
  if (!defaultInstance) {
    defaultInstance = new TierRegistryService();
  }
  return defaultInstance;
}
