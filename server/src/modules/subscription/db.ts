import { defineCollection, Schema, Permission } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  FREE_CREDIT_COLLECTION,
  FLUENT_WAITLIST_COLLECTION,
  FREEMIUM_DURATION_DAYS,
  FREEMIUM_DEFAULT_TEXT_CHATS,
  SUBSCRIPTION_COLLECTION,
  USAGE_COLLECTION,
} from "../../config";
import { calculatorService } from "./calculator";

// Define subscription collection
const subscriptionCollection = defineCollection({
  database: DATABASE,
  collection: SUBSCRIPTION_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.users`,
      },
      start_date: {
        type: Date,
        required: true,
        default: Date.now,
      },
      end_date: {
        type: Date,
        required: true,
      },
      total_credits: {
        type: Number,
        required: true,
      },
      credits_used: {
        type: Number,
        required: true,
        default: 0,
      },
      // Monthly voice-minute budget (Council 004). Seeded from the tier's Stripe
      // metadata on create/renewal; reset to 0 used on each new period. The voice
      // metering engine (debit/check/overage) is a separate workstream — these
      // are the schema + seeding only.
      voice_minutes_total: {
        type: Number,
        required: true,
        default: 0,
      },
      voice_minutes_used: {
        type: Number,
        required: true,
        default: 0,
      },
      // Reader text-chat caps (Council 004 follow-up): monthly chat count seeded
      // from the tier's Stripe metadata (text_chat_cap) on start/renewal; absent =
      // unlimited (Learner / Coach). Per-chat message cap is enforced inline.
      allowed_text_chats: {
        type: Number,
        required: false,
      },
      allowed_text_chats_used: {
        type: Number,
        default: 0,
      },
      // Voice-minute top-up packs (Council 004 overage) — one-shot purchases that
      // extend the voice budget and survive renewal until their 90-day expiry. The
      // active list + per-pack remaining are derived (service.computeVoiceBalance);
      // idempotency is keyed on session_id.
      top_ups: {
        type: [
          new Schema(
            {
              session_id: { type: String, required: true },
              pack_size: { type: Number, required: true },
              minutes: { type: Number, required: true },
              purchased_at: { type: Date, required: true },
              expires_at: { type: Date, required: true },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
      status: {
        type: String,
        enum: [
          "active",
          "canceled",
          "expired",
          "incomplete",
          "incomplete_expired",
          "past_due",
          "paused",
          "trialing",
          "unpaid",
        ],
        required: true,
        default: "active",
      },
      // Pricing-tier ladder (Council 004: Starter / Reader / Learner / Coach).
      // Optional: pre-rollout subscriptions and freemium-derived records may not
      // carry a tier.
      tier: {
        type: String,
        enum: ["starter", "reader", "learner", "coach"],
        required: false,
      },
      // Billing cadence of the paid subscription.
      subscription_type: {
        type: String,
        enum: ["monthly", "annual"],
        required: false,
      },
      // Stripe price ID that created this subscription — lets the webhook and UI
      // resolve tier/cadence/currency without re-hitting Stripe.
      price_id: {
        type: String,
        required: false,
      },
      // End of the credit-card-required free trial, when the subscription is trialing.
      trial_end: {
        type: Date,
        required: false,
      },
      // True when the subscription is scheduled to cancel at the end of the
      // current period — set when the user cancels via the Stripe portal.
      cancel_at_period_end: {
        type: Boolean,
        default: false,
      },
      payment_meta_data: {
        type: Object,
        required: false,
      },
      // Idempotency / period marker (ADR-004): the Stripe current_period_end we
      // last granted (created or refilled) for. Grants apply only for a period
      // strictly newer than this, so a duplicate or out-of-order webhook cannot
      // double-grant or regress to an older period.
      granted_period_end: {
        type: Date,
        required: false,
      },
      // Entitlement snapshot LOCKED at purchase (ADR-004): the parsed Stripe
      // product metadata for the current paid period. Re-read from metadata only
      // on a real period rollover, so a mid-period metadata edit never changes a
      // customer's current period. Feature gating reads from this snapshot.
      entitlements: {
        type: Object,
        required: false,
      },
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
    }
  ),
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "user_id",
    }),
    new Permission({
      accessType: "admin",
      read: true,
      write: true,
    }),
  ],
});

// Add virtual property for available credits
subscriptionCollection.schema
  .virtual("available_credit")
  .get(function (this: any) {
    return this.total_credits - this.credits_used;
  });

// Add virtual property for remaining days
subscriptionCollection.schema
  .virtual("remaining_days")
  .get(function (this: any) {
    const now = new Date();
    const endDate = this.end_date;
    return Math.max(
      0,
      Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
  });

// Add virtual property for usage percentage
subscriptionCollection.schema
  .virtual("usage_percentage")
  .get(function (this: any) {
    if (this.total_credits <= 0) return 0;
    const percentage = Math.round(
      (this.credits_used / this.total_credits) * 100
    );
    return Math.min(percentage, 100); // Cap at 100%
  });

// Add virtual property for total credits in USD
subscriptionCollection.schema
  .virtual("total_credit_in_usd")
  .get(function (this: any) {
    return calculatorService.creditsToUsd(this.total_credits);
  });

// Add virtual property for used credits in USD
subscriptionCollection.schema
  .virtual("used_credit_in_usd")
  .get(function (this: any) {
    return calculatorService.creditsToUsd(this.credits_used);
  });

// Add virtual property for available credits in USD
subscriptionCollection.schema
  .virtual("available_credit_in_usd")
  .get(function (this: any) {
    return calculatorService.creditsToUsd(this.available_credit || 0);
  });

// Define usage collection
const usageCollection = defineCollection({
  database: DATABASE,
  collection: USAGE_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.users`,
      },
      subscription_id: {
        type: String,
      },
      service_type: {
        type: String,
        required: true,
      },
      credit_used: {
        type: Number,
        required: true,
      },
      token_count: {
        type: Number,
        required: true,
      },
      model_used: {
        type: String,
        required: true,
      },
      details: {
        type: Object,
        required: false,
      },
      status: {
        type: String,
        enum: ["paid", "unpaid", "overdraft"],
        required: true,
        default: "paid",
      },
    },
    { timestamps: true }
  ),
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: false,
      onlyOwnData: true,
      ownerIdField: "user_id",
    }),
    new Permission({
      accessType: "admin",
      read: true,
      write: true,
    }),
  ],
});

const freeCreaditCollection = defineCollection({
  database: DATABASE,
  collection: FREE_CREDIT_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.users`,
      },
      start_date: {
        type: Date,
        required: true,
        default: Date.now,
      },
      end_date: {
        type: Date,
        required: true,
      },
      total_credits: {
        type: Number,
        required: true,
      },
      credits_used: {
        type: Number,
        required: true,
        default: 0,
      },
      allowed_save_words: {
        type: Number,
        required: true,
      },
      allowed_save_words_used: {
        type: Number,
        required: true,
        default: 0,
      },
      allowed_lived_sessions: {
        type: Number,
        required: true,
      },
      allowed_lived_sessions_used: {
        type: Number,
        required: true,
        default: 0,
      },
      // Starter text-chat caps (Council 004 follow-up): 5 chats / 30-day window,
      // each capped at 20 messages (the per-chat cap is enforced inline, no counter).
      allowed_text_chats: {
        type: Number,
        default: FREEMIUM_DEFAULT_TEXT_CHATS,
      },
      allowed_text_chats_used: {
        type: Number,
        default: 0,
      },
      // Starter "taste" of voice (Council 004). Free-tier voice still debits the
      // credit pool; this mirrors the paid voice counter for schema symmetry.
      voice_minutes_total: {
        type: Number,
        required: true,
        default: 0,
      },
      voice_minutes_used: {
        type: Number,
        required: true,
        default: 0,
      },
      // One-shot guard: set true after the `starter-ai_exhausted` analytics
      // event fires, so it fires at most once per 30-day allocation window.
      ai_exhausted_flagged: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
    }
  ),
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "user_id",
    }),
  ],
});

const expirationTime = FREEMIUM_DURATION_DAYS * 24 * 60 * 60;
freeCreaditCollection.schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: expirationTime }
);

// Add virtual property for available credits
freeCreaditCollection.schema
  .virtual("available_credit")
  .get(function (this: any) {
    return this.total_credits - this.credits_used;
  });

// Add virtual property for usage percentage (mirrors the subscription virtual)
freeCreaditCollection.schema
  .virtual("usage_percentage")
  .get(function (this: any) {
    if (this.total_credits <= 0) return 0;
    const percentage = Math.round(
      (this.credits_used / this.total_credits) * 100
    );
    return Math.min(percentage, 100); // Cap at 100%
  });

// Latent-demand waitlist for the Fluent tier while it ships "dark".
// One row per user (upserted) — the captured emails get migrated into a
// complimentary Fluent unlock when PRFAQ-003 (Mini Lectures) ships.
const fluentWaitlistCollection = defineCollection({
  database: DATABASE,
  collection: FLUENT_WAITLIST_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.users`,
        unique: true,
      },
      email: {
        type: String,
        required: true,
      },
    },
    { timestamps: true }
  ),
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "user_id",
    }),
    new Permission({
      accessType: "admin",
      read: true,
      write: true,
    }),
  ],
});

module.exports = [
  subscriptionCollection,
  usageCollection,
  freeCreaditCollection,
  fluentWaitlistCollection,
];
