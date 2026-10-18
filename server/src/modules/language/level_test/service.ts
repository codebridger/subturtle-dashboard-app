/**
 * The AI level chat test (B-31, Q12): six short Coach questions in the learning language,
 * easy first, with help in the learner's own language; then a start level A1 to B2 and one
 * plain line of why. The test never blocks adding a language: when the model fails, a
 * fixed question keeps the chat going, and a failed grade or a stop means A1.
 *
 * The language does not need to be added yet (step 2 of Add a language runs the test
 * first). `finish-level-test` with `accept: true` saves the level on the language profile
 * when the language exists; otherwise the client sends the result to `add-language`
 * (`startLevel`, `startLevelSource: "test"`).
 */
import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, LANGUAGE_PROFILE_COLLECTION, LEVEL_TEST_COLLECTION, PROFILE_COLLECTION } from "../../../config";
import { LangCode, toCode } from "../../../languages/helper";
import { getLearningLanguage, getOwnLanguage, hasFeature } from "../../../languages/registry";
import { checkCreditAllocation, recordUsage } from "../../subscription/service";
import { AI_CREDIT_EXHAUSTED_CODE } from "../../subscription/config";
import { extractTextCostCalculationInput } from "../../live_session_text/utils";
import { fireServerEvent, SERVER_ANALYTICS_EVENTS } from "../../../utils/analytics";
import { LanguageError, LanguageService } from "../service";
import { fallbackQuestion } from "./questions";
import { ModelResult, StartLevel, TOTAL_QUESTIONS, Turn, grade, nextQuestion } from "./model";

/** Longest answer kept. */
export const MAX_ANSWER_LENGTH = 1000;

/** `recordUsage` service type. */
export const LEVEL_TEST_SERVICE_TYPE = "level_test";

export const STOPPED_REASON = "You stopped the chat, so you start at A1. You can take the chat test again at any time.";
export const FAILED_REASON = "We could not finish the check, so you start at A1. You can take the chat test again at any time.";

const tests = () => getCollection<any>(DATABASE, LEVEL_TEST_COLLECTION);
const profiles = () => getCollection<any>(DATABASE, PROFILE_COLLECTION);
const languageProfiles = () => getCollection<any>(DATABASE, LANGUAGE_PROFILE_COLLECTION);

interface StoredTurn extends Turn {
  source: "model" | "fallback";
  askedAt: Date;
  answeredAt?: Date;
}

export interface LevelResult {
  startLevel: StartLevel;
  reason: string;
}

async function hasBudget(userId: string): Promise<boolean> {
  try {
    const { allowedToProceed } = await checkCreditAllocation({ userId, minCredits: 1 });
    return !!allowedToProceed;
  } catch (error: any) {
    console.warn(`[level-test] credit check failed for ${userId}: ${error?.message || error}`);
    return false;
  }
}

/** Bill one model call; a billing error never breaks the test. */
async function bill(userId: string, result: ModelResult<unknown>, testId: string, action: string) {
  try {
    await recordUsage({
      userId,
      serviceType: LEVEL_TEST_SERVICE_TYPE,
      costInputs: extractTextCostCalculationInput(result.usage, result.model),
      modelUsed: result.model,
      details: { testId, action },
    });
  } catch (error: any) {
    console.error(`[level-test] billing failed for ${userId} test ${testId}: ${error?.message || error}`);
  }
}

function addUsage(total: any, usage: any) {
  const out = { ...(total || {}) };
  for (const [key, value] of Object.entries(usage || {})) out[key] = (out[key] || 0) + (Number(value) || 0);
  return out;
}

/** The next question from the model, or the fixed one when the model fails or the budget is used up. */
async function ask(
  userId: string,
  testId: string,
  language: LangCode,
  explanationLanguage: LangCode | null,
  turns: Turn[],
  index: number,
  budget: boolean
): Promise<{ turn: StoredTurn; usage?: any; model?: string }> {
  if (budget) {
    try {
      const result = await nextQuestion(language, explanationLanguage, turns, index);
      await bill(userId, result, testId, `question-${index}`);
      return { turn: { ...result.value, source: "model", askedAt: new Date() }, usage: result.usage, model: result.model };
    } catch (error: any) {
      console.warn(`[level-test] question ${index} for ${userId}/${language} fell back: ${error?.message || error}`);
    }
  }
  const fixed = fallbackQuestion(language, index) ?? { ai: "?", help: "" };
  return { turn: { ...fixed, source: "fallback", askedAt: new Date() } };
}

function loadTestFilter(userId: string, testId: unknown) {
  if (typeof testId !== "string" || !Types.ObjectId.isValid(testId)) throw new LanguageError("not_found", { testId: String(testId ?? "") });
  return { _id: testId, userId };
}

function view(turn: StoredTurn | undefined) {
  return turn ? { ai: turn.ai, ...(turn.help ? { help: turn.help } : {}) } : undefined;
}

/** `start-level-test`. */
export async function startTest(userId: string, args: { language?: unknown }) {
  const caps = getLearningLanguage(args?.language);
  if (!caps || !caps.enabled || !hasFeature(caps.code, "levelTest")) {
    throw new LanguageError("not_available", { language: toCode(args?.language) ?? String(args?.language ?? "") });
  }
  const language = caps.code;
  if (!(await hasBudget(userId))) {
    throw new Error(`${AI_CREDIT_EXHAUSTED_CODE}: AI features are paused — this month's AI budget is used up.`);
  }

  const profile: any = await profiles().findOne({ refId: userId }, { translationLanguage: 1 }).lean();
  const languageProfile: any = await LanguageService.getLanguageProfile(userId, language);
  const explanationLanguage =
    [languageProfile?.explanationLanguage, profile?.translationLanguage].map((value) => getOwnLanguage(value)?.code).find(Boolean) ?? null;

  // A retake replaces a test left half done.
  await tests().updateMany({ userId, language, status: "in_progress" }, { $set: { status: "abandoned", finishedAt: new Date() } });

  const testId = new Types.ObjectId();
  const first = await ask(userId, String(testId), language, explanationLanguage, [], 1, true);
  await tests().create({
    _id: testId,
    userId,
    language,
    explanationLanguage,
    status: "in_progress",
    turns: [first.turn],
    answered: 0,
    usage: first.usage ? addUsage({}, first.usage) : {},
  });
  return { testId: String(testId), turn: view(first.turn), index: 1, total: TOTAL_QUESTIONS };
}

/** `answer-level-test`. */
export async function answerTest(userId: string, args: { testId?: unknown; text?: unknown }) {
  const filter = loadTestFilter(userId, args?.testId);
  const test: any = await tests().findOne(filter).lean();
  if (!test) throw new LanguageError("not_found", { testId: String(args.testId) });
  if (test.status !== "in_progress") throw new LanguageError("invalid_argument", undefined, "this test has ended; start a new one");

  const turns: StoredTurn[] = test.turns || [];
  const answer = typeof args.text === "string" ? args.text.replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER_LENGTH) : "";
  const last = turns[turns.length - 1];
  if (!last || last.answer !== undefined) throw new LanguageError("invalid_argument", undefined, "no question is waiting for an answer");
  const answered = [...turns.slice(0, -1), { ...last, answer, answeredAt: new Date() }];
  const index = answered.length;
  const budget = await hasBudget(userId);

  // Only one answer per question wins, even when the client sends twice.
  // A counter, not an array-index query: the database is Firestore with MongoDB compatibility.
  const claim = { ...filter, status: "in_progress", answered: test.answered ?? 0 };

  if (index >= TOTAL_QUESTIONS) {
    let result: LevelResult = { startLevel: "A1", reason: FAILED_REASON };
    let resultSource = "fallback";
    let usage = test.usage;
    let model: string | undefined;
    if (budget) {
      try {
        const graded = await grade(test.language, answered);
        await bill(userId, graded, String(test._id), "grade");
        result = graded.value;
        resultSource = "model";
        usage = addUsage(usage, graded.usage);
        model = graded.model;
      } catch (error: any) {
        console.warn(`[level-test] grading for ${userId}/${test.language} fell back to A1: ${error?.message || error}`);
      }
    }
    const done: any = await tests().updateOne(claim, {
      $set: { turns: answered, answered: index, status: "done", startLevel: result.startLevel, reason: result.reason, resultSource, usage, ...(model ? { model } : {}), finishedAt: new Date() },
    });
    if (!done?.modifiedCount) throw new LanguageError("invalid_argument", undefined, "this answer was already sent");
    return { index, total: TOTAL_QUESTIONS, done: true, result };
  }

  const next = await ask(userId, String(test._id), test.language, test.explanationLanguage ?? null, answered, index + 1, budget);
  const saved: any = await tests().updateOne(claim, {
    $set: { turns: [...answered, next.turn], answered: index, usage: next.usage ? addUsage(test.usage, next.usage) : test.usage },
  });
  if (!saved?.modifiedCount) throw new LanguageError("invalid_argument", undefined, "this answer was already sent");
  return { turn: view(next.turn), index: index + 1, total: TOTAL_QUESTIONS, done: false };
}

/** `finish-level-test`. */
export async function finishTest(userId: string, args: { testId?: unknown; accept?: unknown }) {
  const filter = loadTestFilter(userId, args?.testId);
  const test: any = await tests().findOne(filter).lean();
  if (!test) throw new LanguageError("not_found", { testId: String(args.testId) });
  const accept = args.accept === true;

  let result: LevelResult;
  let applied = false;
  // Only the call that really closes the test counts; asking again for a finished test sends nothing.
  let closed = false;
  if (test.status === "done" && accept) {
    result = { startLevel: test.startLevel, reason: test.reason };
    const update: any = await tests().updateOne({ ...filter, status: "done" }, { $set: { status: "accepted", finishedAt: new Date() } });
    closed = Boolean(update?.modifiedCount);
    // Saved on the language when the learner has it; a new language gets it through add-language.
    const saved: any = await languageProfiles().updateOne(
      { userId, language: test.language, status: { $in: ["active", "paused"] } },
      { $set: { startLevel: result.startLevel, startLevelSource: "test" } }
    );
    applied = (saved?.matchedCount ?? 0) > 0;
  } else if (test.status === "done") {
    // Declined: the learner chose "Start at A1 instead".
    result = { startLevel: "A1", reason: STOPPED_REASON };
    const update: any = await tests().updateOne({ ...filter, status: "done" }, { $set: { status: "declined", finishedAt: new Date() } });
    closed = Boolean(update?.modifiedCount);
  } else if (test.status === "in_progress") {
    result = { startLevel: "A1", reason: STOPPED_REASON };
    const update: any = await tests().updateOne({ ...filter, status: "in_progress" }, { $set: { status: "stopped", startLevel: "A1", reason: STOPPED_REASON, finishedAt: new Date() } });
    closed = Boolean(update?.modifiedCount);
  } else {
    // Already finished: answer the same again.
    result = test.status === "accepted" ? { startLevel: test.startLevel, reason: test.reason } : { startLevel: "A1", reason: test.reason || STOPPED_REASON };
  }
  if (closed) fireServerEvent(SERVER_ANALYTICS_EVENTS.LEVEL_TEST_DONE, userId, { language: test.language, start_level: result.startLevel });

  return { state: await LanguageService.getState(userId), result, applied, language: test.language };
}
