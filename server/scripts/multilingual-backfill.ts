/**
 * The multilingual backfill (work list "Migration and backfill", steps 1 and 3 to 8, and
 * the step 10 check; B-27). Dry run by default; safe to run twice; batched. Dev first.
 *
 *   yarn migrate:multilingual                  # measure + every step, dry run
 *   yarn migrate:multilingual --apply          # write
 *   --only profiles,phrases,bundles,leitner,pools,board,sessions              # some steps only
 *   --batch-size 500
 *
 * After it: scripts/multilingual-indexes.ts (unique indexes, then drop the old bundle one),
 * then scripts/review-log-snapshot.ts (step 9). Run this script again with no --apply as
 * the step 10 check: every "without language" count should be 0.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

import { banner, connect, parseArgs } from "../src/migrations/cli";
import { measure, runBackfill } from "../src/migrations/multilingual";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { connection, db, label } = await connect();
  try {
    banner("multilingual-backfill", options, label);
    console.log("[measure]", JSON.stringify(await measure(db, options), null, 2));
    const reports = await runBackfill(db, options, options.only);
    for (const r of reports) for (const note of r.notes.slice(0, 50)) console.log(`  ${r.step}: ${note}`);
    if (options.apply) console.log("[check]", JSON.stringify((await measure(db, options)).withoutLanguage));
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("[multilingual-backfill] failed:", error);
  process.exit(1);
});
