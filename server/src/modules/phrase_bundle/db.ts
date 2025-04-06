import {
  CollectionDefinition,
  Schema,
  Permission,
  schemas,
  DatabaseTrigger,
} from "@modular-rest/server";

import { DATABASE, BUNDLE_COLLECTION, PHRASE_COLLECTION } from "../../config";

interface PhraseSchema {
  phrase: string;
  translation: string;
  translation_language: string;
  refId: string;
  images: any[];
}

interface PhraseBundleSchema {
  refId: string;
  title: string;
  desc?: string;
  image?: any;
  phrases: string[];
}

const phraseCollection = new CollectionDefinition({
  database: DATABASE,
  collection: PHRASE_COLLECTION,
  schema: new Schema<PhraseSchema>(
    {
      phrase: { type: String },
      translation: { type: String },
      translation_language: String,
      refId: String,
      images: [schemas.file],
    },
    { timestamps: true }
  ),
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

const phraseBundleCollection = new CollectionDefinition({
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
