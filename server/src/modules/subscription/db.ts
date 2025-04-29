import {
  CollectionDefinition,
  Schema,
  Permission,
  schemas,
} from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  SUBSCRIPTION_COLLECTION,
  DAILY_CREDITS_COLLECTION,
  USAGE_COLLECTION,
} from "../../config";

// Define subscription collection
const subscriptionCollection = new CollectionDefinition({
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
      system_portion: {
        type: Number,
        required: true,
      },
      spendable_credits: {
        type: Number,
        required: true,
      },
      status: {
        type: String,
        enum: ["active", "expired", "canceled"],
        required: true,
        default: "active",
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

// Define daily credits collection
const dailyCreditsCollection = new CollectionDefinition({
  database: DATABASE,
  collection: DAILY_CREDITS_COLLECTION,
  schema: new Schema(
    {
      subscription_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.${SUBSCRIPTION_COLLECTION}`,
      },
      date: {
        type: Date,
        required: true,
        default: Date.now,
      },
      daily_credit_limit: {
        type: Number,
        required: true,
      },
      credits_used: {
        type: Number,
        required: true,
        default: 0,
      },
      credits_rolled_over: {
        type: Number,
        required: true,
        default: 0,
      },
    },
    { timestamps: true }
  ),
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: false,
    }),
    new Permission({
      accessType: "admin",
      read: true,
      write: true,
    }),
  ],
});

// Define usage collection
const usageCollection = new CollectionDefinition({
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
        required: true,
        ref: `${DATABASE}.${SUBSCRIPTION_COLLECTION}`,
      },
      service_type: {
        type: String,
        required: true,
      },
      credit_amount: {
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
      timestamp: {
        type: Date,
        required: true,
        default: Date.now,
      },
      session_id: {
        type: Types.ObjectId,
        required: false,
      },
      details: {
        type: Object,
        required: false,
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

module.exports = [
  subscriptionCollection,
  dailyCreditsCollection,
  usageCollection,
];
