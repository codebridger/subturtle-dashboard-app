#!/usr/bin/env node
/**
 * backfill-profile-review-settings.mjs — one-time migration.
 *
 * reviewHour/reviewInterval moved from the Leitner system doc (leitner_system.settings)
 * onto the profile doc. getSettings() reads profile-first with a fallback to Leitner,
 * so nothing breaks without this — but the fallback is a safety net, not the home:
 * copy each user's existing values onto their profile once, at deploy, so the profile
 * is authoritative and the legacy Leitner fields can be dropped a release later.
 *
 * Idempotent: skips any profile that already has `reviewHour` set. Safe to re-run.
 *
 * Usage (from the server/ workspace so server/.env resolves):
 *   cd server && node scripts/backfill-profile-review-settings.mjs
 *   cd server && node scripts/backfill-profile-review-settings.mjs --dry-run
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// mongodb 3.x ships CommonJS — no named ESM exports, so import the default.
import mongodb from 'mongodb';
const { MongoClient } = mongodb;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const BASE = process.env.MONGO_BASE_ADDRESS || 'mongodb://localhost:27017';
const PREFIX = process.env.MONGO_DB_PREFIX || 'subturtle_';
const DB_NAME = `${PREFIX}user_content`;

async function main() {
  const client = await MongoClient.connect(BASE, { useUnifiedTopology: true, useNewUrlParser: true });
  try {
    const db = client.db(DB_NAME);
    // Mongoose/modular-rest pluralize collection names (config `leitner_system` /
    // `profile` become `leitner_systems` / `profiles` on disk).
    const leitner = db.collection('leitner_systems');
    const profiles = db.collection('profiles');

    const systems = await leitner.find({}).toArray();
    console.log(`[backfill] ${systems.length} Leitner system doc(s) in ${DB_NAME}`);

    let updated = 0;
    let skipped = 0;
    for (const sys of systems) {
      const userId = sys.userId;
      if (!userId) continue;

      const reviewHour = sys?.settings?.reviewHour ?? 9;
      const reviewInterval = sys?.settings?.reviewInterval ?? 1;

      const profile = await profiles.findOne({ refId: userId });
      // Already backfilled (or user set it in the new UI) → leave it alone.
      if (profile && profile.reviewHour !== undefined && profile.reviewHour !== null) {
        skipped++;
        continue;
      }

      console.log(`[backfill] ${userId}: reviewHour=${reviewHour} reviewInterval=${reviewInterval}${DRY_RUN ? ' (dry-run)' : ''}`);
      if (!DRY_RUN) {
        await profiles.updateOne(
          { refId: userId },
          { $set: { reviewHour, reviewInterval } },
          { upsert: true }
        );
      }
      updated++;
    }

    console.log(`[backfill] done — updated ${updated}, skipped ${skipped}${DRY_RUN ? ' (dry-run, no writes)' : ''}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
