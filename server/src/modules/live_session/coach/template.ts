/**
 * Builds the Coach prompt for one learning language (B-19) and picks its voice (B-20).
 */
import { DEFAULT_LANGUAGE, LangCode, toCode, toTitle } from "../../../languages/helper";
import { DEFAULT_LIVE_SESSION_VOICE, LIVE_SESSION_VOICES } from "../voices";
import { COACH_TEMPLATE, FALLBACK_EXPLANATION, PHRASE_LINE } from "./template-text";

export type CoachMode = "voice" | "text";
export type CefrLevel = "A1" | "A2" | "B1" | "B2";

export interface CoachPhrase {
  phrase: string;
  translation?: string;
}

export interface CoachPromptInput {
  /** The learning language code. */
  language: LangCode;
  /** The language the Coach explains in; null when the server does not know it. */
  explanationLanguage: LangCode | null;
  phrases: CoachPhrase[];
  mode: CoachMode;
  /** The start level of this language; null for a learner from before multilingual. */
  level?: CefrLevel | null;
}

// What the Coach watches for in each language, beyond the vocabulary. English has none:
// an English session keeps today's prompt.
const LANGUAGE_NOTES: Record<LangCode, string> = {
  es: "When a noun comes up, say it with its article (el/la) so the gender is learnt with it. Watch ser and estar, and the accent marks; a missing accent that changes the word (si / sí) is worth a short note.",
  de: "When a noun comes up, say it with its article (der/die/das). Point out separable verbs (the prefix goes to the end: \"Ich fange morgen an\") and that the verb comes second in a main clause.",
  fr: "When a noun comes up, say it with its article (le/la) so the gender is learnt with it. Watch the accents and the liaison; model the natural spoken form.",
  it: "When a noun comes up, say it with its article (il/la) so the gender is learnt with it. Watch double consonants and the accents (è / e).",
  sv: "When a noun comes up, say it with en or ett. Point out that the verb comes second in a main clause, and particle verbs (tycka om).",
  lt: "Point out the case endings: when a word changes its ending, name the case in a few words (\"knyga\" → \"knygą\": accusative). Keep the stress clear when you model a word.",
};

const LEVEL_NOTES: Record<CefrLevel, string> = {
  A1: "The learner is a beginner (A1) in [learningLanguage]. Keep every [learningLanguage] line short: three to six simple words. Model the line first, then ask them to say it back (\"Say this in [learningLanguage]: …\"). Explain in [nativeLanguage] after each line. Do not ask open questions in [learningLanguage] yet.",
  A2: "The learner is at A2 in [learningLanguage]. Use short, simple sentences and everyday words, one new thing at a time. Explain in [nativeLanguage] when they get stuck.",
  B1: "The learner is at B1 in [learningLanguage]. Use natural everyday sentences; explain in [nativeLanguage] only when they ask or get stuck.",
  B2: "The learner is at B2 in [learningLanguage]. Talk naturally, with some idioms; explain in [nativeLanguage] only when they ask.",
};

/** The notes block that goes before the tools section; "" when there is nothing to add. */
export function coachNotes(input: Pick<CoachPromptInput, "language" | "level" | "mode">): string {
  const lines: string[] = [];
  const code = toCode(input.language) ?? DEFAULT_LANGUAGE;
  if (input.level && LEVEL_NOTES[input.level]) lines.push(LEVEL_NOTES[input.level]);
  if (LANGUAGE_NOTES[code]) lines.push(LANGUAGE_NOTES[code]);
  // The Live API picks the spoken language from the conversation; a native-audio model
  // takes no language code, so the prompt carries the hint (B-20).
  if (input.mode === "voice" && code !== DEFAULT_LANGUAGE) {
    lines.push("Speak every [learningLanguage] line with a natural native [learningLanguage] accent, and switch to [nativeLanguage] only for explanations.");
  }
  if (!lines.length) return "";
  return "\n\n    Level and language:\n" + lines.map((line) => `    - ${line}`).join("\n");
}

/** The numbered vocabulary list. */
export function phraseList(phrases: CoachPhrase[]): string {
  return phrases
    .map((p, i) =>
      PHRASE_LINE.replace("{index}", () => String(i + 1))
        .replace("{phrase}", () => p.phrase ?? "")
        .replace("{translation}", () => p.translation ?? "")
    )
    .join("\n");
}

/** The name the prompt uses for the explanation language. */
export function explanationName(explanationLanguage: LangCode | null): string {
  return explanationLanguage ? toTitle(explanationLanguage) : FALLBACK_EXPLANATION;
}

/** The whole Coach system prompt. */
export function buildCoachInstructions(input: CoachPromptInput): string {
  const learning = toTitle(toCode(input.language) ?? DEFAULT_LANGUAGE);
  const native = explanationName(input.explanationLanguage);
  // Fill the notes first: they hold placeholders too.
  return COACH_TEMPLATE.replace("[coachNotes]", coachNotes(input))
    .replace(/\[learningLanguage\]/g, learning)
    .replace(/\[nativeLanguage\]/g, native)
    .replace("[phrases]", () => phraseList(input.phrases));
}

// Gemini Live prebuilt voices are multilingual: each speaks every language on the Live
// API's list, which includes Spanish, German, French, Italian, Swedish and Lithuanian.
// Each learning language has a default the Coach starts with (B-20); the learner may pick
// any voice from `get-live-session-voices`.
export const COACH_VOICE_BY_LANGUAGE: Record<LangCode, string> = {
  en: "Kore",
  es: "Kore",
  de: "Kore",
  fr: "Kore",
  it: "Kore",
  sv: "Kore",
  lt: "Kore",
};

/** The voice for a session: the requested one when it is a known voice, else the language's default. */
export function coachVoiceFor(language: unknown, requested?: unknown): string {
  if (typeof requested === "string" && LIVE_SESSION_VOICES.some((voice) => voice.name === requested)) return requested;
  const code = toCode(language) ?? DEFAULT_LANGUAGE;
  return COACH_VOICE_BY_LANGUAGE[code] ?? DEFAULT_LIVE_SESSION_VOICE;
}
