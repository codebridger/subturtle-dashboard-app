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

  if (!activeSubscription) {
    return {
      availableCredits: 0,
      allowedToProceed: false,
    };
  }

  // Calculate available credits directly from the subscription
  const availableCredits = activeSubscription.available_credit || 0;

  const allowedToProceed =
    availableCredits >= (minCredits || LOW_CREDITS_THRESHOLD);

  // Check if credits are low and emit event if needed
  if (!allowedToProceed) {
    emitLowCreditsEvent(userId, availableCredits);
  }

  return {
    availableCredits,
    subscriptionEndsAt: activeSubscription.end_date,
    allowedToProceed,
  };
}

/**
 * Add credits to a user's account
 */
export async function addNewSubscriptionWithCredit(props: {
  userId: string;
  creditAmount: number;
  totalDays: number;
  payment_id: any;
}) {
  const { userId, creditAmount, totalDays, payment_id } = props;
  const subscriptionsCollection = getCollection<Subscription>(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  // Deactivate all previous subscriptions for the user
  await subscriptionsCollection.updateMany(
    { user_id: Types.ObjectId(userId), status: "active" },
    { $set: { status: "expired" } }
  );

  // Always create a new subscription
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
    payments: [payment_id],
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

  // Check if credits are low and emit event if needed
  if (remainingCredits < LOW_CREDITS_THRESHOLD) {
    emitLowCreditsEvent(userId, remainingCredits);
  }

  return {
    remainingCredits,
    usageId: usageRecord._id,
    status: availableCredits < creditAmount ? "overdraft" : "paid",
    costResult,
  };
}
