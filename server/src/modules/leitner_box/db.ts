import { Schema, defineCollection } from "@modular-rest/server";
import { DATABASE_GENERATIVE, LEITNER_SYSTEM_COLLECTION, LEITNER_REVIEW_BUNDLE_COLLECTION } from "../../config";

interface LeitnerSystemSchema {
  refId: string; // user id
  settings: {
    dailyLimit: number;
    totalBoxes: number; // Default 5 (min 3, max 10)
  };
  items: Array<{
    phraseId: string; // ref to phrase refId or string ID
    boxLevel: number;
    nextReviewDate: Date;
    lastAttemptDate: Date;
  }>;
}

interface ReviewBundleSchema {
  refId: string; // user id
  createdAt: Date;
  type: "daily" | "manual";
  status: "pending" | "completed" | "expired";
  items: Array<{
    phraseId: string;
    boxLevelAtGeneration: number;
  }>;
}

const leitnerSystemSchema = new Schema<LeitnerSystemSchema>(
  {
    refId: { type: String, required: true, unique: true },
    settings: {
      dailyLimit: { type: Number, default: 15 },
      totalBoxes: { type: Number, default: 5, min: 3, max: 10 },
    },
    items: [
      {
        phraseId: { type: String, required: true },
        boxLevel: { type: Number, default: 1 },
        nextReviewDate: Date,
        lastAttemptDate: Date,
        consecutiveFailures: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

const reviewBundleSchema = new Schema<ReviewBundleSchema>(
  {
    refId: { type: String, required: true },
    type: { type: String, enum: ["daily", "manual"], default: "daily" },
    status: {
      type: String,
      enum: ["pending", "completed", "expired"],
      default: "pending",
    },
    items: [
      {
        phraseId: String,
        boxLevelAtGeneration: Number,
      },
    ],
  },
  { timestamps: true }
);

const leitnerSystemCollection = defineCollection({
  database: DATABASE_GENERATIVE,
  collection: LEITNER_SYSTEM_COLLECTION,
  schema: leitnerSystemSchema,
  permissions: [
    {
      accessType: "user_access",
      read: true,
      write: false, // Only modified via service/functions
      onlyOwnData: true,
      ownerIdField: "refId",
    },
  ],
});

const reviewBundleCollection = defineCollection({
  database: DATABASE_GENERATIVE,
  collection: LEITNER_REVIEW_BUNDLE_COLLECTION,
  schema: reviewBundleSchema,
  permissions: [
    {
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    },
  ],
});

module.exports = [leitnerSystemCollection, reviewBundleCollection];
