import {
  Schema,
  Permission,
  schemas,
  defineCollection,
} from "@modular-rest/server";

import { DATABASE, PROFILE_COLLECTION } from "../../config";

import triggers from "./triggers";

const profileCollection = defineCollection({
  database: DATABASE,
  collection: PROFILE_COLLECTION,
  schema: new Schema(
    {
      gPicture: String,
      name: String,
      refId: String,
      timeZone: String,
      images: [schemas.file],
      // Smart Review / Pool user settings. These live on the profile (the user
      // settings doc). reviewHour/reviewInterval were historically on the Leitner
      // system doc; getSettings now reads them here first, falling back to Leitner
      // then defaults (see the one-time backfill script).
      reviewHour: { type: Number, default: 9 }, // 0-23, daily review time
      reviewInterval: { type: Number, default: 1 }, // days between review sessions
      poolAgeCutoffDays: { type: Number, default: 7 }, // Pool age-out cut-off
      poolChunkSize: { type: Number, default: 10 }, // items per encode chunk
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
  triggers: triggers,
});

module.exports = [profileCollection];
