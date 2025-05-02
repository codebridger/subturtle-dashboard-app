import { defineFunction, getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, SUBSCRIPTION_COLLECTION } from "../../config";
import { Subscription } from "./types";

/**
 * Get subscription details for a user
 */
const getSubscriptionDetails = defineFunction({
  name: "getSubscriptionDetails",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    try {
      const { userId } = params;

      if (!userId) {
        throw new Error("User ID is required");
      }

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
        return null;
      }

      const response = activeSubscription.toObject();
      return response;
    } catch (error: any) {
      throw new Error(
        error.message || "Failed to retrieve subscription details"
      );
    }
  },
});

module.exports.functions = [getSubscriptionDetails];
