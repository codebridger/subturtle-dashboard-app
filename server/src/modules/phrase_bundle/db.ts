import {
  Schema,
  Permission,
  schemas,
  defineCollection,
} from "@modular-rest/server";

import { phraseBundleTriggers } from "./triggers";

import { DATABASE, BUNDLE_COLLECTION, PHRASE_COLLECTION } from "../../config";

/** A reusable language pattern the user confirmed inside their selection. */
export type Chunk = {
  /** The exact reusable pattern as it appears in the selection */
  text: string;
  /** Kind of pattern (collocation, phrasal_verb, idiom, discourse_marker, other) */
  type: string;
  /** Short explanation of the chunk's meaning/usage in the target language */
  definition?: string;
  /** Pronunciation of the chunk written in the target language alphabet */
  transliteration?: string;
  /** Model confidence that this is a useful learnable chunk (0-1) */
  confidence: number;
};

export type LinguisticData = {
  /** Whether the text is valid for translation */
  isValid: boolean;
  /** Classification of the text (noun, verb, idiom, phrasal verb, expression, etc.) */
  type: string;
  /** Clear explanation of meaning, contextualized to usage */
  definition: string;
  /** Phonetic guidance written in the target language alphabet */
  phonetic: {
    transliteration: string;
  };
  /** Indication of formality level */
  formality_level: "formal" | "neutral" | "informal";
};

export interface PhraseSchema {
  refId: string;
  images: any[];
  type: "normal" | "linguistic";

  // normal
  phrase: string;
  translation: string;
  translation_language: string;

  // linguistic
  context?: string;
  direction?: {
    source: "ltr" | "rtl";
    target: "ltr" | "rtl";
  };
  language_info?: {
    source: string;
    target: string;
  };
  linguistic_data?: LinguisticData;
  /** Confirmed reusable patterns inside the selection. Source of truth for Pool + L3+ fill-in. */
  chunks?: Chunk[];
  /** Normalised URL of the page the phrase was saved from. */
  sourceUrl?: string;
  /** The learning language (ADR-006). Missing on phrases from before multilingual: English. */
  language?: string;
  /** How `language` was set: "user", "detected", "active", "backfill", ... (B-08). */
  languageSource?: string;
  /** "pending": kept for a language the learner has not added yet; no bundle (B-32). */
  status?: "pending";
  /** When a pending phrase is deleted unless its language is added (B-32). */
  pendingExpiresAt?: Date;
}

interface PhraseBundleSchema {
  refId: string;
  /** The learning language (ADR-006). Missing on bundles from before multilingual: English. */
  language?: string;
  title: string;
  desc?: string;
  image?: any;
  phrases: string[];
}

// Sub-schema for a confirmed chunk. The field literally named `type` collides
// with Mongoose's reserved type key, so each field uses the verbose `{ type }`
// descriptor form (and _id is disabled since chunks are plain value objects).
const chunkSchema = new Schema(
  {
    text: { type: String },
    type: { type: String },
    definition: { type: String },
    transliteration: { type: String },
    confidence: { type: Number },
  },
  { _id: false }
);

const phraseSchema = new Schema<PhraseSchema>(
  {
    phrase: { type: String },
    translation: { type: String },
    translation_language: String,
    refId: String,
    images: [schemas.file],
    type: { type: String, enum: ["normal", "linguistic"], default: "normal" },
    context: String,
    direction: {
      source: { type: String, enum: ["ltr", "rtl"] },
      target: { type: String, enum: ["ltr", "rtl"] },
    },
    language_info: {
      source: String,
      target: String,
    },
    linguistic_data: Schema.Types.Mixed,
    chunks: {
      type: [chunkSchema],
      default: [],
    },
    sourceUrl: String,
    language: String,
    languageSource: String,
    status: { type: String, enum: ["pending"] },
    pendingExpiresAt: Date,
  },
  { timestamps: true }
);

// Kept phrases per user and language (B-32), and the purge job's sweep of expired ones.
phraseSchema.index({ refId: 1, status: 1, language: 1 });

const phraseCollection = defineCollection({
  database: DATABASE,
  collection: PHRASE_COLLECTION,
  schema: phraseSchema,
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    }),
  ],
  triggers: phraseBundleTriggers,
});

const phraseBundleSchema = new Schema<PhraseBundleSchema>(
  {
    refId: { type: String, required: true },
    language: String,
    title: { type: String, required: true },
    desc: String,
    image: schemas.file,
    phrases: [
      {
        type: Schema.Types.ObjectId,
        ref: PHRASE_COLLECTION,
      },
    ],
  },
  { timestamps: true }
);

phraseBundleSchema.index({ refId: 1, title: 1 }, { unique: true });

const phraseBundleCollection = defineCollection({
  database: DATABASE,
  collection: BUNDLE_COLLECTION,
  schema: phraseBundleSchema,
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    }),
  ],
  triggers: [],
});

module.exports = [phraseCollection, phraseBundleCollection];
