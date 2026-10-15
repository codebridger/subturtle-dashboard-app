import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { DATABASE, SAVE_ASSISTANT_SESSION_COLLECTION } from "../../config";
import type { SaveSessionRecordType } from "./types";

const saveSessionSchema = new Schema<SaveSessionRecordType>(
  {
    refId: { type: String, required: true },
    title: { type: String, default: "" },
    source: { type: Object },
    sourceLanguage: { type: String },
    targetLanguage: { type: String },
    messages: { type: [Object], default: [] },
    candidates: { type: [Object], default: [] },
    savedPhraseIds: { type: [String], default: [] },
    savedPhrases: { type: [String], default: [] },
    savedCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    usage: { type: Object },
  },
  { timestamps: true }
);

// History list: newest first, per user.
saveSessionSchema.index({ refId: 1, lastMessageAt: -1 });

// Same retention as live_session_text.
const sixMonths = 6 * 30 * 24 * 60 * 60;
saveSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: sixMonths });

// No text index: search uses a case-insensitive regex on `title` and
// `messages.text`, scoped to one user's sessions (see listSaveSessions).
// Firestore with MongoDB compatibility, which production runs on, does not
// support text indexes.

const saveSessionCollection = defineCollection({
  database: DATABASE,
  collection: SAVE_ASSISTANT_SESSION_COLLECTION,
  schema: saveSessionSchema,
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    }),
  ],
});

module.exports = [saveSessionCollection];
