import { defineFunction, reply } from "@modular-rest/server";
import {
  clearUserSubscriptions,
  clearUserFreemiumAllocations,
  clearUserUsageRecords,
} from "../subscription/service";

/**
 * Remove subscription and freemium allocation for a user
 * It's for testing purposes
 */
const clearSubscriptionAndFreemium = defineFunction({
  name: "clearSubscriptionAndFreemium",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    const { userId } = params;

    // A testing tool: it deletes the user's subscription records, free allocation and usage,
    // so in production it would hand out unlimited free usage. Local servers (NODE_ENV other
    // than production, e.g. the agent tests) always allow it; deployed dev opts in through
    // PROFILE_RESET_ENABLED=true (infra/deploy-api.sh).
    if (process.env.NODE_ENV === "production" && process.env.PROFILE_RESET_ENABLED !== "true") {
      throw new Error("Profile reset is disabled in production.");
    }

    if (!userId) {
      throw new Error("User ID is required");
    }

    try {
      // Clear all subscription data for the user
      const subscriptionResult = await clearUserSubscriptions(userId);
      console.log("Subscription clearing result:", subscriptionResult);

      // Clear all freemium allocations for the user
      const freemiumResult = await clearUserFreemiumAllocations(userId);
      console.log("Freemium clearing result:", freemiumResult);

      // Clear all usage records for the user
      const usageResult = await clearUserUsageRecords(userId);
      console.log("Usage records clearing result:", usageResult);

      reply.create("s", {
        message: "Successfully cleared subscription and freemium data for user",
        details: {
          subscriptions: subscriptionResult,
          freemium: freemiumResult,
          usage: usageResult,
        },
      });
    } catch (error: any) {
      reply.create("e", {
        message: `Failed to clear data: ${error.message}`,
      });
    }
  },
});

module.exports.functions = [clearSubscriptionAndFreemium];
