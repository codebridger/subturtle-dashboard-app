import {
  defineFunction,
  getCollection,
  userManager,
} from "@modular-rest/server";
import { Types } from "mongoose";

import {
  getSubscription,
  getOrCreateFreemiumAllocation,
  createSubscriptionUpdatePortalUrl,
} from "./service";
import { PublicTierPlan } from "./tiers";
import { getSubscriptionPlansCached } from "./plans";
import { PaymentAdapterFactory } from "../gateway/adapters";
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
          // Top-ups are a paid-subscription feature; free users never have any.
          active_top_ups: [],
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
    // Built from live Stripe products (ADR-004), through a TTL cache with a
    // last-known-good snapshot (real Stripe data). There is no baked-in plan
    // fallback: if the Stripe adapter can't be acquired AND there is no snapshot,
    // this throws so the frontend can show a "payment system unavailable" message
    // rather than rendering invented plan data.
    const stripe = PaymentAdapterFactory.getStripeAdapter().stripe;
    return getSubscriptionPlansCached(stripe);
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

/**
 * Deep-link the user to the Stripe portal's "Update your subscription" plan
 * picker (Council 004 — change plan instead of stacking a second checkout).
 */
const createPortalUpdateSession = defineFunction({
  name: "createPortalUpdateSession",
  permissionTypes: ["user_access"],
  callback: async (params: { userId?: string }) => {
    const { userId } = params;
    if (!userId) {
      throw new Error("User ID is required");
    }
    return { url: await createSubscriptionUpdatePortalUrl(userId) };
  },
});

module.exports.functions = [
  getSubscriptionDetails,
  getSubscriptionPlans,
  getFreemiumAllowance,
  notifyFluentWaitlist,
  createPortalUpdateSession,
];
