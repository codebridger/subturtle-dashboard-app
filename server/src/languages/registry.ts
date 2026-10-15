/**
 * The capability register (ADR-006 point 9, work list B-02): which languages a learner can
 * study, and which features each one has. It is code, not data, on purpose: a language or
 * a feature goes live through a reviewed PR, after its teacher checks pass. Clients read it
 * through the public `get-language-capabilities` function and hide what a language lacks.
 *
 * `LANGUAGES_ENABLED` (comma-separated codes, e.g. "en,de") switches learning languages on
 * or off without a deploy of this file, for the dark phases. When it is unset every
 * language marked `enabled` here is on; when it is set, exactly the listed ones are.
 * English always stays on: every existing learner studies it.
 */
import { DEFAULT_LANGUAGE, LangCode, isRtl, toCode, toNativeName, toTitle } from "./helper";
import { LANGUAGES } from "./list";

export interface LanguageFeatures {
  save: boolean;
  review: boolean;
  cloze: boolean;
  coachText: boolean;
  coachVoice: boolean;
  levelTest: boolean;
  starterPack: boolean;
  map: boolean;
}

export interface LearningLanguageCaps {
  code: LangCode;
  name: string;
  nativeName: string;
  rtl: boolean;
  ttsVoice: string;
  enabled: boolean;
  features: LanguageFeatures;
}

export interface OwnLanguage {
  code: LangCode;
  name: string;
  nativeName: string;
  rtl: boolean;
  /** "teacher": a teacher checked the Coach's explanations in this language; "ai": not yet. */
  explanationReviewed: "teacher" | "ai";
}

interface LearningEntry {
  code: LangCode;
  ttsVoice: string;
  enabled: boolean;
  features: LanguageFeatures;
}

// The launch set (Council 008, Q15). The knowledge map is the next round, so `map` is off.
// `starterPack` follows the authored packs (B-21: es, de, fr, it); a language without a
// pack starts on "Save your first phrase". Voices are Google Cloud TTS Chirp 3 HD, the only
// high-quality family with a Lithuanian voice (B-20).
const LEARNING: LearningEntry[] = [
  {
    code: "en",
    ttsVoice: "en-US-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: false, map: false },
  },
  {
    code: "es",
    ttsVoice: "es-ES-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: true, map: false },
  },
  {
    code: "de",
    ttsVoice: "de-DE-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: true, map: false },
  },
  {
    code: "fr",
    ttsVoice: "fr-FR-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: true, map: false },
  },
  {
    code: "it",
    ttsVoice: "it-IT-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: true, map: false },
  },
  {
    code: "sv",
    ttsVoice: "sv-SE-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: false, map: false },
  },
  {
    code: "lt",
    ttsVoice: "lt-LT-Chirp3-HD-Kore",
    enabled: true,
    features: { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: false, map: false },
  },
];

// Own languages whose Coach explanations a teacher has checked (Q10). Every other own
// language is allowed, with explanations written by the AI and not yet checked.
const TEACHER_REVIEWED: LangCode[] = ["fa", "ar", "es", "vi", "en", "tr"];

/** The codes `LANGUAGES_ENABLED` switches on, or null when the variable is unset. */
function enabledOverride(): Set<LangCode> | null {
  const raw = process.env.LANGUAGES_ENABLED;
  if (raw === undefined || raw.trim() === "") return null;
  const codes = raw
    .split(",")
    .map((value) => toCode(value))
    .filter((code): code is LangCode => Boolean(code));
  return new Set([DEFAULT_LANGUAGE, ...codes]);
}

/** Every learning language in the register, with `enabled` after the env override. */
export function getLearningLanguages(): LearningLanguageCaps[] {
  const override = enabledOverride();
  return LEARNING.map((entry) => ({
    code: entry.code,
    name: toTitle(entry.code),
    nativeName: toNativeName(entry.code),
    rtl: isRtl(entry.code),
    ttsVoice: entry.ttsVoice,
    enabled: override ? override.has(entry.code) : entry.enabled,
    features: { ...entry.features },
  }));
}

/** One learning language's capabilities, or undefined when it is not in the register. */
export function getLearningLanguage(value: unknown): LearningLanguageCaps | undefined {
  const code = toCode(value);
  return code ? getLearningLanguages().find((lang) => lang.code === code) : undefined;
}

/** True when learners can add and study the language now. */
export function isLearningLanguageEnabled(value: unknown): boolean {
  return getLearningLanguage(value)?.enabled === true;
}

/** True when the language is enabled and has the feature. */
export function hasFeature(value: unknown, feature: keyof LanguageFeatures): boolean {
  const lang = getLearningLanguage(value);
  return Boolean(lang?.enabled && lang.features[feature]);
}

/** Every own language a learner can pick, English names A to Z. */
export function getOwnLanguages(): OwnLanguage[] {
  return LANGUAGES.map((lang) => ({
    code: lang.code,
    name: lang.name,
    nativeName: lang.nativeName,
    rtl: isRtl(lang.code),
    explanationReviewed: TEACHER_REVIEWED.includes(lang.code) ? ("teacher" as const) : ("ai" as const),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/** One own language, or undefined when the value is not a language we know. */
export function getOwnLanguage(value: unknown): OwnLanguage | undefined {
  const code = toCode(value);
  return code ? getOwnLanguages().find((lang) => lang.code === code) : undefined;
}

/** The whole register, as `get-language-capabilities` returns it. */
export function getLanguageCapabilities(): { learning: LearningLanguageCaps[]; own: OwnLanguage[] } {
  return { learning: getLearningLanguages(), own: getOwnLanguages() };
}
