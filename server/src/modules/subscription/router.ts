import Router from "koa-router";
import { reply, getCollection } from "@modular-rest/server";
import { DATABASE } from "../../config";
import {
  SUBSCRIPTION_COLLECTION,
  DAILY_CREDITS_COLLECTION,
  USAGE_COLLECTION,
} from "./db";

const name = "subscription";
const subscription = new Router();

// Get current user's subscription status
subscription.get("/subscription/status", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    // Call the function directly from functions/index
    const { checkDailyAllocation } = require("./functions/index");
    const status = await checkDailyAllocation(userId);

    ctx.body = reply.create("s", status);
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to get subscription status",
    });
  }
});

// Add credits to a user's account
subscription.post("/subscription/add-credit", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    const { creditAmount, paymentDetails } = ctx.request.body;

    if (!creditAmount || creditAmount <= 0) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Invalid credit amount" });
      return;
    }

    if (!paymentDetails) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Payment details required" });
      return;
    }

    // Call the function directly from functions/index
    const { addCredit } = require("./functions/index");
    const result = await addCredit(userId, creditAmount, paymentDetails);

    ctx.body = reply.create("s", result);
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to add credit",
    });
  }
});

// Record conversation usage
subscription.post("/subscription/record-conversation", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    const { durationSeconds, modelType, complexity } = ctx.request.body;

    if (!durationSeconds || durationSeconds <= 0) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Invalid duration" });
      return;
    }

    if (!modelType) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Model type required" });
      return;
    }

    if (!complexity) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Complexity required" });
      return;
    }

    // Call the function directly from functions/index
    const { recordConversationUsage } = require("./functions/index");
    const result = await recordConversationUsage(
      userId,
      durationSeconds,
      modelType,
      complexity
    );

    ctx.body = reply.create("s", result);
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to record conversation usage",
    });
  }
});

// Record translation usage
subscription.post("/subscription/record-translation", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    const { characterCount, languagePair, contextType } = ctx.request.body;

    if (!characterCount || characterCount <= 0) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Invalid character count" });
      return;
    }

    if (!languagePair) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Language pair required" });
      return;
    }

    if (!contextType) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "Context type required" });
      return;
    }

    // Call the function directly from functions/index
    const { recordTranslationUsage } = require("./functions/index");
    const result = await recordTranslationUsage(
      userId,
      characterCount,
      languagePair,
      contextType
    );

    ctx.body = reply.create("s", result);
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to record translation usage",
    });
  }
});

// Get user's subscription history
subscription.get("/subscription/history", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    const subscriptionCollection = getCollection(
      DATABASE,
      SUBSCRIPTION_COLLECTION
    );

    const subscriptions = await subscriptionCollection
      .find({ user_id: userId }, { sort: { start_date: -1 } })
      .toArray();

    ctx.body = reply.create("s", { subscriptions });
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to get subscription history",
    });
  }
});

// Get user's usage history
subscription.get("/subscription/usage", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    const { startDate, endDate, serviceType } = ctx.query;

    const query: any = { user_id: userId };

    if (startDate) {
      query.timestamp = query.timestamp || {};
      query.timestamp.$gte = new Date(startDate as string);
    }

    if (endDate) {
      query.timestamp = query.timestamp || {};
      query.timestamp.$lte = new Date(endDate as string);
    }

    if (serviceType) {
      query.service_type = serviceType;
    }

    const usageCollection = getCollection(DATABASE, USAGE_COLLECTION);
    const usage = await usageCollection
      .find(query, { sort: { timestamp: -1 } })
      .toArray();

    // Calculate totals
    const totalCredits = usage.reduce(
      (sum: number, record: any) => sum + record.credit_amount,
      0
    );
    const totalTokens = usage.reduce(
      (sum: number, record: any) => sum + record.token_count,
      0
    );

    ctx.body = reply.create("s", {
      usage,
      totals: {
        creditAmount: totalCredits,
        tokenCount: totalTokens,
      },
    });
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to get usage history",
    });
  }
});

// Admin: Get all active subscriptions (requires admin permission)
subscription.get("/admin/subscriptions", async (ctx: any) => {
  try {
    if (!ctx.state.user || !ctx.state.user.isAdmin) {
      ctx.status = 403;
      ctx.body = reply.create("f", { error: "Admin privileges required" });
      return;
    }

    const subscriptionCollection = getCollection(
      DATABASE,
      SUBSCRIPTION_COLLECTION
    );
    const activeSubscriptions = await subscriptionCollection
      .find(
        { status: "active", end_date: { $gte: new Date() } },
        { sort: { end_date: 1 } }
      )
      .toArray();

    ctx.body = reply.create("s", { subscriptions: activeSubscriptions });
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to get active subscriptions",
    });
  }
});

// Admin: Update a user's subscription (requires admin permission)
subscription.put("/admin/subscription/:id", async (ctx: any) => {
  try {
    if (!ctx.state.user || !ctx.state.user.isAdmin) {
      ctx.status = 403;
      ctx.body = reply.create("f", { error: "Admin privileges required" });
      return;
    }

    const subscriptionId = ctx.params.id;
    const updates = ctx.request.body;

    // Sanitize updates to only allow certain fields to be updated
    const allowedUpdates = ["status", "end_date", "spendable_credits"];

    const sanitizedUpdates: any = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      ctx.status = 400;
      ctx.body = reply.create("f", { error: "No valid updates provided" });
      return;
    }

    const subscriptionCollection = getCollection(
      DATABASE,
      SUBSCRIPTION_COLLECTION
    );
    const result = await subscriptionCollection.findOneAndUpdate(
      { _id: subscriptionId },
      { $set: sanitizedUpdates },
      { returnDocument: "after" }
    );

    if (!result) {
      ctx.status = 404;
      ctx.body = reply.create("f", { error: "Subscription not found" });
      return;
    }

    ctx.body = reply.create("s", { subscription: result });
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to update subscription",
    });
  }
});

// Admin: Check and update expired subscriptions
subscription.post("/admin/check-expired-subscriptions", async (ctx: any) => {
  try {
    if (!ctx.state.user || !ctx.state.user.isAdmin) {
      ctx.status = 403;
      ctx.body = reply.create("f", { error: "Admin privileges required" });
      return;
    }

    // Call the function directly from functions/index
    const { checkAndUpdateExpiredSubscriptions } = require("./functions/index");
    const result = await checkAndUpdateExpiredSubscriptions();

    ctx.body = reply.create("s", result);
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to check expired subscriptions",
    });
  }
});

export { name };
export const main = subscription;
