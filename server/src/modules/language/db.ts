import { Schema, Permission, defineCollection } from "@modular-rest/server";
import { DATABASE, LANGUAGE_PROFILE_COLLECTION, LANGUAGE_INTEREST_COLLECTION } from "../../config";
import { CEFR_STARTS, LANGUAGE_STATUSES, LanguageProfile, STARTER_PACK_STATES } from "./types";

const languageProfileSchema = new Schema<LanguageProfile>(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },
    status: { type: String, enum: LANGUAGE_STATUSES, required: true, default: "active" },
    startLevel: { type: String, enum: CEFR_STARTS, default: "A1" },
    startLevelSource: { type: String, enum: ["test", "default"], default: "default" },
    goals: { type: [String], default: [] },
    explanationLanguage: String,
    newPhrasesPerDay: Number,
    poolChunkSize: Number,
    poolAgeCutoffDays: Number,
    starterPack: {
      state: { type: String, enum: STARTER_PACK_STATES, default: "none" },
      heard: { type: [String], default: [] },
      total: { type: Number, default: 0 },
    },
    addedAt: { type: Date, default: () => new Date() },
    removedAt: Date,
    purgeAt: Date,
    purgeClaimedAt: Date,
  },
  { timestamps: true }
);

languageProfileSchema.index({ userId: 1, language: 1 }, { unique: true });
// The purge job's claim query.
languageProfileSchema.index({ status: 1, purgeAt: 1 });

/** "Tell me when it's ready" for a language not offered yet (B-06). */
const languageInterestSchema = new Schema(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },
  },
  { timestamps: true }
);

languageInterestSchema.index({ userId: 1, language: 1 }, { unique: true });
languageInterestSchema.index({ language: 1 });

// Clients read their own documents through the data provider (the guard pins `userId` to
// the caller); only the language functions write them.
const ownReadOnly = () =>
  new Permission({
    accessType: "user_access",
    read: true,
    write: false,
    onlyOwnData: true,
    ownerIdField: "userId",
  });

const languageProfileCollection = defineCollection({
  database: DATABASE,
  collection: LANGUAGE_PROFILE_COLLECTION,
  schema: languageProfileSchema,
  permissions: [ownReadOnly()],
});

const languageInterestCollection = defineCollection({
  database: DATABASE,
  collection: LANGUAGE_INTEREST_COLLECTION,
  schema: languageInterestSchema,
  permissions: [ownReadOnly()],
});

module.exports = [languageProfileCollection, languageInterestCollection];
