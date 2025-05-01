import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  SUBSCRIPTION_COLLECTION,
  DAILY_CREDITS_COLLECTION,
  USAGE_COLLECTION,
} from "../../config";
import {
  SPENDABLE_PORTION,
  SYSTEM_PORTION,
  LOW_CREDITS_THRESHOLD,
} from "./config";

import {
  emitLowCreditsEvent,
  emitSubscriptionChangeEvent,
  emitSubscriptionExpiredEvent,
  emitSubscriptionRenewedEvent,
} from "./events";
import { DailyCredits, Subscription } from "./types";
import { CostCalculationInput, calculatorService } from "./calculator";

/**
 * Helper function to get or create daily credits record
 */
async function getOrCreateDailyCredits(
  subscriptionId: any,
  shouldCalculateRollover = true
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyCreditsCollection = getCollection<DailyCredits>(
    DATABASE,
    DAILY_CREDITS_COLLECTION
  );

  // Try to find existing daily credits record
  const dailyCredits = await dailyCreditsCollection.findOne({
    subscription_id: subscriptionId,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  // If found, return it
  if (dailyCredits) {
    return dailyCredits;
  }

  // Get the subscription to calculate daily allocation
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const subscription = await subscriptionsCollection.findOne({
    _id: subscriptionId,
  });

  if (!subscription) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }

  // Calculate daily allocation
  const subscriptionDays = Math.ceil(
    (subscription.end_date.getTime() - subscription.start_date.getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const dailyAllocation = subscription.spendable_credits / subscriptionDays;

  // Calculate rollover credits if needed
  let rolledOverCredits = 0;

  if (shouldCalculateRollover) {
    // Find the most recent daily credits record to get rolled over credits
    const previousCredits = await dailyCreditsCollection
      .find({
        subscription_id: subscriptionId,
        date: { $lt: today },
      })
      .sort({ date: -1 })
      .limit(1);

    // Calculate rollover credits from previous day if exists
    const previousCreditsArray = await previousCredits;
    rolledOverCredits = previousCreditsArray.length
      ? Math.max(
          0,
          previousCreditsArray[0].daily_credit_limit +
            previousCreditsArray[0].credits_rolled_over -
            previousCreditsArray[0].credits_used
        )
      : 0;
  }

  // Create new daily credits record
  const newDailyCredits = {
    subscription_id: subscriptionId,
    date: today,
    daily_credit_limit: dailyAllocation,
    credits_used: 0,
    credits_rolled_over: rolledOverCredits,
  };

  return await dailyCreditsCollection.create(newDailyCredits);
}

/**
 * Check the daily credit allocation for a user
 */
export async function checkDailyAllocation(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get active subscription for user
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  });

  if (!activeSubscription) {
    return {
      availableCredits: 0,
      allowedServices: [],
      hasActiveSubscription: false,
    };
  }

  // Get or create daily credits record
  const dailyCredits = await getOrCreateDailyCredits(activeSubscription._id);

  // Calculate available credits
  const availableCredits =
    dailyCredits.daily_credit_limit +
    dailyCredits.credits_rolled_over -
    dailyCredits.credits_used;

  // Check if credits are low and emit event if needed
  if (availableCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, availableCredits);
  }

  // Determine allowed services based on available credits
  // This is a simplified example - real implementation would have more sophisticated logic
  const allowedServices = [];
  if (availableCredits > 0) {
    allowedServices.push("conversation");
    if (availableCredits > 10) allowedServices.push("translation");
    if (availableCredits > 50) allowedServices.push("premium_models");
  }

  return {
    availableCredits,
    allowedServices,
    hasActiveSubscription: true,
    subscriptionEndsAt: activeSubscription.end_date,
  };
}

/**
 * Add credits to a user's account
 */
export async function addCredit(
  userId: string,
  creditAmount: number,
  totalDays: number,
  paymentDetails: any
) {
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  // Get current active subscription if exists
  const activeSubscription = await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  });

  let updatedSubscription;
  let isNew = false;

  if (activeSubscription) {
    // Update existing subscription
    const systemAmount = creditAmount * SYSTEM_PORTION;
    const spendableCredits = creditAmount * SPENDABLE_PORTION;

    // Extend existing subscription by totalDays
    const newEndDate = new Date(activeSubscription.end_date);
    newEndDate.setDate(newEndDate.getDate() + totalDays);

    updatedSubscription = await subscriptionsCollection.findOneAndUpdate(
      { _id: activeSubscription._id },
      {
        $set: {
          end_date: newEndDate,
        },
        $inc: {
          total_credits: creditAmount,
          system_portion: systemAmount,
          spendable_credits: spendableCredits,
        },
      },
      { returnDocument: "after" }
    );

    // Emit subscription renewed event
    emitSubscriptionRenewedEvent(userId, updatedSubscription?._id, newEndDate);
  } else {
    // Create new subscription
    const systemAmount = creditAmount * SYSTEM_PORTION;
    const spendableCredits = creditAmount * SPENDABLE_PORTION;

    // Set end date based on totalDays parameter
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);

    const newSubscription = {
      user_id: Types.ObjectId(userId),
      start_date: startDate,
      end_date: endDate,
      total_credits: creditAmount,
      system_portion: systemAmount,
      spendable_credits: spendableCredits,
      status: "active",
    };

    updatedSubscription = await subscriptionsCollection.create(newSubscription);
    isNew = true;

    // Create initial daily credits record
    const dailyCredits = await getOrCreateDailyCredits(updatedSubscription._id);

    // Emit subscription change event for new subscription
    emitSubscriptionChangeEvent(userId, updatedSubscription._id, "new", {
      creditAmount,
      endDate,
    });
  }

  return {
    subscriptionId: updatedSubscription?._id,
    expirationDate: updatedSubscription?.end_date,
    creditBalance: updatedSubscription?.spendable_credits,
    isNewSubscription: isNew,
  };
}

/**
 * Check for expired subscriptions and update their status
 */
export async function checkAndUpdateExpiredSubscriptions() {
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  // Find subscriptions that have expired but still have 'active' status
  const now = new Date();
  const expiredSubscriptionsQuery = subscriptionsCollection.find({
    status: "active",
    end_date: { $lt: now },
  });

  const expiredSubscriptions = await expiredSubscriptionsQuery;

  // Update each expired subscription
  for (const subscription of expiredSubscriptions) {
    await subscriptionsCollection.updateOne(
      { _id: subscription._id },
      { $set: { status: "expired" } }
    );

    // Emit subscription expired event
    emitSubscriptionExpiredEvent(
      subscription.user_id.toString(),
      subscription._id
    );
  }

  return { expiredCount: expiredSubscriptions.length };
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
  const subscriptionsCollection = getCollection(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  });

  if (!activeSubscription) {
    // Even without active subscription, record the usage but flag as unpaid
    const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
    const newUsage = {
      user_id: Types.ObjectId(userId),
      subscription_id: null,
      service_type: serviceType,
      credit_amount: creditAmount,
      token_count: tokenCount,
      model_used: modelUsed,
      status: "unpaid",
      costBreakdown: {
        ...details,
        costBreakdown: costResult.items,
      },
    };

    const usageRecord = await usageCollection.create(newUsage);

    // No credits available
    return {
      remainingCredits: 0,
      usageId: usageRecord._id,
      totalUsageToday: creditAmount,
      totalUsageMonth: await getMonthlyUsage(userId),
      status: "unpaid",
      costResult,
    };
  }

  // Get or create daily credits record
  const dailyCredits = await getOrCreateDailyCredits(activeSubscription._id);

  // Calculate available credits
  const availableCredits =
    dailyCredits.daily_credit_limit +
    dailyCredits.credits_rolled_over -
    dailyCredits.credits_used;

  // Record usage in database regardless of available credits
  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
  const newUsage = {
    user_id: Types.ObjectId(userId),
    subscription_id: activeSubscription._id,
    service_type: serviceType,
    credit_amount: creditAmount,
    token_count: tokenCount,
    model_used: modelUsed,
    status: availableCredits < creditAmount ? "overdraft" : "paid",
    details: {
      ...details,
      costBreakdown: costResult.items,
    },
  };

  const usageRecord = await usageCollection.create(newUsage);

  // Update daily credits usage
  const dailyCreditsCollection = getCollection<DailyCredits>(
    DATABASE,
    DAILY_CREDITS_COLLECTION
  );
  await dailyCreditsCollection.updateOne(
    { _id: dailyCredits._id },
    { $inc: { credits_used: creditAmount } }
  );

  // Get updated daily credits
  const updatedDailyCredits = await dailyCreditsCollection.findOne({
    _id: dailyCredits._id,
  });

  const remainingCredits =
    updatedDailyCredits?.daily_credit_limit! +
    updatedDailyCredits?.credits_rolled_over! -
    updatedDailyCredits?.credits_used!;

  // Get usage statistics
  const totalUsageToday = updatedDailyCredits?.credits_used;
  const totalUsageMonth = await getMonthlyUsage(userId);

  // Check if credits are low and emit event if needed
  if (remainingCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, remainingCredits);
  }

  return {
    remainingCredits,
    usageId: usageRecord._id,
    totalUsageToday,
    totalUsageMonth,
    status: availableCredits < creditAmount ? "overdraft" : "paid",
    costResult,
  };
}

async function getMonthlyUsage(userId: string): Promise<number> {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
  const monthlyUsageResult = await usageCollection.aggregate([
    {
      $match: {
        user_id: Types.ObjectId(userId),
        timestamp: { $gte: firstDayOfMonth },
      },
    },
    {
      $group: {
        _id: null,
        totalCredits: { $sum: "$credit_amount" },
      },
    },
  ]);

  const results = await monthlyUsageResult;
  return results.length > 0 ? results[0].totalCredits : 0;
}
