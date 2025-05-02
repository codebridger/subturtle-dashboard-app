import { Schema, Permission, defineCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "./../../config";
import { PaymentProvider } from "./adapters/types";
import { whenPaymentCreatedAddCreadit } from "./triggers";

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
      provider: {
        type: String,
        enum: Object.values(PaymentProvider),
        required: true,
        default: PaymentProvider.STRIPE,
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
        enum: ["pending", "succeeded", "failed", "canceled"],
        required: true,
        default: "pending",
      },
      // Provider-specific data goes here
      provider_data: {
        type: Object,
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

  triggers: [whenPaymentCreatedAddCreadit],
});

// Define payment session collection to track checkout sessions
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
      provider: {
        type: String,
        enum: Object.values(PaymentProvider),
        required: true,
        default: PaymentProvider.STRIPE,
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
      // Provider-specific data goes here
      provider_data: {
        type: Object,
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
