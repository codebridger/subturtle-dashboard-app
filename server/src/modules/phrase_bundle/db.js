const {
  CollectionDefinition,
  Schema,
  Permission,
  Schemas,
  DatabaseTrigger,
} = require("@modular-rest/server");

const {
  DATABASE,
  BUNDLE_COLLECTION,
  PHRASE_COLLECTION,
} = require("../../config");

const phraseCollection = new CollectionDefinition({
  db: DATABASE,
  collection: PHRASE_COLLECTION,
  schema: new Schema(
    {
      phrase: { type: String },
      translation: { type: String },
      translation_language: String,
      refId: String,
      images: [Schemas.file],
    },
    { timestamps: true }
  ),
  permissions: [
    new Permission({
      type: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    }),
  ],
});

const phraseBundleSchema = new Schema(
  {
    refId: { type: String, required: true },
    title: { type: String, required: true },
    desc: String,
    image: Schemas.file,
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
  db: DATABASE,
  collection: BUNDLE_COLLECTION,
  schema: phraseBundleSchema,
  permissions: [
    new Permission({
      type: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    }),
  ],
  triggers: [],
});

module.exports = [phraseCollection, phraseBundleCollection];
