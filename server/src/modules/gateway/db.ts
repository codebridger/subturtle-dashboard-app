import { Schema, Permission, defineCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "./../../config";
import { PaymentProvider } from "./adapters/types";

// Define payment collection to store payment records
const paymentCollection = defineCollection({
  database: DATABASE,
  collection: PAYMENT_COLLECTION,
  schema: new Schema(
    {
      user_id: {
        type: String,
        required: true,
      },
      provider: {
        type: String,
        enum: Object.values(PaymentProvider),
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
      },
      provider: {
        type: String,
        enum: Object.values(PaymentProvider),
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

// Define stripe customer collection to store user_id <-> stripe customer_id mapping
const stripeCustomerCollection = defineCollection({
  database: DATABASE,
  collection: "stripe_customer",
  schema: new Schema(
    {
      user_id: {
        type: String,
        required: true,
        unique: true,
      },
      customer_id: {
        type: String,
        required: true,
        unique: true,
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
  paymentCollection,
  paymentSessionCollection,
  stripeCustomerCollection,
];
