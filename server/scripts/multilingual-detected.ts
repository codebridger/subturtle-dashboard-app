/**
 * Phrases the multilingual backfill defaulted to English although another language was
 * detected: move them to their real language. Dry run by default; safe to run twice.
 *
 *   yarn migrate:multilingual-detected                       # the plan, one line per phrase
 *   yarn migrate:multilingual-detected --apply               # write
 *   --ids a,b          only these phrase ids (the ones you confirmed)
 *   --exclude a,b      never these phrase ids (a wrong guess)
 *   --languages de,es  only these detected languages
 *
 * Run it right after `yarn migrate:multilingual --apply`, before the indexes and the
 * review-log snapshot. See src/migrations/multilingual-detected.ts for what it moves.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

import { banner, connect, parseArgs } from "../src/migrations/cli";
import { moveDetectedPhrases } from "../src/migrations/multilingual-detected";

function list(argv: string[], name: string): string[] {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  const i = argv.indexOf(`--${name}`);
  const raw = inline ? inline.slice(name.length + 3) : i >= 0 ? argv[i + 1] : "";
  return (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  const { connection, db, label } = await connect();
  try {
    banner("multilingual-detected", options, label);
    const report = await moveDetectedPhrases(db, {
      apply: options.apply,
      batchSize: options.batchSize,
      ids: list(argv, "ids"),
      exclude: list(argv, "exclude"),
      languages: list(argv, "languages"),
    });
    const { notes, ...counts } = report;
    console.log("[summary]", JSON.stringify(counts, null, 2));
    for (const note of notes) console.log(`  ${note}`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("[multilingual-detected] failed:", error);
  process.exit(1);
});
