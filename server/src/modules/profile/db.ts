import {
  CollectionDefinition,
  Schema,
  Permission,
  schemas,
} from "@modular-rest/server";

import { DATABASE, PROFILE_COLLECTION } from "../../config";

const profileCollection = new CollectionDefinition({
  database: DATABASE,
  collection: PROFILE_COLLECTION,
  schema: new Schema(
    {
      gPicture: String,
      name: String,
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

module.exports = [profileCollection];
