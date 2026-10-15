import { Schema, Permission, defineCollection } from "@modular-rest/server";
import { DATABASE, LANGUAGE_PROFILE_COLLECTION, LANGUAGE_INTEREST_COLLECTION } from "../../config";

export const LANGUAGE_STATUSES = ["active", "paused", "removed", "purging"] as const;
export type LanguageStatus = (typeof LANGUAGE_STATUSES)[number];

export const CEFR_STARTS = ["A1", "A2", "B1", "B2"] as const;
export type CefrStart = (typeof CEFR_STARTS)[number];

export const STARTER_PACK_STATES = ["none", "offered", "in_progress", "done", "skipped"] as const;
export type StarterPackState = (typeof STARTER_PACK_STATES)[number];

/**
 * One learner's study of one language (ADR-006 point 2, work list B-04). The source of truth
 * for which languages a learner has; the profile's `learningLanguages` / `pausedLanguages`
 * are a copy that `get-language-state` repairs from here.
 *
 * Status moves: active ⇄ paused (plan limit), active/paused → removed (`purgeAt` 30 days
 * ahead) → active again on re-add, or removed → purging (claimed by the purge job, which
 * deletes this document last).
 */
export interface LanguageProfile {
  _id?: any;
  userId: string;
  language: string;
  status: LanguageStatus;
  startLevel: CefrStart;
  startLevelSource: "test" | "default";
  goals: string[];
  /** The language the Coach explains in; unset means the learner's own language. */
  explanationLanguage?: string;
  /** New phrases a day taken into review (intake). Unset means the Leitner default. */
  newPhrasesPerDay?: number;
  /** Pool settings, per language (moved here from the profile). Unset means the profile's. */
  poolChunkSize?: number;
  poolAgeCutoffDays?: number;
  starterPack: { state: StarterPackState; heard: string[]; total: number };
  addedAt: Date;
  removedAt?: Date | null;
  purgeAt?: Date | null;
  /** When the purge job claimed it; a stale claim is retried. */
  purgeClaimedAt?: Date | null;
}

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
