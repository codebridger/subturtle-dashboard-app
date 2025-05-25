import { defineCollection, Schema, Permission } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  FREE_CREDIT_COLLECTION,
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
      status: {
        type: String,
        enum: [
          "active",
          "canceled",
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
      payment_meta_data: {
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
        type: Types.ObjectId,
        ref: `${DATABASE}.${SUBSCRIPTION_COLLECTION}`,
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
        expires: 0, // TTL index - document will be auto-removed when end_date is reached
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

// Add virtual property for available credits
freeCreaditCollection.schema
  .virtual("available_credit")
  .get(function (this: any) {
    return this.total_credits - this.credits_used;
  });

module.exports = [
  subscriptionCollection,
  usageCollection,
  freeCreaditCollection,
];
