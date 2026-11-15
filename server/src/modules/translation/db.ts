import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { DATABASE_SCHEDULE, LEGACY_USAGE_COLLECTION } from "../../config";

/**
 * One row per (old field name, surface, UTC day): how many requests still used the old
 * name (B-17). Written only by the server (`countLegacyField`); administrators read it to
 * decide when the old name can go. No client access, so the data-provider guard never
 * serves it.
 */
const legacyUsageSchema = new Schema(
  {
    field: { type: String, required: true },
    surface: { type: String, required: true },
    day: { type: String, required: true }, // YYYY-MM-DD, UTC
    count: { type: Number, default: 0 },
    firstSeenAt: Date,
    lastSeenAt: Date,
  },
  { timestamps: false }
);

legacyUsageSchema.index({ field: 1, surface: 1, day: 1 }, { unique: true });

const legacyUsageCollection = defineCollection({
  database: DATABASE_SCHEDULE,
  collection: LEGACY_USAGE_COLLECTION,
  schema: legacyUsageSchema,
  permissions: [new Permission({ accessType: "admin", read: true, write: true })],
});

module.exports = [legacyUsageCollection];
