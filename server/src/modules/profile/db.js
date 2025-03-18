const {
  CollectionDefinition,
  Schema,
  Permission,
  Schemas,
} = require("@modular-rest/server");

const { DATABASE, PROFILE_COLLECTION } = require("../../config");

const profileCollection = new CollectionDefinition({
  db: DATABASE,
  collection: PROFILE_COLLECTION,
  schema: new Schema(
    {
      gPicture: String,
      name: String,
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

module.exports = [profileCollection];
