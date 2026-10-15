/**
 * The authored starter packs (B-21) and their audio (B-22).
 *
 * The packs are `starter-packs/<lang>.json` (C-01, validated by
 * `starter-packs/__tests__/starter-packs.test.ts`). They are imported, not read from disk,
 * so `tsc` copies them into `dist/` (`resolveJsonModule`) and the API image has them.
 *
 * Audio: `starter-packs/audio/manifest.json` lists the items that have an MP3 (the audio
 * script writes it). An item gets `audioUrl` only when the manifest has it, its text has not
 * changed since, and `STARTER_PACK_AUDIO_BASE_URL` is set. Otherwise clients speak the text
 * with `textToSpeechBase64`.
 */
import { createHash } from "crypto";
import { LangCode, toCode } from "./helper";
import en from "./starter-packs/en.json";
import es from "./starter-packs/es.json";
import de from "./starter-packs/de.json";
import fr from "./starter-packs/fr.json";
import it from "./starter-packs/it.json";
import sv from "./starter-packs/sv.json";
import lt from "./starter-packs/lt.json";
import audioManifest from "./starter-packs/audio/manifest.json";

export interface StarterPackItem {
  id: string;
  text: string;
  lemma?: string;
  /** The cloze target exactly as it appears in `text` (not a grammar label). */
  form?: string;
  translations: Record<string, string>;
  band: 1 | 2 | 3;
  group: string;
  note?: string;
}

export interface StarterPack {
  language: LangCode;
  version: number;
  groups: { id: string; name: string }[];
  items: StarterPackItem[];
}

export interface AudioEntry {
  file: string;
  voice: string;
  textHash: string;
}

const PACKS: Record<LangCode, StarterPack> = {};
for (const pack of [en, es, de, fr, it, sv, lt] as unknown as StarterPack[]) PACKS[pack.language] = pack;

let overrides: Record<LangCode, StarterPack> | null = null;
let audioOverride: Record<LangCode, Record<string, AudioEntry>> | null = null;

/** Tests swap in small fixture packs and audio manifests. */
export function setStarterPacksForTest(packs: StarterPack[] | null, audio?: Record<LangCode, Record<string, AudioEntry>> | null) {
  overrides = packs ? Object.fromEntries(packs.map((pack) => [pack.language, pack])) : null;
  audioOverride = audio ?? null;
}

/** The pack of a learning language, or undefined when none is authored. */
export function getStarterPack(language: unknown): StarterPack | undefined {
  const code = toCode(language);
  if (!code) return undefined;
  return (overrides ?? PACKS)[code];
}

/** The hash an audio file is made from; a changed text needs new audio. */
export function audioTextHash(text: string, voice: string): string {
  return createHash("sha256").update(`${voice}\n${text}`).digest("hex").slice(0, 16);
}

function audioEntries(language: LangCode): Record<string, AudioEntry> {
  const all = audioOverride ?? ((audioManifest as any).languages as Record<LangCode, Record<string, AudioEntry>>);
  return all?.[language] ?? {};
}

/** The item's audio URL, when stored audio matches its text and a base URL is set. */
export function audioUrlFor(language: LangCode, item: StarterPackItem): string | undefined {
  const base = (process.env.STARTER_PACK_AUDIO_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return undefined;
  const entry = audioEntries(language)[item.id];
  if (!entry || entry.textHash !== audioTextHash(item.text, entry.voice)) return undefined;
  return `${base}/${entry.file.replace(/^\/+/, "")}`;
}

/**
 * The translation for a learner's own language: that language, then English, then the
 * first one the item has. Returns the language it picked too.
 */
export function translationFor(item: StarterPackItem, own: LangCode | null | undefined): { translation: string; translationLanguage: LangCode } {
  const translations = item.translations || {};
  for (const code of [own, "en"]) {
    if (code && translations[code]) return { translation: translations[code], translationLanguage: code };
  }
  const [first] = Object.entries(translations);
  return first ? { translation: first[1], translationLanguage: first[0] } : { translation: "", translationLanguage: own || "en" };
}
