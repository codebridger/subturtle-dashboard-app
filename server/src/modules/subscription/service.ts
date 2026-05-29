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
} from "../../config";
import { LOW_CREDITS_THRESHOLD, SOFT_CAP_PERCENT } from "./config";

import {
  emitLowCreditsEvent,
  emitSoftCapEvent,
  emitSubscriptionChangeEvent,
  emitSubscriptionExpiredEvent,
} from "./events";
import { Subscription, FreeCredit } from "./types";
import { TierId, Cadence, TierDefinition, getTierRegistry } from "./tiers";
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
 * The Starter tier from the Stripe-backed registry — the free allocation mirrors
 * it. Returns null if the registry can't be loaded (e.g. a Stripe cold-start
 * outage) so callers fall back to the config defaults instead of blocking free
 * signups.
 */
export async function getStarterTier(): Promise<TierDefinition | null> {
  try {
    return await getTierRegistry().getTier("starter");
  } catch (err: any) {
    console.error(
      "[subscription] Starter tier unavailable from Stripe; using freemium fallback defaults:",
      err?.message || err
    );
    return null;
  }
}

/**
 * Freemium allocation values, sourced from the Starter tier when available and
 * falling back to the config constants otherwise. A `null` (unlimited) Starter
 * cap on a gated free-tier feature falls back to the constant, since the
 * freemium pool tracks finite limits.
 */
async function getFreemiumDefaults() {
  const starter = await getStarterTier();
  return {
    credits: starter?.creditBudget ?? FREEMIUM_DEFAULT_CREDITS,
    saveWords: starter?.caps.save_words ?? FREEMIUM_DEFAULT_SAVE_WORDS,
    liveSessions:
      starter?.caps.live_conversations ?? FREEMIUM_DEFAULT_LIVED_SESSIONS,
    durationDays: starter?.durationDays ?? FREEMIUM_DURATION_DAYS,
  };
}

/**
 * Tier-aware gate: whether a freemium user may start one more live session under
 * the Starter tier's `live_conversations` cap (null = unlimited). Reads the used
 * counter from the allocation; does not consume a slot.
 */
export async function canStartFreemiumLiveSession(
  userId: string
): Promise<boolean> {
  const starter = await getStarterTier();
  const cap = starter
    ? starter.caps.live_conversations
    : FREEMIUM_DEFAULT_LIVED_SESSIONS;
  if (cap === null) return true; // unlimited live sessions on this tier
  const allocation = await getOrCreateFreemiumAllocation(userId);
  return (allocation.allowed_lived_sessions_used || 0) < cap;
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

  // If no active freemium allocation exists, create a new one — mirroring the
  // Starter tier read from Stripe (with config fallbacks).
  if (!freemiumAllocation) {
    const defaults = await getFreemiumDefaults();
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + defaults.durationDays);

    const newFreemiumAllocation = {
      user_id: Types.ObjectId(userId),
      start_date: startDate,
      end_date: endDate,
      total_credits: defaults.credits,
      credits_used: 0,
      allowed_save_words: defaults.saveWords,
      allowed_save_words_used: 0,
      allowed_lived_sessions: defaults.liveSessions,
      allowed_lived_sessions_used: 0,
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
    status,
    payment_meta_data: paymentMetaData,
    ...(tier && { tier }),
    ...(subscriptionType && { subscription_type: subscriptionType }),
    ...(priceId && { price_id: priceId }),
    ...(trialEndUnixTimestamp && {
      trial_end: new Date(trialEndUnixTimestamp * 1000),
    }),
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

  const currentStart = currentSubscription.start_date.getTime() / 1000;
  const currentEnd = currentSubscription.end_date.getTime() / 1000;
  const isSamePeriod =
    !!startDateUnixTimestamp &&
    !!endDateUnixTimestamp &&
    startDateUnixTimestamp === currentStart &&
    endDateUnixTimestamp === currentEnd;

  const update: any = { status };
  if (tier) update.tier = tier;
  if (subscriptionType) update.subscription_type = subscriptionType;
  if (priceId) update.price_id = priceId;
  update.cancel_at_period_end = !!cancelAtPeriodEnd;
  update.trial_end = trialEndUnixTimestamp
    ? new Date(trialEndUnixTimestamp * 1000)
    : null;

  if (!isSamePeriod) {
    // Billing period rolled over (renewal, or trial -> first paid period):
    // move the window and refill the credit budget for the new period.
    update.start_date = new Date(startDateUnixTimestamp * 1000);
    update.end_date = new Date(endDateUnixTimestamp * 1000);
    if (creditAmount !== undefined) {
      update.total_credits = creditAmount;
      update.credits_used = 0;
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
