import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  SUBSCRIPTION_COLLECTION,
  USAGE_COLLECTION,
  FREE_CREDIT_COLLECTION,
  FREEMIUM_DEFAULT_CREDITS,
  FREEMIUM_DEFAULT_SAVE_WORDS,
  FREEMIUM_DURATION_DAYS,
  FREEMIUM_DEFAULT_LIVED_SESSIONS,
  FREEMIUM_DEFAULT_VOICE_MINUTES,
  FREEMIUM_DEFAULT_TEXT_CHATS,
  FREEMIUM_DEFAULT_TEXT_CHAT_MAX_MESSAGES,
} from "../../config";
import {
  LOW_CREDITS_THRESHOLD,
  SOFT_CAP_PERCENT,
  FREE_VOICE_SESSION_MAX_MINUTES,
} from "./config";

import {
  emitLowCreditsEvent,
  emitSoftCapEvent,
  emitSubscriptionChangeEvent,
  emitSubscriptionExpiredEvent,
} from "./events";
import { Subscription, FreeCredit, VoiceTopUp } from "./types";
import { TierId, Cadence } from "./tiers";
import { Entitlements } from "./entitlements";
import { EntitlementLimitError } from "./enforcement";
import { CostCalculationInput, calculatorService } from "./calculator";
import { PaymentAdapterFactory, PaymentProvider } from "../gateway/adapters";
import Stripe from "stripe";
import {
  trackServerEvent,
  SERVER_ANALYTICS_EVENTS,
} from "../../utils/analytics";

/**
 * Compute derived credit values from the raw schema fields.
 *
 * The subscription / free_credit schemas define `available_credit` and
 * `usage_percentage` as Mongoose virtuals, but those virtuals are NOT reliably
 * present on the objects `getCollection().findOne()` returns here — only
 * `.toObject({ virtuals: true })` exposes them. Always derive from the raw
 * `total_credits` / `credits_used` fields for in-server credit math.
 */
function computeAvailableCredits(doc: {
  total_credits?: number;
  credits_used?: number;
}): number {
  return (doc.total_credits || 0) - (doc.credits_used || 0);
}

function computeUsagePercentage(doc: {
  total_credits?: number;
  credits_used?: number;
}): number {
  const total = doc.total_credits || 0;
  if (total <= 0) return 0;
  return Math.min(Math.round(((doc.credits_used || 0) / total) * 100), 100);
}

/**
 * Get or create freemium allocation for a user
 */
export async function getOrCreateFreemiumAllocation(userId: string) {
  const freeCreditCollection = getCollection<FreeCredit>(
    DATABASE,
    FREE_CREDIT_COLLECTION
  );

  // Try to find existing active freemium allocation
  let freemiumAllocation: any | null = await freeCreditCollection.findOne({
    user_id: Types.ObjectId(userId),
    end_date: { $gte: new Date() },
  });

  // If no active freemium allocation exists, create a new one
  if (!freemiumAllocation) {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + FREEMIUM_DURATION_DAYS);

    const newFreemiumAllocation = {
      user_id: Types.ObjectId(userId),
      start_date: startDate,
      end_date: endDate,
      total_credits: FREEMIUM_DEFAULT_CREDITS,
      credits_used: 0,
      allowed_save_words: FREEMIUM_DEFAULT_SAVE_WORDS,
      allowed_save_words_used: 0,
      allowed_lived_sessions: FREEMIUM_DEFAULT_LIVED_SESSIONS,
      allowed_lived_sessions_used: 0,
      allowed_text_chats: FREEMIUM_DEFAULT_TEXT_CHATS,
      allowed_text_chats_used: 0,
      voice_minutes_total: FREEMIUM_DEFAULT_VOICE_MINUTES,
      voice_minutes_used: 0,
    };

    freemiumAllocation = await freeCreditCollection
      .create(newFreemiumAllocation)
      .then((doc) => doc.toObject());
  } else {
    freemiumAllocation = freemiumAllocation.toObject();
  }

  // Recheck and return the correct type
  freemiumAllocation = freemiumAllocation._doc
    ? freemiumAllocation._doc
    : freemiumAllocation;

  return freemiumAllocation as FreeCredit;
}

export async function isUserOnFreemium(userId: string) {
  // check if user has active subscription
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = await subscriptionsCollection.count({
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  });

  return activeSubscription === 0;
}

export async function updateFreemiumAllocation(options: {
  userId: string;
  increment: {
    allowed_save_words_used?: number;
    allowed_lived_sessions_used?: number;
    credits_used?: number;
  };
}) {
  const { userId, increment } = options;

  const freeCreditCollection = getCollection<FreeCredit>(
    DATABASE,
    FREE_CREDIT_COLLECTION
  );

  const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);

  // Build safe increment object that won't result in negative values for allowed_save_words_used
  const safeIncrement: any = {};

  if (increment.allowed_save_words_used !== undefined) {
    const currentValue = freemiumAllocation.allowed_save_words_used || 0;
    const newValue = currentValue + increment.allowed_save_words_used;
    if (newValue >= 0) {
      safeIncrement.allowed_save_words_used = increment.allowed_save_words_used;
    } else {
      // If it would go below 0, set it to 0
      safeIncrement.allowed_save_words_used = -currentValue;
    }
  }

  // Other properties can go below 0, so apply increments directly
  if (increment.allowed_lived_sessions_used !== undefined) {
    safeIncrement.allowed_lived_sessions_used =
      increment.allowed_lived_sessions_used;
  }

  if (increment.credits_used !== undefined) {
    safeIncrement.credits_used = increment.credits_used;
  }

  const updatedFreemiumAllocation = await freeCreditCollection.updateOne(
    { _id: freemiumAllocation._id },
    { $inc: safeIncrement }
  );

  return updatedFreemiumAllocation;
}

// --- Voice-minute metering (Council 004) ----------------------------------
// Voice is a metered budget, not a count cap: tiers grant a pool of minutes
// (free 5 / Reader 0 / Learner 90 / Coach 300) that is debited as voice sessions
// are used. The budget lives on the active subscription for paid users, else on
// the freemium allocation — mirroring the AI-credit budget.

interface VoiceBudget {
  total: number;
  used: number;
  remaining: number;
  scope: "subscription" | "freemium";
}

/** The effective voice balance after accounting for top-up packs and their 90-day
 *  expiry. The single `voice_minutes_used` counter is allocated base-budget-first,
 *  then across non-expired packs oldest-first, so each pack's remaining minutes are
 *  derived without storing per-pack consumption. Expired packs are excluded. */
export interface VoiceBalance {
  base: number;
  used: number;
  total: number; // effective total = base grant + non-expired pack minutes
  remaining: number; // base remaining + non-expired pack remaining
  activeTopUps: {
    pack_size: number;
    minutes_remaining: number;
    expires_at: Date;
  }[];
}

export function computeVoiceBalance(sub: {
  voice_minutes_total?: number;
  voice_minutes_used?: number;
  entitlements?: { voiceMinutesGranted?: number } | null;
  top_ups?: VoiceTopUp[] | null;
}): VoiceBalance {
  // Base = the tier's monthly grant (the locked entitlement snapshot). Fall back to
  // the stored total for legacy docs predating top-ups / the snapshot.
  const base =
    sub.entitlements?.voiceMinutesGranted ?? sub.voice_minutes_total ?? 0;
  const used = sub.voice_minutes_used ?? 0;
  const now = Date.now();
  const packs = (sub.top_ups ?? [])
    .filter((p) => p && new Date(p.expires_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime()
    );

  const baseRemaining = Math.max(0, base - used);
  let overflow = Math.max(0, used - base); // usage beyond base spills into packs

  const activeTopUps = packs.map((p) => {
    const consumed = Math.min(overflow, p.minutes);
    overflow -= consumed;
    return {
      pack_size: p.pack_size,
      minutes_remaining: p.minutes - consumed,
      expires_at: p.expires_at,
    };
  });

  const packMinutes = packs.reduce((s, p) => s + (p.minutes || 0), 0);
  const topUpRemaining = activeTopUps.reduce(
    (s, t) => s + t.minutes_remaining,
    0
  );

  return {
    base,
    used,
    total: base + packMinutes,
    remaining: baseRemaining + topUpRemaining,
    activeTopUps,
  };
}

/** Carry non-expired top-up packs forward across a subscription renewal: each
 *  surviving pack's REMAINING minutes (this period's consumption folded in) become
 *  its new `minutes`, expired/empty packs are dropped, and the carried total is
 *  returned to seed the new period's `voice_minutes_total`. */
export function carryForwardTopUps(sub: {
  voice_minutes_total?: number;
  voice_minutes_used?: number;
  entitlements?: { voiceMinutesGranted?: number } | null;
  top_ups?: VoiceTopUp[] | null;
}): { packs: VoiceTopUp[]; minutes: number } {
  const now = Date.now();
  const originals = (sub.top_ups ?? [])
    .filter((p) => p && new Date(p.expires_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime()
    );
  // computeVoiceBalance sorts identically, so activeTopUps[i] matches originals[i].
  const { activeTopUps } = computeVoiceBalance(sub);
  const packs: VoiceTopUp[] = [];
  let minutes = 0;
  originals.forEach((orig, i) => {
    const remaining = activeTopUps[i]?.minutes_remaining ?? 0;
    if (remaining > 0) {
      packs.push({
        session_id: orig.session_id,
        pack_size: orig.pack_size,
        minutes: remaining,
        purchased_at: orig.purchased_at,
        expires_at: orig.expires_at,
      });
      minutes += remaining;
    }
  });
  return { packs, minutes };
}

/** Read the user's voice-minute budget from their active subscription, or the
 *  freemium allocation when there is none. */
export async function getVoiceBudget(userId: string): Promise<VoiceBudget> {
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  })) as Subscription | null;

  if (activeSubscription) {
    // Effective budget includes non-expired top-up packs (expired ones excluded).
    const { total, used, remaining } = computeVoiceBalance(activeSubscription);
    return { total, used, remaining, scope: "subscription" };
  }

  const freemium = await getOrCreateFreemiumAllocation(userId);
  const total = freemium.voice_minutes_total || 0;
  const used = freemium.voice_minutes_used || 0;
  return { total, used, remaining: total - used, scope: "freemium" };
}

/** Block a voice session when the voice-minute budget is exhausted (or the tier
 *  grants none, e.g. Reader). Throws the shared EntitlementLimitError. */
export async function assertVoiceMinutesAvailable(userId: string): Promise<void> {
  const { total, used, remaining } = await getVoiceBudget(userId);
  if (remaining <= 0) {
    throw new EntitlementLimitError("voice_minutes", total, used);
  }
}

/** Pure policy: how many wall-clock seconds a single voice session may run given
 *  a voice budget. Free tier is capped per-session (FREE_VOICE_SESSION_MAX_MINUTES)
 *  but never beyond its remaining minutes; paid tiers are bounded only by the
 *  remaining balance. Kept pure so it can be unit-tested without a DB and reused
 *  by any caller. */
export function voiceSessionMaxSeconds(budget: {
  remaining: number;
  scope: "subscription" | "freemium";
}): number {
  const capMinutes =
    budget.scope === "freemium"
      ? Math.min(FREE_VOICE_SESSION_MAX_MINUTES, budget.remaining)
      : budget.remaining;
  return Math.max(0, capMinutes) * 60;
}

/** The max duration (seconds) the user's NEXT voice session may run for right now.
 *  Surfaced by the session-start handshake so every client (dashboard, mobile)
 *  shares ONE duration policy instead of reimplementing it. The session debit is
 *  ceil-rounded to whole minutes, so this is also the budget-safe ceiling. */
export async function getVoiceSessionMaxSeconds(userId: string): Promise<number> {
  return voiceSessionMaxSeconds(await getVoiceBudget(userId));
}

/** Debit consumed voice minutes (rounded up) from the active budget when a voice
 *  session ends. Returns the budget after debit. */
export async function debitVoiceMinutes(
  userId: string,
  minutes: number
): Promise<VoiceBudget> {
  const debit = Math.max(0, Math.ceil(minutes || 0));
  if (debit > 0) {
    const { scope } = await getVoiceBudget(userId);
    if (scope === "subscription") {
      const subscriptionsCollection = getCollection<Subscription>(
        DATABASE,
        SUBSCRIPTION_COLLECTION
      );
      await subscriptionsCollection.updateOne(
        {
          user_id: Types.ObjectId(userId),
          status: { $nin: ["canceled", "incomplete_expired"] },
          end_date: { $gte: new Date() },
        },
        { $inc: { voice_minutes_used: debit } }
      );
    } else {
      const freemium = await getOrCreateFreemiumAllocation(userId);
      const freeCreditCollection = getCollection<FreeCredit>(
        DATABASE,
        FREE_CREDIT_COLLECTION
      );
      await freeCreditCollection.updateOne(
        { _id: (freemium as any)._id },
        { $inc: { voice_minutes_used: debit } }
      );
    }
  }
  return getVoiceBudget(userId);
}

/**
 * Apply a one-shot voice-minute top-up pack to the user's ACTIVE subscription
 * (Council 004 overage). Pushes a 90-day ledger entry and `$inc`s
 * voice_minutes_total so the budget reflects it immediately. Idempotent on the
 * Stripe session id — a redelivered webhook never double-grants.
 */
export async function addVoiceMinutesPack(props: {
  userId: string;
  minutes: number;
  packSize: number;
  sessionId: string;
  expiryDays?: number;
}): Promise<{
  success: boolean;
  applied: boolean;
  idempotent: boolean;
  message: string;
}> {
  const { userId, minutes, packSize, sessionId, expiryDays = 90 } = props;
  if (!userId || !sessionId) {
    return {
      success: false,
      applied: false,
      idempotent: false,
      message: "userId and sessionId are required",
    };
  }
  if (!(minutes > 0)) {
    return {
      success: false,
      applied: false,
      idempotent: false,
      message: "minutes must be positive",
    };
  }

  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeFilter: any = {
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  };

  const sub = await subscriptionsCollection.findOne(activeFilter);
  if (!sub) {
    // Top-ups only apply to an active paid subscription (Reader / Learner / Coach).
    return {
      success: false,
      applied: false,
      idempotent: false,
      message: "No active subscription to apply the top-up to",
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

  // The `session_id != ` guard makes the push idempotent atomically: a redelivered
  // webhook (same session) matches nothing and modifies zero documents.
  const res: any = await subscriptionsCollection.updateOne(
    { ...activeFilter, "top_ups.session_id": { $ne: sessionId } },
    {
      $push: {
        top_ups: {
          session_id: sessionId,
          pack_size: packSize,
          minutes,
          purchased_at: now,
          expires_at: expiresAt,
        },
      },
      $inc: { voice_minutes_total: minutes },
    }
  );

  const modified = res?.modifiedCount ?? res?.nModified ?? 0;
  if (modified === 0) {
    return {
      success: true,
      applied: false,
      idempotent: true,
      message: "Top-up already applied",
    };
  }
  return {
    success: true,
    applied: true,
    idempotent: false,
    message: `Granted ${minutes} voice minutes`,
  };
}

/**
 * Gate + consume one text-chat "start" against the monthly chat cap (Council 004
 * follow-up). Reader is capped (from the entitlement snapshot); Starter from config;
 * Learner / Coach are unlimited (no-op). Throws TIER_LIMIT_REACHED
 * ("text_chat_count") at the cap, otherwise atomically increments the used counter.
 */
export async function assertAndConsumeTextChat(userId: string): Promise<void> {
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const active = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  } as any)) as Subscription | null;

  if (active) {
    const cap = active.allowed_text_chats ?? null; // null = unlimited (Learner/Coach)
    if (cap === null) return;
    const used = active.allowed_text_chats_used ?? 0;
    if (used >= cap) {
      throw new EntitlementLimitError("text_chat_count", cap, used);
    }
    await subscriptionsCollection.updateOne(
      { _id: (active as any)._id },
      { $inc: { allowed_text_chats_used: 1 } }
    );
    return;
  }

  // Free (Starter).
  const freemium: any = await getOrCreateFreemiumAllocation(userId);
  const cap = freemium.allowed_text_chats ?? FREEMIUM_DEFAULT_TEXT_CHATS;
  const used = freemium.allowed_text_chats_used ?? 0;
  if (used >= cap) {
    throw new EntitlementLimitError("text_chat_count", cap, used);
  }
  const freeCreditCollection = getCollection<FreeCredit>(
    DATABASE,
    FREE_CREDIT_COLLECTION
  );
  await freeCreditCollection.updateOne(
    { _id: freemium._id },
    { $inc: { allowed_text_chats_used: 1 } }
  );
}

/**
 * The per-chat message cap for the user's tier (null = unlimited). Reader / Starter
 * are capped; Learner / Coach are not. `text-turn` uses this to end a chat
 * gracefully at the cap and to surface a soft "wrap up soon" warning just before it.
 */
export async function getTextChatMessageCap(
  userId: string
): Promise<number | null> {
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const active = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  } as any)) as Subscription | null;

  if (active) {
    return active.entitlements?.textChatMaxMessages ?? null;
  }
  return FREEMIUM_DEFAULT_TEXT_CHAT_MAX_MESSAGES;
}

/**
 * Check credit allocation for a user
 */
export async function checkCreditAllocation(props: {
  userId: string;
  minCredits?: number;
}) {
  const { userId, minCredits } = props;

  // Get active subscription for user
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  // Match the statuses getSubscription/isUserOnFreemium accept — anything not
  // canceled/incomplete_expired counts as the user's subscription. An exact
  // status:"active" filter here silently dropped trialing/past_due/paused
  // subscriptions back to the freemium pool.
  const activeSubscription = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  })) as Subscription | null;

  let availableCredits = 0;
  let subscriptionEndsAt: Date;
  let isFreemium = false;

  if (activeSubscription) {
    // User has an active paid subscription
    availableCredits = computeAvailableCredits(activeSubscription);
    subscriptionEndsAt = activeSubscription.end_date;
  } else {
    // No active subscription, check freemium allocation
    const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);
    availableCredits =
      (freemiumAllocation.total_credits || 0) -
      (freemiumAllocation.credits_used || 0);
    subscriptionEndsAt = freemiumAllocation.end_date;
    isFreemium = true;
  }

  const allowedToProceed =
    availableCredits >= (minCredits || LOW_CREDITS_THRESHOLD);

  // Check if credits are low and emit event if needed
  if (!allowedToProceed) {
    emitLowCreditsEvent(userId, availableCredits);
  }

  return {
    availableCredits,
    subscriptionEndsAt,
    allowedToProceed,
    isFreemium,
  };
}

/**
 * Add credits to a user's account
 */
export async function addNewSubscriptionWithCredit(props: {
  userId: string;
  creditAmount: number;
  totalDays?: number;
  startDateUnixTimestamp: number;
  endDateUnixTimestamp: number;
  paymentMetaData: any;
  tier?: TierId;
  subscriptionType?: Cadence;
  priceId?: string;
  status?: Subscription["status"];
  trialEndUnixTimestamp?: number;
  voiceMinutes?: number;
  entitlements?: Entitlements;
  grantedPeriodEndUnixTimestamp?: number;
  stripeSubscriptionId?: string;
}) {
  const {
    userId,
    creditAmount,
    totalDays,
    startDateUnixTimestamp,
    endDateUnixTimestamp,
    paymentMetaData,
    tier,
    subscriptionType,
    priceId,
    status = "active",
    trialEndUnixTimestamp,
    voiceMinutes,
    entitlements,
    grantedPeriodEndUnixTimestamp,
    stripeSubscriptionId,
  } = props;
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  if ((startDateUnixTimestamp || endDateUnixTimestamp) && totalDays) {
    throw new Error(
      "Cannot provide both startDateUnixTimestamp and endDateUnixTimestamp and totalDays"
    );
  }

  // Idempotency (ADR-004): if this Stripe subscription was already created/granted
  // for this period (or a newer one), do not create a second doc or re-grant.
  // Guards against duplicate/out-of-order `customer.subscription.created` events.
  if (stripeSubscriptionId) {
    const existing = (await subscriptionsCollection.findOne({
      "payment_meta_data.stripe.subscription_id": stripeSubscriptionId,
    })) as Subscription | null;
    if (existing) {
      const existingGrantedEnd = existing.granted_period_end
        ? new Date(existing.granted_period_end).getTime() / 1000
        : 0;
      if (
        !grantedPeriodEndUnixTimestamp ||
        existingGrantedEnd >= grantedPeriodEndUnixTimestamp
      ) {
        return {
          subscriptionId: existing._id,
          expirationDate: existing.end_date,
          creditBalance:
            (existing.total_credits || 0) - (existing.credits_used || 0),
          isNewSubscription: false,
          idempotent: true,
        };
      }
    }
  }

  // Deactivate any previous active/trialing subscriptions for the user
  await subscriptionsCollection.updateMany(
    {
      user_id: Types.ObjectId(userId),
      status: { $in: ["active", "trialing"] },
    },
    { $set: { status: "expired" } }
  );

  // Always create a new subscription
  let startDate, endDate;

  if (totalDays) {
    startDate = new Date();
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);
  } else {
    startDate = new Date(startDateUnixTimestamp * 1000); // Convert Unix timestamp to Date
    endDate = new Date(endDateUnixTimestamp * 1000); // Convert Unix timestamp to Date
  }

  const newSubscription: Partial<Subscription> = {
    user_id: Types.ObjectId(userId),
    start_date: startDate,
    end_date: endDate,
    total_credits: creditAmount,
    credits_used: 0,
    voice_minutes_total: voiceMinutes ?? 0,
    voice_minutes_used: 0,
    // Reader text-chat monthly cap from the tier metadata (omitted = unlimited).
    ...(entitlements?.textChatCap != null && {
      allowed_text_chats: entitlements.textChatCap,
    }),
    allowed_text_chats_used: 0,
    status,
    payment_meta_data: paymentMetaData,
    ...(tier && { tier }),
    ...(subscriptionType && { subscription_type: subscriptionType }),
    ...(priceId && { price_id: priceId }),
    ...(trialEndUnixTimestamp && {
      trial_end: new Date(trialEndUnixTimestamp * 1000),
    }),
    // Lock the period marker + entitlement snapshot for this paid period.
    ...(grantedPeriodEndUnixTimestamp && {
      granted_period_end: new Date(grantedPeriodEndUnixTimestamp * 1000),
    }),
    ...(entitlements && { entitlements }),
  };

  const createdSubscription = await subscriptionsCollection.create(
    newSubscription
  );

  // Emit subscription change event for new subscription
  emitSubscriptionChangeEvent(userId, createdSubscription._id, "new", {
    creditAmount,
    endDate,
  });

  // Calculate remaining credits
  const remainingCredits = createdSubscription?.available_credit || 0;

  return {
    subscriptionId: createdSubscription?._id,
    expirationDate: createdSubscription?.end_date,
    creditBalance: remainingCredits,
    isNewSubscription: true,
  };
}

export async function cancelSubscriptionByProviderAndSubscriptionId(props: {
  provider: PaymentProvider;
  subscriptionId: string;
  status: Stripe.Subscription.Status;
}) {
  const { provider, subscriptionId, status = "expired" } = props;

  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  const filter: any = {
    "payment_meta_data.provider": provider,
  };

  if (provider == PaymentProvider.STRIPE) {
    filter["payment_meta_data.stripe.subscription_id"] = subscriptionId;
  }

  try {
    // Capture the pre-cancel status so the webhook can tell a trial cancel
    // apart from a paid cancel (for the trial-canceled analytics event).
    const existing = await subscriptionsCollection.findOne(filter);
    const wasTrialing = existing?.status === "trialing";

    const updateResult = await subscriptionsCollection.updateOne(filter, {
      $set: {
        status,
      },
    });

    if (updateResult.nModified == 0) {
      throw new Error("Subscription not found");
    }

    return {
      success: true,
      message: "Subscription canceled successfully",
      wasTrialing,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to cancel subscription",
      wasTrialing: false,
    };
  }
}

export async function updateSubscriptionStatusByProviderAndSubscriptionId(props: {
  provider: PaymentProvider;
  subscriptionId: string;
  status: Subscription["status"];
  startDateUnixTimestamp: number;
  endDateUnixTimestamp: number;
  tier?: TierId;
  subscriptionType?: Cadence;
  priceId?: string;
  creditAmount?: number;
  voiceMinutes?: number;
  entitlements?: Entitlements;
  trialEndUnixTimestamp?: number;
  cancelAtPeriodEnd?: boolean;
}) {
  const {
    provider,
    subscriptionId,
    status,
    startDateUnixTimestamp,
    endDateUnixTimestamp,
    tier,
    subscriptionType,
    priceId,
    creditAmount,
    voiceMinutes,
    entitlements,
    trialEndUnixTimestamp,
    cancelAtPeriodEnd,
  } = props;

  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  // Match by provider + subscription id only. A trialing OR active subscription
  // can receive an `updated` event — notably the trial->paid transition.
  const filter: any = {
    "payment_meta_data.provider": provider,
  };

  if (provider == PaymentProvider.STRIPE) {
    filter["payment_meta_data.stripe.subscription_id"] = subscriptionId;
  }

  const currentSubscription = await subscriptionsCollection.findOne(filter);

  if (!currentSubscription) {
    return {
      success: false,
      message: "Subscription not found",
    };
  }

  // A new-period grant only when the incoming period_end is strictly newer than
  // the one we last granted (ADR-004): idempotent on re-delivery, and safe
  // against out-of-order (older) deliveries that would otherwise regress the
  // window or double-grant.
  const lastGrantedEnd = currentSubscription.granted_period_end
    ? new Date(currentSubscription.granted_period_end).getTime() / 1000
    : 0;
  const isNewPeriodGrant =
    !!endDateUnixTimestamp && endDateUnixTimestamp > lastGrantedEnd;

  const update: any = { status };
  if (tier) update.tier = tier;
  if (subscriptionType) update.subscription_type = subscriptionType;
  if (priceId) update.price_id = priceId;
  update.cancel_at_period_end = !!cancelAtPeriodEnd;
  update.trial_end = trialEndUnixTimestamp
    ? new Date(trialEndUnixTimestamp * 1000)
    : null;

  if (isNewPeriodGrant) {
    // Real period rollover (renewal, or trial -> first paid period): move the
    // window, RE-READ the entitlement snapshot, and refill the monthly credit +
    // voice budgets (no rollover). A mid-period metadata edit therefore reaches
    // a customer only at their next renewal.
    update.start_date = new Date(startDateUnixTimestamp * 1000);
    update.end_date = new Date(endDateUnixTimestamp * 1000);
    update.granted_period_end = new Date(endDateUnixTimestamp * 1000);
    if (creditAmount !== undefined) {
      update.total_credits = creditAmount;
      update.credits_used = 0;
    }
    if (voiceMinutes !== undefined) {
      // Renewal resets the BASE monthly voice budget; top-up packs survive until
      // their 90-day expiry. Fold each surviving pack's remaining minutes forward
      // (this period's consumption reconciled into `minutes`), drop expired/empty
      // packs, and seed the new period total = base grant + carried-over minutes.
      const carried = carryForwardTopUps(currentSubscription as any);
      update.voice_minutes_total = voiceMinutes + carried.minutes;
      update.voice_minutes_used = 0;
      update.top_ups = carried.packs;
    }
    if (entitlements) {
      update.entitlements = entitlements;
      // Reset Reader's text-chat counter and re-seed its cap from the (possibly
      // updated) metadata on renewal. null cap = unlimited (Learner / Coach).
      update.allowed_text_chats = entitlements.textChatCap ?? null;
      update.allowed_text_chats_used = 0;
    }
  }

  await subscriptionsCollection.updateOne(filter, { $set: update });

  return {
    success: true,
    message: "Subscription updated successfully",
  };
}

/**
 * Record generic usage
 */
export async function recordUsage(props: {
  userId: string;
  serviceType: string;
  costInputs: CostCalculationInput[];
  modelUsed?: string;
  details?: any;
}) {
  const { userId, serviceType, costInputs, modelUsed, details } = props;

  // Calculate credit amount using calculator service
  const costResult = calculatorService.calculateCosts(costInputs);
  const creditAmount = costResult.totalCostInCredits;
  const tokenCount = costResult.totalTokens;

  console.log(`=== RECORD USAGE ===`);
  console.log(`Credit amount: ${creditAmount}`);
  console.log(`USD amount: ${costResult.totalCostInUsd}`);
  console.log(`Token count: ${tokenCount}`);
  console.log(`Model used: ${modelUsed}`);

  // Get active subscription
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  // Match the statuses getSubscription/isUserOnFreemium accept — anything not
  // canceled/incomplete_expired counts as the user's subscription. An exact
  // status:"active" filter here silently dropped trialing/past_due/paused
  // subscriptions back to the freemium pool.
  const activeSubscription = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: { $nin: ["canceled", "incomplete_expired"] },
    end_date: { $gte: new Date() },
  })) as Subscription | null;

  let availableCredits = 0;
  let subscriptionId: any = null;
  let isFreemium = false;

  if (activeSubscription) {
    // User has active paid subscription
    availableCredits = activeSubscription.available_credit || 0;
    subscriptionId = activeSubscription._id;
  } else {
    // No active subscription, use freemium allocation
    const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);
    availableCredits =
      (freemiumAllocation.total_credits || 0) -
      (freemiumAllocation.credits_used || 0);
    subscriptionId = "freemium";
    isFreemium = true;
  }

  // Record usage in database regardless of available credits
  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
  const newUsage = {
    user_id: Types.ObjectId(userId),
    subscription_id: subscriptionId,
    service_type: serviceType,
    credit_used: creditAmount,
    token_count: tokenCount,
    model_used: modelUsed,
    status: availableCredits < creditAmount ? "overdraft" : "paid",
    details: {
      ...details,
      costBreakdown: costResult.items,
    },
  };

  const usageRecord = await usageCollection.create(newUsage);

  let remainingCredits = 0;
  let usagePercentage = 0;

  if (isFreemium) {
    // Update freemium allocation's credits_used
    const freeCreditCollection = getCollection<FreeCredit>(
      DATABASE,
      FREE_CREDIT_COLLECTION
    );

    await freeCreditCollection.updateOne(
      {
        user_id: Types.ObjectId(userId),
        end_date: { $gte: new Date() },
      },
      { $inc: { credits_used: creditAmount } }
    );

    // Get updated freemium allocation
    const updatedFreemiumAllocation = (await freeCreditCollection.findOne({
      user_id: Types.ObjectId(userId),
      end_date: { $gte: new Date() },
    })) as FreeCredit | null;

    if (updatedFreemiumAllocation) {
      remainingCredits = computeAvailableCredits(updatedFreemiumAllocation);
      usagePercentage = computeUsagePercentage(updatedFreemiumAllocation);

      // Starter AI budget just hit exhaustion — fire the one-shot server-truth
      // analytics event and flag the doc so it fires at most once per window.
      if (
        remainingCredits <= 0 &&
        !updatedFreemiumAllocation.ai_exhausted_flagged
      ) {
        const startDate = updatedFreemiumAllocation.start_date
          ? new Date(updatedFreemiumAllocation.start_date)
          : new Date();
        const daysSinceAllocation = Math.floor(
          (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        trackServerEvent(
          SERVER_ANALYTICS_EVENTS.STARTER_AI_EXHAUSTED,
          userId,
          { daysSinceAllocation }
        );
        await freeCreditCollection.updateOne(
          { _id: updatedFreemiumAllocation._id },
          { $set: { ai_exhausted_flagged: true } }
        );
      }
    }
  } else {
    // Update subscription's credits_used
    await subscriptionsCollection.updateOne(
      { _id: activeSubscription!._id },
      { $inc: { credits_used: creditAmount } }
    );

    // Get updated subscription
    const updatedSubscription = (await subscriptionsCollection.findOne({
      _id: activeSubscription!._id,
    })) as Subscription | null;

    if (updatedSubscription) {
      remainingCredits = computeAvailableCredits(updatedSubscription);
      usagePercentage = computeUsagePercentage(updatedSubscription);
    }
  }

  // Check if credits are low and emit events if needed
  if (remainingCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, remainingCredits);
  }
  // Soft-cap: between SOFT_CAP_PERCENT and full exhaustion (hard cap at 100%).
  if (usagePercentage >= SOFT_CAP_PERCENT && usagePercentage < 100) {
    emitSoftCapEvent(userId, usagePercentage);
  }

  return {
    remainingCredits,
    usagePercentage,
    usageId: usageRecord._id,
    status: availableCredits < creditAmount ? "overdraft" : "paid",
    costResult,
    isFreemium,
  };
}

export async function getSubscription(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // Get active subscription for user
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  const activeSubscription = await subscriptionsCollection
    .findOne({
      user_id: Types.ObjectId(userId),
      status: { $nin: ["canceled", "incomplete_expired"] },
      end_date: { $gte: new Date() },
    })
    .populate({ path: "payments" });

  if (!activeSubscription) {
    return null;
  }

  const jsonSubscription = activeSubscription.toObject() as any;
  // Attach the derived per-pack top-up view (expired excluded); hide the raw ledger.
  jsonSubscription.active_top_ups = computeVoiceBalance(
    activeSubscription as any
  ).activeTopUps;
  delete jsonSubscription.top_ups;
  const isPaidByStripe =
    activeSubscription.payment_meta_data?.provider == PaymentProvider.STRIPE;

  // Normalize Subscription Details
  //
  // Stripe
  //
  if (isPaidByStripe) {
    const stripeAdapter = PaymentAdapterFactory.getStripeAdapter();

    const { label, subscription_id } =
      activeSubscription.payment_meta_data?.stripe;

    jsonSubscription["label"] = label;

    try {
      const subscriptionDetails = await stripeAdapter.getSubscriptionDetails(
        subscription_id
      );

      const portalSession =
        await stripeAdapter.stripe.billingPortal.sessions.create({
          customer: subscriptionDetails.customer.toString(),
          return_url: `${process.env.DASHBOARD_BASE_URL}/#/settings/subscription`,
        });

      jsonSubscription["status"] = subscriptionDetails.status;
      jsonSubscription["portal_url"] = portalSession.url;
    } catch (error: any) {
      // The Stripe customer/subscription is gone (e.g. deleted out-of-band).
      // Our record is stale — mark it canceled and report no active
      // subscription instead of failing the whole request.
      if (error?.code === "resource_missing") {
        console.warn(
          `[subscription] Stripe object missing for ${subscription_id}; marking local subscription canceled`
        );
        await subscriptionsCollection.updateOne(
          { _id: activeSubscription._id },
          { $set: { status: "canceled" } }
        );
        return null;
      }
      throw error;
    }

    delete jsonSubscription.payments;
  }

  return jsonSubscription;
}

/**
 * Clear all subscriptions for a user (for testing purposes)
 */
export async function clearUserSubscriptions(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  const result = await subscriptionsCollection.deleteMany({
    user_id: Types.ObjectId(userId),
  });

  return {
    success: true,
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} subscription(s) for user ${userId}`,
  };
}

/**
 * Clear all freemium allocations for a user (for testing purposes)
 */
export async function clearUserFreemiumAllocations(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const freeCreditCollection = getCollection<FreeCredit>(
    DATABASE,
    FREE_CREDIT_COLLECTION
  );

  const result = await freeCreditCollection.deleteMany({
    user_id: Types.ObjectId(userId),
  });

  return {
    success: true,
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} freemium allocation(s) for user ${userId}`,
  };
}

/**
 * Clear all usage records for a user (for testing purposes)
 */
export async function clearUserUsageRecords(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);

  const result = await usageCollection.deleteMany({
    user_id: Types.ObjectId(userId),
  });

  return {
    success: true,
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} usage record(s) for user ${userId}`,
  };
}
