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
} from "../../config";
import { LOW_CREDITS_THRESHOLD } from "./config";

import {
  emitLowCreditsEvent,
  emitSubscriptionChangeEvent,
  emitSubscriptionExpiredEvent,
} from "./events";
import { Subscription, FreeCredit } from "./types";
import { CostCalculationInput, calculatorService } from "./calculator";
import { PaymentAdapterFactory, PaymentProvider } from "../gateway/adapters";
import Stripe from "stripe";

/**
 * Get or create freemium allocation for a user
 */
export async function getOrCreateFreemiumAllocation(userId: string) {
  const freeCreditCollection = getCollection<FreeCredit>(
    DATABASE,
    FREE_CREDIT_COLLECTION
  );

  // Try to find existing active freemium allocation
  let freemiumAllocation = (await freeCreditCollection.findOne({
    user_id: Types.ObjectId(userId),
    end_date: { $gte: new Date() },
  })) as FreeCredit | null;

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
    };

    freemiumAllocation = (await freeCreditCollection.create(
      newFreemiumAllocation
    )) as FreeCredit;
  }

  return freemiumAllocation;
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
    credits_used?: number;
  };
}) {
  const { userId, increment } = options;

  const freeCreditCollection = getCollection<FreeCredit>(
    DATABASE,
    FREE_CREDIT_COLLECTION
  );

  const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);

  const updatedFreemiumAllocation = await freeCreditCollection.updateOne(
    { _id: freemiumAllocation._id },
    { $inc: increment }
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
  const activeSubscription = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  })) as Subscription | null;

  let availableCredits = 0;
  let subscriptionEndsAt: Date;
  let isFreemium = false;

  if (activeSubscription) {
    // User has active paid subscription
    availableCredits = activeSubscription.available_credit || 0;
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
}) {
  const {
    userId,
    creditAmount,
    totalDays,
    startDateUnixTimestamp,
    endDateUnixTimestamp,
    paymentMetaData,
  } = props;
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  if ((startDateUnixTimestamp || endDateUnixTimestamp) && totalDays) {
    throw new Error(
      "Cannot provide both startDateUnixTimestamp and endDateUnix Timestamp and totalDays"
    );
  }

  // Deactivate all previous subscriptions for the user
  await subscriptionsCollection.updateMany(
    { user_id: Types.ObjectId(userId), status: "active" },
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

  const newSubscription = {
    user_id: Types.ObjectId(userId),
    start_date: startDate,
    end_date: endDate,
    total_credits: creditAmount,
    credits_used: 0,
    status: "active",
    payment_meta_data: paymentMetaData,
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
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to cancel subscription",
    };
  }
}

export async function updateSubscriptionStatusByProviderAndSubscriptionId(props: {
  provider: PaymentProvider;
  subscriptionId: string;
  status: Stripe.Subscription.Status;
  startDateUnixTimestamp: number;
  endDateUnixTimestamp: number;
}) {
  const {
    provider,
    subscriptionId,
    status,
    startDateUnixTimestamp,
    endDateUnixTimestamp,
  } = props;

  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  const filter: any = {
    "payment_meta_data.provider": provider,
    status: "active",
  };

  if (provider == PaymentProvider.STRIPE) {
    filter["payment_meta_data.stripe.subscription_id"] = subscriptionId;
  }

  const currentSubscription = await subscriptionsCollection.findOne(filter);

  if (currentSubscription) {
    const currentStartTimeUnixTimestamp =
      currentSubscription.start_date.getTime() / 1000;
    const currentEndTimeUnixTimestamp =
      currentSubscription.end_date.getTime() / 1000;

    let isSamePeriod = false;

    if (startDateUnixTimestamp && endDateUnixTimestamp) {
      isSamePeriod =
        startDateUnixTimestamp === currentStartTimeUnixTimestamp &&
        endDateUnixTimestamp === currentEndTimeUnixTimestamp;
    }

    if (isSamePeriod) {
      await subscriptionsCollection.updateOne(filter, {
        $set: {
          status,
        },
      });
    } else {
      await subscriptionsCollection.updateOne(filter, {
        $set: {
          status,
          start_date: new Date(startDateUnixTimestamp * 1000),
          end_date: new Date(endDateUnixTimestamp * 1000),
        },
      });
    }

    return {
      success: true,
      message: "Subscription updated successfully",
    };
  } else {
    return {
      success: false,
      message: "Subscription not found",
    };
  }
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
  const activeSubscription = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: "active",
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

    remainingCredits = updatedFreemiumAllocation
      ? (updatedFreemiumAllocation.total_credits || 0) -
        (updatedFreemiumAllocation.credits_used || 0)
      : 0;
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

    remainingCredits = updatedSubscription
      ? updatedSubscription.available_credit || 0
      : 0;
  }

  // Check if credits are low and emit event if needed
  if (remainingCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, remainingCredits);
  }

  return {
    remainingCredits,
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
    delete jsonSubscription.payments;
  }

  return jsonSubscription;
}
