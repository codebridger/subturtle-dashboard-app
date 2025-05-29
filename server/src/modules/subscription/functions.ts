import { defineFunction } from "@modular-rest/server";

import { SubscriptionPlan } from "./types";

import { getSubscription, getOrCreateFreemiumAllocation } from "./service";
import { paymentAdapterFactory, PaymentProvider } from "../gateway/adapters";
import { StripeAdapter } from "../gateway/adapters/stripe.adapter";

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

      const subscription = await getSubscription(userId);

      if (!subscription) {
        const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);
        return {
          ...freemiumAllocation,
          is_freemium: true,
        };
      } else {
        return {
          ...subscription,
          is_freemium: false,
        };
      }
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
        name: "Freemium Plan",
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
      // {
      //   name: "premium",
      //   price: "7.60",
      //   currency: "£",
      //   description: "Ideal for focused learners",
      //   features: [
      //     "Unlimited saves & bundle creation",
      //     "Unlimited flashcard reviews",
      //     "Unlimited Al speaking practice",
      //     "Weekly progress insights",
      //     "Early access to new platforms & features",
      //   ],
      //   product_id: "prod_S4nM68SkuYEHxm",
      //   is_freemium: false,
      // },
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

    const getCurrency = (currency: string) => {
      switch (currency) {
        case "usd":
          return "$";
        case "gbp":
          return "£";
        default:
          return currency;
      }
    };

    const adapter = paymentAdapterFactory.getAdapter(
      PaymentProvider.STRIPE
    ) as StripeAdapter;
    const products = await adapter.stripe.products.list();

    for (const product of products.data) {
      const prices = await adapter.stripe.prices.list({
        product: product.id,
      });

      const p1 = prices.data[0];

      plans.push({
        name: product.name,
        description: product.description || "",
        price: ((p1.unit_amount || 0) / 100).toString() || "0",
        currency: getCurrency(p1.currency),
        product_id: product.id,
        features:
          product.marketing_features.map((feature) => feature.name || "") || [],
        is_freemium: false,
      });
    }

    return plans;
  },
});

/**
 * Get freemium allowance details for a user
 */
const getFreemiumAllowance = defineFunction({
  name: "getFreemiumAllowance",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    try {
      const { userId } = params;

      if (!userId) {
        throw new Error("User ID is required");
      }

      const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);
      return freemiumAllocation;
    } catch (error: any) {
      throw new Error(error.message || "Failed to retrieve freemium allowance");
    }
  },
});

module.exports.functions = [
  getSubscriptionDetails,
  getSubscriptionPlans,
  getFreemiumAllowance,
];
