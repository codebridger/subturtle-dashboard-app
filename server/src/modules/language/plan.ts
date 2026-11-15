/**
 * How many languages a learner may study at once (work list B-33, Council 008):
 * Starter 1, Reader 3, Learner and Coach 10.
 *
 * Paid tiers follow ADR-004: the number is `max_learning_languages` in the tier's Stripe
 * product metadata, locked into the subscription's entitlement snapshot. Snapshots taken
 * before that key existed fall back to the tier's published number below, so a paying
 * learner is never held to Starter's limit by a data gap. Starter has no Stripe product;
 * its number is `allowed_learning_languages` on the free_credit allocation, defaulting to
 * FREEMIUM_DEFAULT_MAX_LEARNING_LANGUAGES.
 */
import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  FREE_CREDIT_COLLECTION,
  FREEMIUM_DEFAULT_MAX_LEARNING_LANGUAGES,
  SUBSCRIPTION_COLLECTION,
} from "../../config";

export type Plan = "starter" | "reader" | "learner" | "coach";

/** The published numbers, used only when a paid snapshot lacks `maxLearningLanguages`. */
export const TIER_LANGUAGE_FALLBACK: Record<Exclude<Plan, "starter">, number> = {
  reader: 3,
  learner: 10,
  coach: 10,
};

export interface LanguagePlan {
  plan: Plan;
  maxLanguages: number;
}

const PAID_PLANS: Plan[] = ["reader", "learner", "coach"];

export async function getLanguagePlan(userId: string): Promise<LanguagePlan> {
  // subscription.user_id and free_credit.user_id are ObjectIds (see subscription/service.ts).
  const userObjectId = new Types.ObjectId(userId);
  const now = new Date();

  const subscription: any = await getCollection<any>(DATABASE, SUBSCRIPTION_COLLECTION)
    .findOne({
      user_id: userObjectId,
      status: { $nin: ["canceled", "incomplete_expired"] },
      end_date: { $gte: now },
    })
    .lean();

  if (subscription) {
    const tier = subscription.tier ?? subscription.entitlements?.tierId;
    // A paid subscription from before the tier ladder carries no tier: the middle tier is
    // the closest match to what it bought.
    const plan: Plan = PAID_PLANS.includes(tier) ? tier : "reader";
    const fromSnapshot = subscription.entitlements?.maxLearningLanguages;
    const maxLanguages =
      Number.isInteger(fromSnapshot) && fromSnapshot > 0
        ? fromSnapshot
        : TIER_LANGUAGE_FALLBACK[plan as Exclude<Plan, "starter">];
    return { plan, maxLanguages };
  }

  const allocation: any = await getCollection<any>(DATABASE, FREE_CREDIT_COLLECTION)
    .findOne({ user_id: userObjectId, end_date: { $gte: now } })
    .lean();
  const allowed = allocation?.allowed_learning_languages;
  return {
    plan: "starter",
    maxLanguages: Number.isInteger(allowed) && allowed > 0 ? allowed : FREEMIUM_DEFAULT_MAX_LEARNING_LANGUAGES,
  };
}
