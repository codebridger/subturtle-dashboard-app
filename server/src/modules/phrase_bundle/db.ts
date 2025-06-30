import {
  Schema,
  Permission,
  schemas,
  defineCollection,
} from "@modular-rest/server";

import { phraseBundleTriggers } from "./triggers";

import { DATABASE, BUNDLE_COLLECTION, PHRASE_COLLECTION } from "../../config";

export type Example = {
  /** Example sentence showing the text in use */
  source: string;
  /** Translation of the example sentence */
  target: string;
};

export type RelatedExpression = {
  /** Related word or expression */
  source: string;
  /** Translation of the related expression */
  target: string;
};

export type LinguisticData = {
  /** Whether the text is valid for translation */
  isValid: boolean;
  /** Classification of the text (noun, verb, idiom, phrasal verb, expression, etc.) */
  type: string;
  /** Clear explanation of meaning, contextualized to usage */
  definition: string;
  /** Information about how and when to use this text */
  // usage_notes: string;
  /** Phonetic guidance (especially for non-Latin script languages) */
  phonetic: {
    ipa: string;
    transliteration: string;
  };
  /** Indication of formality level */
  formality_level: "formal" | "neutral" | "informal";
  /** When the literal meaning differs significantly from idiomatic usage */
  // literal_translation: string;
  /** Cultural context important for proper understanding */
  // cultural_notes: string;
  /** Additional grammatical information when relevant */
  // grammar_notes: string;
  /** Example sentences showing the text in use, with translations */
  examples: Example[];
  /** Similar or connected expressions with translations */
  related_expressions: RelatedExpression[];
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
}

interface PhraseBundleSchema {
  refId: string;
  title: string;
  desc?: string;
  image?: any;
  phrases: string[];
}

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
  },
  { timestamps: true }
);

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
    title: { type: String, required: true },
    desc: String,
    image: schemas.file,
    phrases: [
      {
        type: Schema.Types.ObjectId,
        ref: "phrase",
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
