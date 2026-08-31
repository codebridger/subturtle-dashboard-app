import { Schema, defineCollection, Permission } from "@modular-rest/server";
import { DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION } from "../../config";

export interface LeitnerItem {
  phraseId: string;
  boxLevel: number;
  nextReviewDate: Date;
  lastAttemptDate: Date;
  consecutiveIncorrect: number;
}

/**
 * A due/custom review item as returned by the review RPCs. Extends the stored
 * {@link LeitnerItem} with the joined phrase document plus the two flat fields the
 * L3+ fill-in card needs:
 * - `confirmed_chunk` — text of the phrase's primary chunk (highest `confidence`,
 *   tie-break earliest), or `null` when the phrase has no chunks (renderer falls
 *   back to the recognition card).
 * - `source_sentence` — the phrase's `context` (kept whole), or `null` when absent.
 */
export interface ReviewItem extends LeitnerItem {
  phrase: any;
  confirmed_chunk: string | null;
  source_sentence: string | null;
}

export interface LeitnerSystem {
  userId: string;
  settings: {
    dailyLimit: number;
    totalBoxes: number;
    boxIntervals: number[];
    boxQuotas: number[];
    autoEntry: boolean;
    reviewInterval: number; // in days
    reviewHour: number; // 0-23
  };
  items: LeitnerItem[];
}

const leitnerSystemSchema = new Schema<LeitnerSystem>(
  {
    userId: { type: String, required: true },
    settings: {
      type: {
        dailyLimit: { type: Number, default: 20 }, // Deprecated/Fallback
        totalBoxes: { type: Number, default: 5 },
        boxIntervals: { type: [Number], default: [1, 2, 4, 8, 16] }, // Days wait per box
        boxQuotas: { type: [Number], default: [20, 10, 5, 5, 5] }, // Max items per session per box
        autoEntry: { type: Boolean, default: true },
        reviewInterval: { type: Number, default: 1 },
        reviewHour: { type: Number, default: 9 },
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
