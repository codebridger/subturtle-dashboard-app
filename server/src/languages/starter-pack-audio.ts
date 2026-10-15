/**
 * Makes the starter pack audio once (B-22): one MP3 per item, spoken by the learning
 * language's Google Cloud TTS voice from the capability register, saved under
 * `<outDir>/<lang>/<id>.mp3`, and listed in the audio manifest so `get-starter-pack` can
 * add `audioUrl` once the files are hosted (STARTER_PACK_AUDIO_BASE_URL).
 *
 * Dry run by default: it only lists what it would make. An item whose manifest entry still
 * matches its text and voice is skipped, so a second run only makes what changed.
 * The files are for review (C-02: a native speaker rates them) before anyone hosts them.
 */
import * as fs from "fs";
import * as path from "path";
import { LangCode } from "./helper";
import { getLearningLanguage } from "./registry";
import { AudioEntry, StarterPack, audioTextHash } from "./starter-pack";

export type Synthesize = (request: { text: string; languageCode: string; voiceName: string }) => Promise<Buffer>;

export interface AudioManifest {
  $comment?: string;
  languages: Record<LangCode, Record<string, AudioEntry>>;
}

export interface GenerateOptions {
  packs: StarterPack[];
  synthesize: Synthesize;
  outDir: string;
  manifestPath: string;
  /** Only list what would be made. Default true. */
  dryRun?: boolean;
  /** At most this many new files per language (a trial run). */
  limitPerLanguage?: number;
  log?: (line: string) => void;
}

export interface GenerateReport {
  language: LangCode;
  voice: string;
  made: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
}

/** The BCP-47 code of a Google voice name: "de-DE-Chirp3-HD-Kore" → "de-DE". */
export function languageCodeOfVoice(voice: string): string {
  const match = /^([a-z]{2,3}-[A-Z]{2})-/.exec(voice);
  if (!match) throw new Error(`Cannot read the language code of voice ${voice}`);
  return match[1];
}

export function readManifest(manifestPath: string): AudioManifest {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { ...parsed, languages: parsed.languages || {} };
  } catch {
    return { languages: {} };
  }
}

export async function generateStarterPackAudio(options: GenerateOptions): Promise<GenerateReport[]> {
  const { packs, synthesize, outDir, manifestPath, dryRun = true, limitPerLanguage, log = () => undefined } = options;
  const manifest = readManifest(manifestPath);
  const reports: GenerateReport[] = [];

  for (const pack of packs) {
    const caps = getLearningLanguage(pack.language);
    if (!caps) throw new Error(`${pack.language} is not a learning language in the register`);
    const voice = caps.ttsVoice;
    const languageCode = languageCodeOfVoice(voice);
    const entries = (manifest.languages[pack.language] = manifest.languages[pack.language] || {});
    const report: GenerateReport = { language: pack.language, voice, made: [], skipped: [], failed: [] };

    for (const item of pack.items) {
      const hash = audioTextHash(item.text, voice);
      const file = `${pack.language}/${item.id}.mp3`;
      if (entries[item.id]?.textHash === hash && (dryRun || fs.existsSync(path.join(outDir, file)))) {
        report.skipped.push(item.id);
        continue;
      }
      if (limitPerLanguage !== undefined && report.made.length + report.failed.length >= limitPerLanguage) break;
      if (dryRun) {
        report.made.push(item.id);
        continue;
      }
      try {
        const audio = await synthesize({ text: item.text, languageCode, voiceName: voice });
        fs.mkdirSync(path.join(outDir, pack.language), { recursive: true });
        fs.writeFileSync(path.join(outDir, file), audio);
        entries[item.id] = { file, voice, textHash: hash };
        report.made.push(item.id);
      } catch (error: any) {
        report.failed.push({ id: item.id, error: error?.message || String(error) });
      }
    }
    log(`${pack.language} (${voice}): ${dryRun ? "would make" : "made"} ${report.made.length}, up to date ${report.skipped.length}, failed ${report.failed.length}`);
    reports.push(report);
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
  return reports;
}
