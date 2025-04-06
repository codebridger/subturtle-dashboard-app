import { Schema, Permission, defineCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "../../config";

// Define payment collection to store payment records
const paymentCollection = defineCollection({
  database: DATABASE,
  collection: PAYMENT_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.users`,
      },
      stripe_customer_id: {
        type: String,
        required: false,
      },
      amount: {
        type: Number,
        required: true,
      },
      currency: {
        type: String,
        required: true,
        default: "usd",
      },
      product_id: {
        type: String,
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "succeeded", "failed", "canceled"],
        required: true,
        default: "pending",
      },
      stripe_payment_id: {
        type: String,
        required: false,
      },
      payment_method: {
        type: String,
        required: false,
      },
      credits_added: {
        type: Number,
        required: false,
      },
      subscription_days: {
        type: Number,
        required: true,
      },
      metadata: {
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

// Define payment session collection to track Stripe checkout sessions
const paymentSessionCollection = defineCollection({
  database: DATABASE,
  collection: PAYMENT_SESSION_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: Types.ObjectId,
        required: true,
        ref: `${DATABASE}.users`,
      },
      stripe_session_id: {
        type: String,
        required: true,
      },
      product_id: {
        type: String,
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      currency: {
        type: String,
        required: true,
        default: "usd",
      },
      status: {
        type: String,
        enum: ["created", "completed", "expired", "failed"],
        required: true,
        default: "created",
      },
      expires_at: {
        type: Date,
        required: true,
      },
      success_url: {
        type: String,
        required: true,
      },
      cancel_url: {
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

module.exports = [paymentCollection, paymentSessionCollection];
