import { defineFunction, getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, SUBSCRIPTION_COLLECTION } from "../../config";
import { Subscription, SubscriptionPlan } from "./types";
import { Payment } from "../gateway/types";

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

      const activeSubscription = await subscriptionsCollection
        .findOne({
          user_id: Types.ObjectId(userId),
          status: "active",
          end_date: { $gte: new Date() },
        })
        .populate({ path: "payments" });

      if (!activeSubscription) {
        return null;
      }

      // Normalize Subscription Details
      const label = (activeSubscription.payments?.[0] as Payment).provider_data
        ?.metadata.label as string;

      const response = activeSubscription.toObject() as any;
      delete response.payments;
      response["label"] = label;

      return response;
    } catch (error: any) {
      throw new Error(
        error.message || "Failed to retrieve subscription details"
      );
    }
  },
});

const getSubscriptionPlans = defineFunction({
  name: "getSubscriptionPlans",
  permissionTypes: ["anonymous_access"],
  callback: async (_params) => {
    const plans: SubscriptionPlan[] = [
      {
        name: "freemium",
        price: "0",
        currency: "£",
        description: "Great for casual learners",
        features: [
          "Translate captions in real time",
          "Save up to 30 words or phrases",
          "Review vocabulary on your dashboard",
          "Flashcards (limited to 10/month)",
          "Al Coach (up to 3 sessions/month)",
        ],
        product_id: "freemium",
        is_freemium: true,
      },
      {
        name: "premium",
        price: "7.60",
        currency: "£",
        description: "Ideal for focused learners",
        features: [
          "Unlimited saves & bundle creation",
          "Unlimited flashcard reviews",
          "Unlimited Al speaking practice",
          "Weekly progress insights",
          "Early access to new platforms & features",
        ],
        product_id: "prod_S4nM68SkuYEHxm",
        is_freemium: false,
      },
      // {
      //   name: "pro",
      //   price: "10",
      //   currency: "£",
      //   description: "Built for power users and perfectionists",
      //   features: [
      //     "Priority support and feedback response",
      //     "Custom Al coach tuning based on learning goals",
      //     "Progress export and personalized learning reports",
      //     "Early access to grammar insights & learning tools",
      //   ],
      //   product_id: "pro",
      //   is_freemium: false,
      // },
    ];

    return plans;
  },
});

module.exports.functions = [getSubscriptionDetails, getSubscriptionPlans];
