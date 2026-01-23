import { Schema, defineCollection, Permission } from "@modular-rest/server";
import { DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION } from "../../config";

export interface LeitnerItem {
  phraseId: string;
  boxLevel: number;
  nextReviewDate: Date;
  lastAttemptDate: Date;
  consecutiveIncorrect: number;
}

export interface LeitnerSystem {
  userId: string;
  settings: {
    dailyLimit: number;
    totalBoxes: number;
  };
  items: LeitnerItem[];
}

const leitnerSystemSchema = new Schema<LeitnerSystem>(
  {
    userId: { type: String, required: true },
    settings: {
      type: {
        dailyLimit: { type: Number, default: 20 },
        totalBoxes: { type: Number, default: 5 },
      },
      required: true,
    },
    items: {
      type: [
        {
          phraseId: { type: String, ref: "phrase" }, // Cross-DB reference
          boxLevel: { type: Number, required: true },
          nextReviewDate: { type: Date, required: true },
          lastAttemptDate: { type: Date, required: true },
          consecutiveIncorrect: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const leitnerSystemCollection = defineCollection({
  database: DATABASE_LEITNER,
  collection: LEITNER_SYSTEM_COLLECTION,
  schema: leitnerSystemSchema,
  permissions: [
    new Permission({
      accessType: "owner",
      read: true,
      write: true, // User can update their own settings via service
    }),
    new Permission({
      accessType: "admin",
      read: true,
      write: true,
    })
  ],
});

module.exports = [leitnerSystemCollection];
