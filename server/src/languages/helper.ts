/**
 * The one place the server turns a language value into a code (ADR-006 point 4, work list
 * B-01). Language values reach the server in many shapes: ISO codes ("fa", "FA", "pt-BR"),
 * English titles stored by the extension ("Persian", "Chinese (Simplified)"), native names,
 * old frontend codes ("ae", "he or iw"), and the markers "auto" / "unknown". Every function
 * that takes a language from a request or a stored document goes through here.
 *
 * Two defaults, never mixed up:
 * - a **stored** document with no `language` is English: `langOf(doc)`;
 * - a **request** with no `language` means the learner's active language (old clients):
 *   `requestLanguage(args, profile)`.
 */
import { LANGUAGES, LanguageInfo, RTL_CODES } from "./list";

export type LangCode = string;

/** The language every stored document without a `language` field belongs to. */
export const DEFAULT_LANGUAGE: LangCode = "en";

/** Markers a client sends when it has no language yet; `toCode` maps them to undefined. */
export const AUTO = "auto";
export const UNKNOWN = "unknown";

const BY_CODE = new Map<string, LanguageInfo>();
const BY_KEY = new Map<string, LanguageInfo>();

for (const lang of LANGUAGES) {
  BY_CODE.set(lang.code, lang);
  for (const key of [lang.code, lang.name, lang.nativeName, ...(lang.aliases || [])]) {
    BY_KEY.set(normalise(key), lang);
  }
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
}

/** True for the "no language yet" markers, an empty value or a non-string. */
export function isAutoOrUnknown(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const key = normalise(value);
  return key === "" || key === AUTO || key === UNKNOWN;
}

/**
 * The language code for a code, title, native name or alias, or undefined when the value
 * is empty, "auto", "unknown" or not a language we know. Region tags fold into the base
 * language ("pt-BR" → "pt", "de-AT" → "de"); a title's qualifier is dropped when the full
 * title is not known ("Spanish (Mexico)" → "es").
 */
export function toCode(value: unknown): LangCode | undefined {
  if (isAutoOrUnknown(value)) return undefined;
  const key = normalise(value as string);

  const direct = BY_KEY.get(key);
  if (direct) return direct.code;

  // "pt-BR", "zh-Hant-TW", "sv-SE": the primary subtag.
  const tag = /^([a-z]{2,3})(-[a-z0-9]{2,8})+$/.exec(key);
  if (tag && BY_CODE.has(tag[1])) return tag[1];

  // "Spanish (Mexico)": the title without its qualifier.
  const bare = key.replace(/\s*\(.*\)\s*$/, "");
  if (bare !== key) return BY_KEY.get(bare)?.code;

  return undefined;
}

/** True when the value names a language we know. */
export function isKnownLanguage(value: unknown): boolean {
  return toCode(value) !== undefined;
}

/** The English name ("Persian") for any language value; the input itself when unknown. */
export function toTitle(value: unknown): string {
  const code = toCode(value);
  if (code) return BY_CODE.get(code)!.name;
  return typeof value === "string" ? value : "";
}

/** The native name ("فارسی") for any language value; the English title when unknown. */
export function toNativeName(value: unknown): string {
  const code = toCode(value);
  if (code) return BY_CODE.get(code)!.nativeName;
  return toTitle(value);
}

/** True when the language is written right to left. */
export function isRtl(value: unknown): boolean {
  const code = toCode(value);
  return code ? RTL_CODES.includes(code) : false;
}

/**
 * The language a stored document belongs to. Documents written before multilingual have
 * no `language` and are English.
 */
export function langOf(doc: { language?: unknown } | null | undefined): LangCode {
  return toCode(doc?.language) ?? DEFAULT_LANGUAGE;
}

/**
 * The language a request is about: the `language` argument when the client sends one,
 * otherwise the learner's active language, otherwise English (an account from before
 * multilingual that the backfill has not reached). Old extension and mobile builds send
 * no `language`, so they keep working on the active language.
 */
export function requestLanguage(
  args: { language?: unknown } | null | undefined,
  profile: { learningLanguage?: unknown } | null | undefined
): LangCode {
  return toCode(args?.language) ?? toCode(profile?.learningLanguage) ?? DEFAULT_LANGUAGE;
}

/**
 * The Mongo filter for one language's documents, to spread into a query. Until the
 * migration's contract step (ADR-006 point 11) English also matches documents with no
 * `language`, which are English by `langOf`.
 *
 * English names each form on its own: `"en"`, a missing field, and `null`. On MongoDB
 * `null` alone also matches a missing field, but Firestore with MongoDB compatibility does
 * not promise that, so `{ $in: ["en", null] }` could miss old documents there. The `$or`
 * sits inside `$and`, so it never replaces a caller's own `$or` when spread into a query.
 *
 * For a per-user document that must be found exactly once (Leitner, Pool, board), use
 * `resolveLanguageDoc` in `language-docs.ts`, which does not match the language in the
 * database at all.
 */
export function languageFilter(language: LangCode): Record<string, any> {
  const code = toCode(language) ?? DEFAULT_LANGUAGE;
  if (code !== DEFAULT_LANGUAGE) return { language: code };
  return { $and: [{ $or: [{ language: DEFAULT_LANGUAGE }, { language: { $exists: false } }, { language: null }] }] };
}
