import {
  defineFunction,
  getCollection,
  userManager,
} from "@modular-rest/server";
import { Types } from "mongoose";

import { getSubscription, getOrCreateFreemiumAllocation } from "./service";
import { TIERS, PublicTierPlan } from "./tiers";
import { DATABASE, FLUENT_WAITLIST_COLLECTION } from "../../config";

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
          tier: "starter",
          is_freemium: true,
        };
      } else {
        // Paid subscriptions carry `tier` on the document (post-Council-002).
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
  callback: async (_params): Promise<PublicTierPlan[]> => {
    // Registry-driven — no live Stripe product listing. Dark tiers (Fluent)
    // are included so the pricing page can render them as "Coming soon".
    return Object.values(TIERS).map((tier) => ({
      id: tier.id,
      status: tier.status,
      name: tier.userFacingName,
      tagline: tier.tagline,
      isPaid: tier.isPaid,
      featureLabels: tier.featureLabels,
      aiBudgetLabel: tier.aiBudgetLabel,
      pricing: tier.amount,
    }));
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

/**
 * Add the current user to the Fluent waitlist — latent-demand capture while
 * the Fluent tier ships "dark". Idempotent: upserted by user_id.
 */
const notifyFluentWaitlist = defineFunction({
  name: "notifyFluentWaitlist",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    const { userId } = params;
    if (!userId) {
      throw new Error("User ID is required");
    }

    const user = await userManager.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const waitlistCollection = getCollection(
      DATABASE,
      FLUENT_WAITLIST_COLLECTION
    );
    await waitlistCollection.updateOne(
      { user_id: Types.ObjectId(userId) },
      { $set: { user_id: Types.ObjectId(userId), email: user.email } },
      { upsert: true }
    );

    return { success: true };
  },
});

module.exports.functions = [
  getSubscriptionDetails,
  getSubscriptionPlans,
  getFreemiumAllowance,
  notifyFluentWaitlist,
];
