import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE } from "../../config";
import {
  SUBSCRIPTION_COLLECTION,
  DAILY_CREDITS_COLLECTION,
  USAGE_COLLECTION,
} from "./db";
import {
  emitLowCreditsEvent,
  emitSubscriptionChangeEvent,
  emitUsageSpikeEvent,
  emitSubscriptionExpiredEvent,
  emitSubscriptionRenewedEvent,
} from "./events";

/**
 * Check the daily credit allocation for a user
 */
export async function checkDailyAllocation(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get active subscription for user
  const subscriptionsCollection = getCollection(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = await subscriptionsCollection.findOne({
    user_id: new Types.ObjectId(userId),
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
  const dailyCreditsCollection = getCollection(
    DATABASE,
    DAILY_CREDITS_COLLECTION
  );
  let dailyCredits = await dailyCreditsCollection.findOne({
    subscription_id: activeSubscription._id,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  // Calculate daily allocation
  const subscriptionDays = Math.ceil(
    (activeSubscription.end_date.getTime() -
      activeSubscription.start_date.getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const dailyAllocation =
    activeSubscription.spendable_credits / subscriptionDays;

  if (!dailyCredits) {
    // Find the most recent daily credits record to get rolled over credits
    const previousCredits = await dailyCreditsCollection
      .find({
        subscription_id: activeSubscription._id,
        date: { $lt: today },
      })
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    // Calculate rollover credits from previous day if exists
    const rolledOverCredits = previousCredits.length
      ? Math.max(
          0,
          previousCredits[0].daily_credit_limit +
            previousCredits[0].credits_rolled_over -
            previousCredits[0].credits_used
        )
      : 0;

    // Create new daily credits record
    const newDailyCredits = {
      subscription_id: activeSubscription._id,
      date: today,
      daily_credit_limit: dailyAllocation,
      credits_used: 0,
      credits_rolled_over: rolledOverCredits,
    };

    const createdRecord = await dailyCreditsCollection.create(newDailyCredits);

    dailyCredits = createdRecord;
  }

  // Calculate available credits
  const availableCredits =
    dailyCredits.daily_credit_limit +
    dailyCredits.credits_rolled_over -
    dailyCredits.credits_used;

  // Check if credits are low and emit event if needed
  if (availableCredits < 10) {
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
  const subscriptionsCollection = getCollection(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  // Get current active subscription if exists
  const activeSubscription = await subscriptionsCollection.findOne({
    user_id: new Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  });

  // Define default allocation percentages
  const systemBenefitPortion = 0.2; // 20% for platform costs
  const serviceCostPortion = 0.3; // 30% for operational expenses
  const spendablePortion = 0.5; // 50% available for service consumption

  let updatedSubscription;
  let isNew = false;

  if (activeSubscription) {
    // Update existing subscription
    const systemBenefit = creditAmount * systemBenefitPortion;
    const serviceCost = creditAmount * serviceCostPortion;
    const spendableCredits = creditAmount * spendablePortion;

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
          system_benefit_portion: systemBenefit,
          service_cost_portion: serviceCost,
          spendable_credits: spendableCredits,
        },
      },
      { returnDocument: "after" }
    );

    // Emit subscription renewed event
    emitSubscriptionRenewedEvent(userId, updatedSubscription._id, newEndDate);
  } else {
    // Create new subscription
    const systemBenefit = creditAmount * systemBenefitPortion;
    const serviceCost = creditAmount * serviceCostPortion;
    const spendableCredits = creditAmount * spendablePortion;

    // Set end date based on totalDays parameter
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);

    const newSubscription = {
      user_id: new Types.ObjectId(userId),
      start_date: startDate,
      end_date: endDate,
      total_credits: creditAmount,
      system_benefit_portion: systemBenefit,
      service_cost_portion: serviceCost,
      spendable_credits: spendableCredits,
      status: "active",
    };

    updatedSubscription = await subscriptionsCollection.create(newSubscription);
    isNew = true;

    // Create initial daily credits record
    const subscriptionDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const dailyAllocation = spendableCredits / subscriptionDays;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyCreditsCollection = getCollection(
      DATABASE,
      DAILY_CREDITS_COLLECTION
    );

    const newDailyCredit = {
      subscription_id: updatedSubscription._id,
      date: today,
      daily_credit_limit: dailyAllocation,
      credits_used: 0,
      credits_rolled_over: 0,
    };

    await dailyCreditsCollection.create(newDailyCredit);

    // Emit subscription change event for new subscription
    emitSubscriptionChangeEvent(userId, updatedSubscription._id, "new", {
      creditAmount,
      endDate,
    });
  }

  return {
    subscriptionId: updatedSubscription._id,
    expirationDate: updatedSubscription.end_date,
    creditBalance: updatedSubscription.spendable_credits,
    isNewSubscription: isNew,
  };
}

/**
 * Record usage of conversation service
 */
export async function recordConversationUsage(
  userId: string,
  durationSeconds: number,
  modelType: string,
  complexity: string
) {
  // Calculate credit cost based on parameters
  const baseCost = 1; // Base cost per minute
  const modelMultiplier = getModelMultiplier(modelType);
  const complexityMultiplier = getComplexityMultiplier(complexity);

  // Convert seconds to minutes and calculate credit cost
  const durationMinutes = durationSeconds / 60;
  const creditCost =
    baseCost * durationMinutes * modelMultiplier * complexityMultiplier;
  const tokenCount = Math.floor(durationSeconds * 2.5); // Simplified token calculation

  // Check for usage spike
  if (durationMinutes > 10) {
    emitUsageSpikeEvent(userId, "conversation", durationMinutes, 10);
  }

  return await recordUsage(
    userId,
    "conversation",
    creditCost,
    tokenCount,
    modelType,
    {
      durationSeconds,
      complexity,
    }
  );
}

/**
 * Record usage of translation service
 */
export async function recordTranslationUsage(
  userId: string,
  characterCount: number,
  languagePair: string,
  contextType: string
) {
  // Calculate credit cost based on parameters
  const baseCost = 0.1; // Base cost per 1000 characters
  const languageMultiplier = getLanguageMultiplier(languagePair);
  const contextMultiplier = getContextMultiplier(contextType);

  // Calculate credit cost
  const creditCost =
    baseCost * (characterCount / 1000) * languageMultiplier * contextMultiplier;
  const tokenCount = Math.floor(characterCount / 4); // Simplified token calculation

  // Check for usage spike
  if (characterCount > 10000) {
    emitUsageSpikeEvent(userId, "translation", characterCount, 10000);
  }

  return await recordUsage(
    userId,
    "translation",
    creditCost,
    tokenCount,
    "translation_model",
    {
      characterCount,
      languagePair,
      contextType,
    }
  );
}

/**
 * Check for expired subscriptions and update their status
 */
export async function checkAndUpdateExpiredSubscriptions() {
  const subscriptionsCollection = getCollection(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );

  // Find subscriptions that have expired but still have 'active' status
  const now = new Date();
  const expiredSubscriptions = await subscriptionsCollection
    .find({
      status: "active",
      end_date: { $lt: now },
    })
    .toArray();

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
async function recordUsage(
  userId: string,
  serviceType: string,
  creditAmount: number,
  tokenCount: number,
  modelUsed: string,
  details: any
) {
  // Round to 2 decimal places to avoid floating point issues
  creditAmount = Math.round(creditAmount * 100) / 100;

  // Get active subscription
  const subscriptionsCollection = getCollection(
    DATABASE,
    SUBSCRIPTION_COLLECTION
  );
  const activeSubscription = await subscriptionsCollection.findOne({
    user_id: new Types.ObjectId(userId),
    status: "active",
    end_date: { $gte: new Date() },
  });

  if (!activeSubscription) {
    throw new Error("No active subscription found");
  }

  // Get today's daily credits record
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyCreditsCollection = getCollection(
    DATABASE,
    DAILY_CREDITS_COLLECTION
  );
  const dailyCredits = await dailyCreditsCollection.findOne({
    subscription_id: activeSubscription._id,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  if (!dailyCredits) {
    throw new Error("No daily credits record found");
  }

  // Check if user has enough credits
  const availableCredits =
    dailyCredits.daily_credit_limit +
    dailyCredits.credits_rolled_over -
    dailyCredits.credits_used;

  if (availableCredits < creditAmount) {
    throw new Error("Insufficient credits");
  }

  // Record usage in database
  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
  const newUsage = {
    user_id: new Types.ObjectId(userId),
    subscription_id: activeSubscription._id,
    service_type: serviceType,
    credit_amount: creditAmount,
    token_count: tokenCount,
    model_used: modelUsed,
    timestamp: new Date(),
    session_id: new Types.ObjectId(),
    details,
  };

  const usageRecord = await usageCollection.create(newUsage);

  // Update daily credits usage
  await dailyCreditsCollection.updateOne(
    { _id: dailyCredits._id },
    { $inc: { credits_used: creditAmount } }
  );

  // Get updated daily credits
  const updatedDailyCredits = await dailyCreditsCollection.findOne({
    _id: dailyCredits._id,
  });
  const remainingCredits =
    updatedDailyCredits.daily_credit_limit +
    updatedDailyCredits.credits_rolled_over -
    updatedDailyCredits.credits_used;

  // Get usage statistics
  const totalUsageToday = updatedDailyCredits.credits_used;
  const totalUsageMonth = await getMonthlyUsage(userId);

  // Check if credits are low and emit event if needed
  if (remainingCredits < 10) {
    emitLowCreditsEvent(userId, remainingCredits);
  }

  return {
    remainingCredits,
    usageId: usageRecord._id,
    totalUsageToday,
    totalUsageMonth,
  };
}

// Helper functions
function getModelMultiplier(modelType: string): number {
  // Cost multiplier based on model complexity
  switch (modelType) {
    case "basic":
      return 1;
    case "standard":
      return 1.5;
    case "premium":
      return 2.5;
    default:
      return 1;
  }
}

function getComplexityMultiplier(complexity: string): number {
  // Cost multiplier based on conversation complexity
  switch (complexity) {
    case "low":
      return 0.8;
    case "medium":
      return 1;
    case "high":
      return 1.5;
    default:
      return 1;
  }
}

function getLanguageMultiplier(languagePair: string): number {
  // Cost multiplier based on language pair complexity
  // Common languages are cheaper, rare languages are more expensive
  if (languagePair.includes("en")) {
    return 1;
  } else if (
    languagePair.includes("zh") ||
    languagePair.includes("ja") ||
    languagePair.includes("ar")
  ) {
    return 1.5;
  } else {
    return 1.2;
  }
}

function getContextMultiplier(contextType: string): number {
  // Cost multiplier based on context type
  switch (contextType) {
    case "chat":
      return 0.8;
    case "document":
      return 1;
    case "technical":
      return 1.3;
    default:
      return 1;
  }
}

async function getMonthlyUsage(userId: string): Promise<number> {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
  const monthlyUsageResult = await usageCollection.aggregate([
    {
      $match: {
        user_id: new Types.ObjectId(userId),
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

  return monthlyUsageResult.length > 0 ? monthlyUsageResult[0].totalCredits : 0;
}
