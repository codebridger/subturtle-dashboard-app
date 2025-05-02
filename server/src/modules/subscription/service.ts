import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  SUBSCRIPTION_COLLECTION,
  USAGE_COLLECTION,
} from "../../config";
import { LOW_CREDITS_THRESHOLD } from "./config";

import {
  emitLowCreditsEvent,
  emitSubscriptionChangeEvent,
  emitSubscriptionExpiredEvent,
  emitSubscriptionRenewedEvent,
} from "./events";
import { Subscription } from "./types";
import { CostCalculationInput, calculatorService } from "./calculator";

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
        totalCredits: { $sum: "$credit_used" },
      },
    },
  ]);

  const results = await monthlyUsageResult;
  return results.length > 0 ? results[0].totalCredits : 0;
}

/**
 * Check credit allocation for a user
 */
export async function checkCreditAllocation(userId: string) {
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

  if (!activeSubscription) {
    return {
      availableCredits: 0,
      allowedServices: [],
      hasActiveSubscription: false,
    };
  }

  // Calculate available credits directly from the subscription
  const availableCredits = activeSubscription.available_credit || 0;

  // Check if credits are low and emit event if needed
  if (availableCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, availableCredits);
  }

  return {
    availableCredits,
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
        },
      },
      { new: true }
    );

    // Emit subscription renewed event
    emitSubscriptionRenewedEvent(userId, updatedSubscription?._id, newEndDate);
  } else {
    // Create new subscription
    // Set end date based on totalDays parameter
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);

    const newSubscription = {
      user_id: Types.ObjectId(userId),
      start_date: startDate,
      end_date: endDate,
      total_credits: creditAmount,
      credits_used: 0,
      status: "active",
    };

    updatedSubscription = await subscriptionsCollection.create(newSubscription);
    isNew = true;

    // Emit subscription change event for new subscription
    emitSubscriptionChangeEvent(userId, updatedSubscription._id, "new", {
      creditAmount,
      endDate,
    });
  }

  // Calculate remaining credits
  const remainingCredits = updatedSubscription?.available_credit || 0;

  return {
    subscriptionId: updatedSubscription?._id,
    expirationDate: updatedSubscription?.end_date,
    creditBalance: remainingCredits,
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
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = (await subscriptionsCollection.findOne({
    user_id: Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  })) as Subscription | null;

  if (!activeSubscription) {
    // Even without active subscription, record the usage but flag as unpaid
    const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
    const newUsage = {
      user_id: Types.ObjectId(userId),
      subscription_id: null,
      service_type: serviceType,
      credit_used: creditAmount,
      token_count: tokenCount,
      model_used: modelUsed,
      status: "unpaid",
      details: {
        ...details,
        costBreakdown: costResult.items,
      },
    };

    const usageRecord = await usageCollection.create(newUsage);

    // No credits available
    return {
      remainingCredits: 0,
      usageId: usageRecord._id,
      totalUsage: creditAmount,
      status: "unpaid",
      costResult,
    };
  }

  // Calculate available credits
  const availableCredits = activeSubscription.available_credit || 0;

  // Record usage in database regardless of available credits
  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
  const newUsage = {
    user_id: Types.ObjectId(userId),
    subscription_id: activeSubscription._id,
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

  // Update subscription's credits_used
  await subscriptionsCollection.updateOne(
    { _id: activeSubscription._id },
    { $inc: { credits_used: creditAmount } }
  );

  // Get updated subscription
  const updatedSubscription = (await subscriptionsCollection.findOne({
    _id: activeSubscription._id,
  })) as Subscription | null;

  const remainingCredits = updatedSubscription
    ? updatedSubscription.available_credit || 0
    : 0;

  // Get total usage
  const totalUsage = await getMonthlyUsage(userId);

  // Check if credits are low and emit event if needed
  if (remainingCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, remainingCredits);
  }

  return {
    remainingCredits,
    usageId: usageRecord._id,
    totalUsage,
    status: availableCredits < creditAmount ? "overdraft" : "paid",
    costResult,
  };
}
