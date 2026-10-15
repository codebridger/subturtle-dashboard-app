/**
 * The server side of the Coach prompt (B-19, B-20, Q3, Q10): which language, who explains,
 * at what level, which phrases, which voice; and the "This explanation looks wrong" flags.
 */
import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  COACH_EXPLANATION_FLAG_COLLECTION,
  DATABASE,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  PHRASE_COLLECTION,
  PROFILE_COLLECTION,
} from "../../../config";
import { DEFAULT_LANGUAGE, LangCode, isAutoOrUnknown, langOf, requestLanguage, toCode } from "../../../languages/helper";
import { getLearningLanguage, getOwnLanguage, hasFeature } from "../../../languages/registry";
import { readLanguageProfile } from "./language-profile";
import { CefrLevel, CoachMode, CoachPhrase, buildCoachInstructions, coachVoiceFor } from "./template";

/** Most phrases one Coach session practises. */
export const MAX_COACH_PHRASES = 50;

/** Learners who flag one pair within this many days before it switches to English (Q10). */
export const FLAG_WINDOW_DAYS = 30;

/** How many different learners must flag a pair before its explanations switch to English. */
export function flagThreshold(): number {
  const value = Number(process.env.COACH_FLAG_SWITCH_THRESHOLD);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
}

export class CoachError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export interface CoachRequest {
  language?: unknown;
  explanationLanguage?: unknown;
  phraseIds?: unknown;
  mode?: unknown;
  voice?: unknown;
}

export interface CoachSession {
  instructions: string;
  voiceName: string;
  language: LangCode;
  /** The language the prompt explains in; null when unknown (the prompt then adapts). */
  explanationLanguage: LangCode | null;
  /** True when many flags moved this pair to English explanations. */
  explanationSwitchedToEnglish: boolean;
  level: CefrLevel | null;
  phraseIds: string[];
}

/** The phrase ids of a request, valid ObjectIds only, in order, without repeats. */
export function cleanPhraseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const id of value) {
    const text = typeof id === "string" ? id : String(id ?? "");
    if (Types.ObjectId.isValid(text) && !ids.includes(text)) ids.push(text);
    if (ids.length >= MAX_COACH_PHRASES) break;
  }
  return ids;
}

/** The learner's phrases, in the order asked for; other users' ids are dropped. */
async function loadPhrases(userId: string, ids: string[]): Promise<CoachPhrase[]> {
  if (!ids.length) return [];
  const docs: any[] = await getCollection(DATABASE, PHRASE_COLLECTION)
    .find({ _id: { $in: ids }, refId: userId } as any, { phrase: 1, translation: 1 })
    .lean();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((doc: any) => ({ phrase: doc.phrase ?? "", translation: doc.translation ?? "" }));
}

/** True when many learners flagged this pair's explanations lately (Q10). */
export async function explanationSwitchedToEnglish(language: LangCode, explanationLanguage: LangCode | null): Promise<boolean> {
  if (!explanationLanguage || explanationLanguage === DEFAULT_LANGUAGE) return false;
  const since = new Date(Date.now() - FLAG_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const users: string[] = await getCollection(DATABASE, COACH_EXPLANATION_FLAG_COLLECTION).distinct("userId", {
      language,
      explanationLanguage,
      on: true,
      updatedAt: { $gte: since },
    } as any);
    return users.length >= flagThreshold();
  } catch (error: any) {
    console.warn(`[coach] flag count failed for ${language}/${explanationLanguage}: ${error?.message || error}`);
    return false;
  }
}

/** The explanation language of a request: given, then the language profile, then the own language. */
function explanationOf(args: CoachRequest, languageProfile: any, profile: any): LangCode | null {
  for (const value of [args.explanationLanguage, languageProfile?.explanationLanguage, profile?.translationLanguage]) {
    if (isAutoOrUnknown(value)) continue;
    const own = getOwnLanguage(value);
    if (own) return own.code;
  }
  return null;
}

/**
 * Build the Coach prompt and voice for a learner (`get-coach-instructions`). Throws
 * `not_available` when the learning language has no Coach in this mode.
 */
export async function buildCoachSession(userId: string, args: CoachRequest): Promise<CoachSession> {
  const profile: any = await getCollection(DATABASE, PROFILE_COLLECTION)
    .findOne({ refId: userId } as any, { learningLanguage: 1, translationLanguage: 1 })
    .lean();
  const language = requestLanguage(args, profile);
  const mode: CoachMode = args.mode === "voice" ? "voice" : "text";

  if (!getLearningLanguage(language)) throw new CoachError("not_available", `${language} is not a learning language.`);
  // English always has the Coach: every learner from before multilingual studies it.
  if (language !== DEFAULT_LANGUAGE && !hasFeature(language, mode === "voice" ? "coachVoice" : "coachText")) {
    throw new CoachError("not_available", `The ${mode} Coach is not available for ${language} yet.`);
  }

  const languageProfile = await readLanguageProfile(userId, language);
  let explanationLanguage = explanationOf(args, languageProfile, profile);
  const switched = await explanationSwitchedToEnglish(language, explanationLanguage);
  if (switched) explanationLanguage = DEFAULT_LANGUAGE;

  const level = (languageProfile?.startLevel as CefrLevel | undefined) ?? null;
  const phraseIds = cleanPhraseIds(args.phraseIds);
  const phrases = await loadPhrases(userId, phraseIds);

  return {
    instructions: buildCoachInstructions({ language, explanationLanguage, phrases, mode, level }),
    voiceName: coachVoiceFor(language, args.voice),
    language,
    explanationLanguage,
    explanationSwitchedToEnglish: switched,
    level,
    phraseIds,
  };
}

/** The language pair of a stored voice or text session, with the request as a fallback. */
async function sessionLanguages(
  userId: string,
  sessionId: string,
  args: { language?: unknown; explanationLanguage?: unknown }
): Promise<{ language: LangCode; explanationLanguage: LangCode | null } | null> {
  let record: any = null;
  for (const name of [LIVE_SESSION_TEXT_COLLECTION, LIVE_SESSION_COLLECTION]) {
    record = await getCollection(DATABASE, name)
      .findOne({ _id: sessionId, refId: userId } as any, { language: 1, explanationLanguage: 1, metadata: 1 })
      .lean();
    if (record) break;
  }
  if (!record) return null;
  const language = toCode(record.language) ?? toCode(record.metadata?.language) ?? toCode(args.language) ?? langOf(record);
  const explanation =
    [record.explanationLanguage, record.metadata?.explanationLanguage, record.metadata?.nativeLanguage, args.explanationLanguage]
      .map((value) => (isAutoOrUnknown(value) ? undefined : toCode(value)))
      .find(Boolean) ?? null;
  return { language, explanationLanguage: explanation };
}

/** Set or clear one "This explanation looks wrong" flag (`flag-coach-explanation`). */
export async function flagCoachExplanation(
  userId: string,
  args: { sessionId?: unknown; turnIndex?: unknown; on?: unknown; language?: unknown; explanationLanguage?: unknown }
): Promise<{ on: boolean }> {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId : "";
  if (!Types.ObjectId.isValid(sessionId)) throw new Error("Session not found");
  const turnIndex = Number(args.turnIndex);
  if (!Number.isInteger(turnIndex) || turnIndex < 0) throw new Error("turnIndex must be a whole number, 0 or more");
  const on = args.on !== false;

  const pair = await sessionLanguages(userId, sessionId, args);
  if (!pair) throw new Error("Session not found");

  await getCollection(DATABASE, COACH_EXPLANATION_FLAG_COLLECTION).updateOne(
    { userId, sessionId, turnIndex } as any,
    { $set: { on, language: pair.language, explanationLanguage: pair.explanationLanguage } } as any,
    { upsert: true }
  );
  return { on };
}
