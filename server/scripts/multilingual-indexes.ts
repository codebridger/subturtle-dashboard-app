/**
 * The per-language indexes (ADR-006 point 11, B-27). Dry run by default.
 *
 *   yarn migrate:multilingual-indexes          # show the plan
 *   yarn migrate:multilingual-indexes --apply  # build them
 *
 * Builds the unique (userId, language) indexes on Leitner and Pool, the board key, the new
 * bundle index (refId, language, title) and the review-log key. A Leitner, Pool or board
 * index is refused while the backfill has not run (documents without language, or
 * duplicates). The old bundle index (refId, title) is dropped only after the new one exists.
 * A first build can take longer than the 45-second socket timeout on Firestore, which is why
 * this is a script and not a boot step.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

import { banner, connect, parseArgs } from "../src/migrations/cli";
import { ensureIndexes } from "../src/migrations/multilingual";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { connection, db, label } = await connect();
  try {
    banner("multilingual-indexes", options, label);
    const result = await ensureIndexes(db, options);
    if (result.blocked.length > 0) process.exitCode = 2;
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("[multilingual-indexes] failed:", error);
  process.exit(1);
});
