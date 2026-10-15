/**
 * Starter pack audio (B-22). Dry run by default.
 *
 *   yarn starter-pack:audio                       # list what would be made, every pack
 *   yarn starter-pack:audio --languages de,es     # only these packs
 *   yarn starter-pack:audio --write --limit 3     # make 3 files per language (a trial)
 *   yarn starter-pack:audio --write               # make every missing or changed file
 *   --out <dir>        where the MP3s go (default: server/starter-pack-audio, not committed)
 *   --manifest <file>  the manifest to update (default: src/languages/starter-packs/audio/manifest.json)
 *
 * Needs GCP_API_KEY (server/.env). It writes local files only; it uploads nothing. Host
 * the files after the native-speaker check (C-02), then set STARTER_PACK_AUDIO_BASE_URL.
 */
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

import { generateStarterPackAudio } from "../src/languages/starter-pack-audio";
import { getStarterPack } from "../src/languages/starter-pack";
import { synthesizeSpeech } from "../src/modules/translation/tts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const write = process.argv.includes("--write");
  const languages = (arg("languages") || "en,es,de,fr,it,sv,lt").split(",").map((l) => l.trim()).filter(Boolean);
  const packs = languages.map((language) => {
    const pack = getStarterPack(language);
    if (!pack) throw new Error(`No starter pack for ${language}`);
    return pack;
  });
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  if (write && !process.env.GCP_API_KEY) throw new Error("GCP_API_KEY is not set");

  const reports = await generateStarterPackAudio({
    packs,
    synthesize: synthesizeSpeech,
    outDir: path.resolve(arg("out") || path.join(__dirname, "../starter-pack-audio")),
    manifestPath: path.resolve(arg("manifest") || path.join(__dirname, "../src/languages/starter-packs/audio/manifest.json")),
    dryRun: !write,
    limitPerLanguage: limit,
    log: (line) => console.log(line),
  });
  for (const report of reports) for (const failure of report.failed) console.error(`  ${report.language} ${failure.id}: ${failure.error}`);
  if (!write) console.log("Dry run: nothing was made. Add --write to make the files.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
