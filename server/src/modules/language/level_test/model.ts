/**
 * The two model calls of the level test (B-31), on the existing Gemini text setup
 * (`@google/genai`, `GEMINI_API_KEY`, the priced models in live_session_text/config.ts):
 *
 * - `nextQuestion`: the Coach's next short question in the learning language, a few words
 *   reacting to the last answer, and help in the learner's own language;
 * - `grade`: a start level A1 to B2 and one plain line of why.
 *
 * Both ask for JSON with a schema and check what comes back; anything else throws, and the
 * service falls back (a fixed question, or A1).
 */
import { GoogleGenAI } from "@google/genai";
import { toTitle } from "../../../languages/helper";
import { mapUsage } from "../../live_session_text/utils";
import type { TextTokenUsageType } from "../../live_session_text/types";

export const QUESTION_MODEL = "gemini-2.5-flash-lite";
export const GRADE_MODEL = "gemini-2.5-flash";
export const TOTAL_QUESTIONS = 6;
export const LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type StartLevel = (typeof LEVELS)[number];

export interface Turn {
  ai: string;
  help?: string;
  answer?: string;
}

export interface ModelResult<T> {
  value: T;
  usage: TextTokenUsageType;
  model: string;
}

function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function ownName(explanationLanguage: string | null): string {
  return explanationLanguage ? toTitle(explanationLanguage) : "English";
}

/** The chat so far as one block of text for the prompts. */
export function transcript(turns: Turn[]): string {
  return turns
    .map((turn, i) => `Coach (question ${i + 1}): ${turn.ai}${turn.answer !== undefined ? `\nLearner: ${turn.answer || "(no answer)"}` : ""}`)
    .join("\n");
}

export function questionPrompt(language: string, explanationLanguage: string | null, index: number): string {
  const learning = toTitle(language);
  const own = ownName(explanationLanguage);
  return `You are the Subturtle Coach. You are running a short, friendly placement chat in ${learning} to find where a learner should start. The learner's own language is ${own}.
Write question ${index} of ${TOTAL_QUESTIONS}.
- "ai": in ${learning} only. If there is a previous answer, first react to it in at most six simple words (no corrections, no grading), then ask exactly ONE short question.
- Start very easy and step up: question 1 to 2 at A1 (name, where they live, family), 3 at A2 (daily life, likes), 4 at A2 to B1 (the past: last weekend, a trip), 5 at B1 (plans and reasons), 6 at B2 (an opinion with reasons, or "what would you do if ...").
- If the last answer was empty, very short, or not in ${learning}, do not step up: ask an easier question instead.
- Keep it under 25 words. No lists, no emojis, no translations inside "ai".
- "help": written in ${own} only, never in ${learning}: the question in plain words, plus at most one short tip on how to answer in ${learning}. Under 30 words.`;
}

export function gradePrompt(language: string): string {
  const learning = toTitle(language);
  return `You are a careful CEFR examiner for ${learning}. Read the placement chat and choose where the learner should START: A1, A2, B1 or B2.
- Judge only the learner's own answers in ${learning}: range of words, grammar (past and future forms, linking words, subordinate clauses), and how much they could say.
- Empty answers, answers in another language, or answers that only copy the question are no evidence.
- Be conservative: when unsure between two levels, choose the lower one. A1 if there is little or no evidence.
- "reason": one plain English sentence of at most 20 words, written to the learner as "you", about what your answers showed. Kind and specific. No grammar terms (say "you talked about the past", not "past tense"), no level names.`;
}

const QUESTION_SCHEMA = {
  type: "OBJECT",
  properties: { ai: { type: "STRING" }, help: { type: "STRING" } },
  required: ["ai", "help"],
};

const GRADE_SCHEMA = {
  type: "OBJECT",
  properties: { startLevel: { type: "STRING", enum: [...LEVELS] }, reason: { type: "STRING" } },
  required: ["startLevel", "reason"],
};

async function askJson(model: string, systemInstruction: string, user: string, schema: object): Promise<{ json: any; usage: TextTokenUsageType }> {
  const res = await client().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: { systemInstruction, responseMimeType: "application/json", responseSchema: schema as any, temperature: 0.4 },
  });
  const text = res.text ?? "";
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`the model did not return JSON: ${text.slice(0, 120)}`);
  }
  return { json, usage: mapUsage(res.usageMetadata) };
}

function cleanLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function nextQuestion(
  language: string,
  explanationLanguage: string | null,
  turns: Turn[],
  index: number
): Promise<ModelResult<{ ai: string; help: string }>> {
  const user = turns.length ? `The chat so far:\n${transcript(turns)}\n\nWrite question ${index}.` : `Write question 1.`;
  const { json, usage } = await askJson(QUESTION_MODEL, questionPrompt(language, explanationLanguage, index), user, QUESTION_SCHEMA);
  const ai = cleanLine(json?.ai, 400);
  if (!ai) throw new Error("the model returned an empty question");
  return { value: { ai, help: cleanLine(json?.help, 400) }, usage, model: QUESTION_MODEL };
}

export async function grade(language: string, turns: Turn[]): Promise<ModelResult<{ startLevel: StartLevel; reason: string }>> {
  const { json, usage } = await askJson(GRADE_MODEL, gradePrompt(language), `The placement chat:\n${transcript(turns)}`, GRADE_SCHEMA);
  const startLevel = json?.startLevel;
  if (!LEVELS.includes(startLevel)) throw new Error(`the model returned no level: ${JSON.stringify(json).slice(0, 120)}`);
  const reason = cleanLine(json?.reason, 240);
  if (!reason) throw new Error("the model returned no reason");
  return { value: { startLevel, reason }, usage, model: GRADE_MODEL };
}
