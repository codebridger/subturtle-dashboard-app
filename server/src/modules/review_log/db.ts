import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { DATABASE, REVIEW_LOG_COLLECTION } from "../../config";

/**
 * The review log (work list B-30, Q4, Q9): one append-only row per answer and per Pool
 * session, keyed by language, so the knowledge map round can rebuild what a learner knows.
 * A one-time migration also writes one `snapshot` row per card that existed before the log
 * started (box and last review date); answers before that were never stored.
 *
 * - `kind`: `review` (submit-review), `pool` (a phrase met in a Pool session and moved into
 *   box 1), or `snapshot` (the migration).
 * - `result`: right / close / wrong for a review; `seen` for a Pool session; null for a
 *   snapshot.
 * - `eventKey`: unique per user, so a retried request or a re-run migration writes nothing
 *   twice.
 *
 * Server-only: no client group holds `advanced_settings`, so the data provider refuses
 * clients, and nothing reads it yet.
 */
export type ReviewLogKind = "review" | "pool" | "snapshot";

export interface ReviewLogRow {
  userId: string;
  language: string;
  /** How the phrase's language was set (the phrase's `languageSource`, or "backfill"). */
  languageSource: string;
  phraseId: string;
  /** The primary chunk's text at the time, or null. */
  chunk: string | null;
  /** The card the learner saw: recognition, cloze, pool or snapshot. */
  cardType: string;
  kind: ReviewLogKind;
  result: "right" | "close" | "wrong" | "seen" | null;
  /** Box before and after the event (snapshot: the current box in both). */
  fromBox?: number | null;
  toBox?: number | null;
  /** Snapshot rows: the card's last review date. */
  lastAttemptDate?: Date | null;
  ts: Date;
  eventKey: string;
}

const reviewLogSchema = new Schema<ReviewLogRow>(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },
    languageSource: { type: String },
    phraseId: { type: String, required: true },
    chunk: { type: String, default: null },
    cardType: { type: String },
    kind: { type: String, enum: ["review", "pool", "snapshot"], required: true },
    result: { type: String, enum: ["right", "close", "wrong", "seen", null], default: null },
    fromBox: { type: Number, default: null },
    toBox: { type: Number, default: null },
    lastAttemptDate: { type: Date, default: null },
    ts: { type: Date, required: true },
    eventKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One row per event. The collection is new, so building it at boot is safe; the index
// script also checks it (scripts/multilingual-indexes.ts).
reviewLogSchema.index({ userId: 1, eventKey: 1 }, { unique: true });
// One learner's history of one language, in time order (and the purge job's delete).
reviewLogSchema.index({ userId: 1, language: 1, ts: 1 });

const reviewLogCollection = defineCollection({
  database: DATABASE,
  collection: REVIEW_LOG_COLLECTION,
  schema: reviewLogSchema,
  permissions: [
    new Permission({
      accessType: "advanced_settings",
      read: true,
      write: true,
    }),
  ],
});

module.exports = [reviewLogCollection];
