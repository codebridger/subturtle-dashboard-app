/**
 * The one-time review log snapshot (B-30, work list migration step 9). Dry run by default.
 *
 *   yarn migrate:review-log-snapshot           # count the rows it would write
 *   yarn migrate:review-log-snapshot --apply   # write them
 *
 * Writes one `snapshot` row per card in every Leitner document (language, box, last review
 * date). Safe to run twice: rows are keyed `snapshot:<language>:<phraseId>` per user.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

import { banner, connect, parseArgs } from "../src/migrations/cli";
import { snapshotReviewLog } from "../src/migrations/multilingual";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { connection, db, label } = await connect();
  try {
    banner("review-log-snapshot", options, label);
    await snapshotReviewLog(db, options);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("[review-log-snapshot] failed:", error);
  process.exit(1);
});
