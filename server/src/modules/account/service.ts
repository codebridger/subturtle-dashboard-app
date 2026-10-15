/**
 * Deletes a user's account and everything stored for it (App Store guideline 5.1.1(v):
 * an account created in the app must be deletable from the app).
 *
 * Order matters:
 *  1. Stripe first. A live subscription would keep billing a person who no longer has an
 *     account, so every non-terminal Stripe subscription of the user is canceled
 *     immediately. If any cancel fails the whole deletion is aborted before a document is
 *     touched, and the user can retry.
 *  2. The user's documents, collection by collection, each filtered by the user's id only.
 *  3. The auth document last, so a failure part-way leaves a signed-in account that can
 *     run the deletion again. Every step is a no-op for data that is already gone, so a
 *     retry finishes the job.
 *
 * modular-rest has no delete-user API, so the auth document is removed from its `cms.auth`
 * collection directly. Tokens already issued stay cryptographically valid until they
 * expire, but they name a user that no longer exists, so the API rejects them.
 */
import { getCollection, fileService } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  PROFILE_COLLECTION,
  LANGUAGE_PROFILE_COLLECTION,
  LANGUAGE_INTEREST_COLLECTION,
  REVIEW_LOG_COLLECTION,
  PHRASE_COLLECTION,
  BUNDLE_COLLECTION,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  SUBSCRIPTION_COLLECTION,
  USAGE_COLLECTION,
  FREE_CREDIT_COLLECTION,
  FLUENT_WAITLIST_COLLECTION,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
  DATABASE_SCHEDULE,
  SCHEDULE_JOB_COLLECTION,
  DATABASE_LEITNER,
  LEITNER_SYSTEM_COLLECTION,
  DATABASE_BOARD,
  BOARD_ACTIVITY_COLLECTION,
  DATABASE_POOL,
  POOL_COLLECTION,
} from "../../config";
import { PaymentAdapterFactory, PaymentProvider } from "../gateway/adapters";

// Defined inline by the gateway module (gateway/db.ts), not in config.ts.
const STRIPE_CUSTOMER_COLLECTION = "stripe_customer";

// modular-rest's own collections.
const AUTH_DATABASE = "cms";
const AUTH_COLLECTION = "auth";
const FILE_COLLECTION = "file";

// Stripe subscription statuses that will never bill again.
const TERMINAL_STRIPE_STATUSES = ["canceled", "incomplete_expired"];

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

export interface AccountDeletionResult {
  userId: string;
  canceledStripeSubscriptions: string[];
  /** Deleted document count per `database.collection`. */
  deleted: Record<string, number>;
}

/**
 * Cancels, immediately, every Stripe subscription of the user that could still bill.
 * Subscriptions are found both in our subscription records and on the user's Stripe
 * customer, so one our records lost track of is still caught. Returns the canceled ids.
 */
export async function cancelStripeSubscriptionsForUser(userId: string, userObjectId: Types.ObjectId): Promise<string[]> {
  const subscriptionIds = new Set<string>();

  const localSubscriptions = (await getCollection<any>(DATABASE, SUBSCRIPTION_COLLECTION).find({
    user_id: userObjectId,
    "payment_meta_data.provider": PaymentProvider.STRIPE,
    status: { $nin: TERMINAL_STRIPE_STATUSES },
  })) as any[];
  for (const subscription of localSubscriptions || []) {
    const id = subscription?.payment_meta_data?.stripe?.subscription_id;
    if (id) subscriptionIds.add(String(id));
  }

  const customerRecord = (await getCollection<any>(DATABASE, STRIPE_CUSTOMER_COLLECTION).findOne({ user_id: userId })) as any;
  const customerId: string | undefined = customerRecord?.customer_id;

  // Never had anything to do with Stripe: nothing to cancel, no Stripe client needed.
  if (subscriptionIds.size === 0 && !customerId) return [];

  let stripeAdapter;
  try {
    stripeAdapter = PaymentAdapterFactory.getStripeAdapter();
  } catch (error: any) {
    throw new AccountDeletionError(`Could not reach Stripe to cancel the subscription, so the account was not deleted: ${error?.message || error}`);
  }

  const canceled: string[] = [];
  try {
    if (customerId) {
      try {
        for await (const subscription of stripeAdapter.stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
          if (!TERMINAL_STRIPE_STATUSES.includes(subscription.status)) subscriptionIds.add(subscription.id);
        }
      } catch (error: any) {
        // The customer was deleted out-of-band; the ids from our records are still checked.
        if (error?.code !== "resource_missing") throw error;
      }
    }

    for (const subscriptionId of subscriptionIds) {
      let status: string;
      try {
        status = (await stripeAdapter.getSubscriptionDetails(subscriptionId)).status;
      } catch (error: any) {
        if (error?.code === "resource_missing") continue; // gone from Stripe: cannot bill
        throw error;
      }
      if (TERMINAL_STRIPE_STATUSES.includes(status)) continue;

      await stripeAdapter.stripe.subscriptions.cancel(subscriptionId);
      canceled.push(subscriptionId);
    }
  } catch (error: any) {
    throw new AccountDeletionError(`Could not cancel the Stripe subscription, so the account was not deleted: ${error?.message || error}`);
  }

  return canceled;
}

async function deleteMany(deleted: Record<string, number>, database: string, collection: string, filter: Record<string, unknown>) {
  const result = await getCollection<any>(database, collection).deleteMany(filter);
  const key = `${database}.${collection}`;
  deleted[key] = (deleted[key] || 0) + (result?.deletedCount || 0);
}

export async function deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
  if (!userId || typeof userId !== "string") {
    throw new AccountDeletionError("User ID is required");
  }
  if (!Types.ObjectId.isValid(userId)) {
    throw new AccountDeletionError("Invalid user ID");
  }
  const userObjectId = new Types.ObjectId(userId);

  // 1. Stop billing. Throws (and deletes nothing) when a subscription cannot be canceled.
  const canceledStripeSubscriptions = await cancelStripeSubscriptionsForUser(userId, userObjectId);

  // 2. The user's data. Owner fields differ per collection: String ids (refId / userId /
  //    user_id) on content, ObjectId user_id on subscription and payment-session records.
  const deleted: Record<string, number> = {};

  // Content: phrases before the Leitner/Pool docs that reference them.
  await deleteMany(deleted, DATABASE, PHRASE_COLLECTION, { refId: userId });
  await deleteMany(deleted, DATABASE, BUNDLE_COLLECTION, { refId: userId });
  await deleteMany(deleted, DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION, { userId });
  await deleteMany(deleted, DATABASE_POOL, POOL_COLLECTION, { userId });
  await deleteMany(deleted, DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION, { userId });
  await deleteMany(deleted, DATABASE, LANGUAGE_PROFILE_COLLECTION, { userId });
  await deleteMany(deleted, DATABASE, LANGUAGE_INTEREST_COLLECTION, { userId });
  await deleteMany(deleted, DATABASE, REVIEW_LOG_COLLECTION, { userId });

  // Practice sessions (voice and text).
  await deleteMany(deleted, DATABASE, LIVE_SESSION_COLLECTION, { refId: userId });
  await deleteMany(deleted, DATABASE, LIVE_SESSION_TEXT_COLLECTION, { refId: userId });

  // Subscription, usage and billing records.
  await deleteMany(deleted, DATABASE, SUBSCRIPTION_COLLECTION, { user_id: userObjectId });
  await deleteMany(deleted, DATABASE, USAGE_COLLECTION, { user_id: userObjectId });
  await deleteMany(deleted, DATABASE, FREE_CREDIT_COLLECTION, { user_id: userObjectId });
  await deleteMany(deleted, DATABASE, FLUENT_WAITLIST_COLLECTION, { user_id: userObjectId });
  await deleteMany(deleted, DATABASE, PAYMENT_COLLECTION, { user_id: userId });
  await deleteMany(deleted, DATABASE, PAYMENT_SESSION_COLLECTION, { user_id: userObjectId });
  await deleteMany(deleted, DATABASE, STRIPE_CUSTOMER_COLLECTION, { user_id: userId });

  // The per-user daily review job (LeitnerService.syncScheduledJob names it
  // `leitner-review-<userId>`), and any other job created for this user.
  await deleteMany(deleted, DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION, {
    $or: [{ name: `leitner-review-${userId}` }, { "args.userId": userId }],
  });

  await deleteMany(deleted, DATABASE, PROFILE_COLLECTION, { refId: userId });

  // Uploaded files (profile / phrase images), through the file service so the stored file
  // goes with its record.
  const files = ((await getCollection<any>(AUTH_DATABASE, FILE_COLLECTION).find({ owner: userId })) as any[]) || [];
  let removedFiles = 0;
  for (const file of files) {
    try {
      await fileService.removeFile(String(file._id));
      removedFiles++;
    } catch (error) {
      console.error(`[account] Failed to remove file ${file._id} of user ${userId}`, error);
    }
  }
  deleted[`${AUTH_DATABASE}.${FILE_COLLECTION}`] = removedFiles;

  // 3. The account itself.
  const authResult = await getCollection<any>(AUTH_DATABASE, AUTH_COLLECTION).deleteOne({ _id: userObjectId });
  deleted[`${AUTH_DATABASE}.${AUTH_COLLECTION}`] = authResult?.deletedCount || 0;

  return { userId, canceledStripeSubscriptions, deleted };
}
