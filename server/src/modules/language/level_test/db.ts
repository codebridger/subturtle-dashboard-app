import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { DATABASE, LEVEL_TEST_COLLECTION } from "../../../config";

/**
 * One AI level chat test (B-31): six Coach questions in the learning language, the
 * learner's answers, and the start level the test found. Kept after the test: the chats are
 * the data for the teacher check (C-10) and for the knowledge map's placement research.
 * Clients may read their own; only the level test functions write.
 */
const levelTestSchema = new Schema(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },
    explanationLanguage: { type: String },
    // in_progress → done (graded) → accepted | declined; or stopped, failed, abandoned.
    status: { type: String, required: true, default: "in_progress" },
    turns: { type: [Object], default: [] }, // { ai, help, answer?, source: "model" | "fallback", askedAt, answeredAt? }
    startLevel: { type: String, enum: ["A1", "A2", "B1", "B2"] },
    reason: { type: String },
    resultSource: { type: String }, // "model" | "fallback"
    model: { type: String },
    usage: { type: Object },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

levelTestSchema.index({ userId: 1, language: 1, createdAt: -1 });

const levelTestCollection = defineCollection({
  database: DATABASE,
  collection: LEVEL_TEST_COLLECTION,
  schema: levelTestSchema,
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: false,
      onlyOwnData: true,
      ownerIdField: "userId",
    }),
  ],
});

module.exports = [levelTestCollection];
