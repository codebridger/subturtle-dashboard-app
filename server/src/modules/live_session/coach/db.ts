import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { COACH_EXPLANATION_FLAG_COLLECTION, DATABASE } from "../../../config";

/**
 * One "This explanation looks wrong" flag per (user, session, turn) (B-19, Q10). Written by
 * `flag-coach-explanation`; `get-coach-instructions` counts the learners who flagged a
 * (learning language, explanation language) pair, and many flags switch that pair's
 * explanations to English. Server only: no client access.
 */
const coachFlagSchema = new Schema(
  {
    userId: { type: String, required: true },
    sessionId: { type: String, required: true },
    turnIndex: { type: Number, required: true },
    language: { type: String, required: true },
    explanationLanguage: { type: String },
    on: { type: Boolean, default: true },
  },
  { timestamps: true }
);

coachFlagSchema.index({ userId: 1, sessionId: 1, turnIndex: 1 }, { unique: true });
coachFlagSchema.index({ language: 1, explanationLanguage: 1, on: 1, updatedAt: -1 });

const coachFlagCollection = defineCollection({
  database: DATABASE,
  collection: COACH_EXPLANATION_FLAG_COLLECTION,
  schema: coachFlagSchema,
  permissions: [new Permission({ accessType: "admin", read: true, write: true })],
});

module.exports = [coachFlagCollection];
