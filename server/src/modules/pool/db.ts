import { Schema, defineCollection, Permission } from "@modular-rest/server";
import { DATABASE_POOL, POOL_COLLECTION } from "../../config";

/**
 * One pooled phrase awaiting its first-encounter (encode) session.
 * - `pooled_at` — server-set timestamp; the 7-day age-out is measured from this,
 *   so it must never come from the client.
 * - `encountered` — set true only by a real Pool session (`complete-pool-session`).
 *   The silent age-out promotes to Leitner L1 WITHOUT setting it, so the data can
 *   tell "aged into L1 unlearned" apart from "encoded then promoted".
 */
export interface PoolItem {
  phraseId: string;
  pooled_at: Date;
  encountered: boolean;
}

/**
 * The Pool is one document per user holding a list of pending phrase IDs. This
 * array shape is right for the current scale; the only known ceiling is Mongo's
 * 16 MB per-document limit (thousands of pooled items) — the future fix, if ever
 * needed, is one document per item.
 */
export interface Pool {
  userId: string;
  items: PoolItem[];
}

const poolSchema = new Schema<Pool>(
  {
    userId: { type: String, required: true, index: true },
    items: {
      type: [
        {
          phraseId: { type: String, ref: "phrase" }, // Cross-DB reference
          pooled_at: { type: Date, required: true },
          encountered: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const poolCollection = defineCollection({
  database: DATABASE_POOL,
  collection: POOL_COLLECTION,
  schema: poolSchema,
  permissions: [
    new Permission({
      accessType: "owner",
      read: true,
      write: true,
    }),
    new Permission({
      accessType: "admin",
      read: true,
      write: true,
    }),
  ],
});

module.exports = [poolCollection];
