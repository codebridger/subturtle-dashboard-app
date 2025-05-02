import { defineCollection, Schema, Permission } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  SUBSCRIPTION_COLLECTION,
  USAGE_COLLECTION,
} from "../../config";

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

module.exports = [subscriptionCollection, usageCollection];
