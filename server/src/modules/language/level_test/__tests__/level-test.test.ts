/**
 * B-31: the AI level chat test on an in-memory MongoDB, with recorded (mocked) Gemini
 * answers. Covers the six-question flow, saving the level, the fallbacks (model failure,
 * no budget, stop → A1), double answers and access.
 */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose, { Connection, Model, Schema } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const mockModels: Record<string, Model<any>> = {};
jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  defineFunction: (opts: any) => opts,
  getCollection: jest.fn((_db: string, name: string) => mockModels[name]),
}));

const mockGenerate = jest.fn<(request: any) => Promise<any>>();
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: (request: any) => mockGenerate(request) } })),
}));

const mockCredit = jest.fn<(...args: any[]) => Promise<any>>();
const mockRecordUsage = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../subscription/service", () => ({
  checkCreditAllocation: (...args: any[]) => mockCredit(...args),
  recordUsage: (...args: any[]) => mockRecordUsage(...args),
}));

import { LANGUAGE_PROFILE_COLLECTION, LEVEL_TEST_COLLECTION, PROFILE_COLLECTION } from "../../../../config";
import { LanguageService } from "../../service";
import { FAILED_REASON, STOPPED_REASON } from "../service";
import { GRADE_MODEL, QUESTION_MODEL, gradePrompt, questionPrompt } from "../model";
import { fallbackQuestion, ladderLanguages } from "../questions";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;
const start = fn("start-level-test");
const answer = fn("answer-level-test");
const finish = fn("finish-level-test");

const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();

let mongo: MongoMemoryServer;
let connection: Connection;
let Tests: Model<any>, LanguageProfiles: Model<any>, Profiles: Model<any>;

/** A recorded Gemini answer. */
const reply = (json: any) => ({ text: JSON.stringify(json), usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 40, totalTokenCount: 340 } });

/** Questions answered by the "model": question n, help in Persian; grading gives B1. */
function recordedModel(level = "B1") {
  mockGenerate.mockImplementation(async (request: any) => {
    if (request.model === GRADE_MODEL) return reply({ startLevel: level, reason: "You told a clear story about last weekend and gave reasons for your plans." });
    const n = (request.contents[0].parts[0].text.match(/question (\d)/g) || []).length;
    return reply({ ai: `Frage ${n}?`, help: `سوال ${n}` });
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  Tests = connection.model(LEVEL_TEST_COLLECTION, require("../db")[0].schema);
  LanguageProfiles = connection.model(LANGUAGE_PROFILE_COLLECTION, require("../../db").find((d: any) => d.collection === LANGUAGE_PROFILE_COLLECTION).schema);
  Profiles = connection.model(PROFILE_COLLECTION, new Schema({}, { strict: false }));
  Object.assign(mockModels, { [LEVEL_TEST_COLLECTION]: Tests, [LANGUAGE_PROFILE_COLLECTION]: LanguageProfiles, [PROFILE_COLLECTION]: Profiles });
  await LanguageProfiles.init();
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Tests, LanguageProfiles, Profiles].map((m) => m.deleteMany({})));
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(LanguageService, "getState").mockResolvedValue({ mocked: true } as any);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.GEMINI_API_KEY = "test";
  delete process.env.LANGUAGES_ENABLED;
  mockCredit.mockResolvedValue({ allowedToProceed: true });
  mockRecordUsage.mockResolvedValue(undefined);
  recordedModel();
  await Profiles.create({ refId: USER, learningLanguage: "en", translationLanguage: "fa" });
});

async function runAll(testId: string, answers = ["Ich heiße Sara.", "Ich wohne in Berlin.", "Ich lese gern.", "Ich war im Park.", "Ich will studieren, weil ...", "Ich finde online besser."]) {
  let last: any;
  for (const text of answers) last = await answer({ userId: USER, testId, text });
  return last;
}

describe("level test flow", () => {
  it("asks six questions in the learning language with own-language help, then gives a level", async () => {
    const first = await start({ userId: USER, language: "de" });
    expect(first).toEqual({ testId: expect.any(String), turn: { ai: "Frage 1?", help: "سوال 1" }, index: 1, total: 6 });
    // The prompt names the learning language and the own language.
    expect(mockGenerate.mock.calls[0][0].config.systemInstruction).toMatch(/placement chat in German/);
    expect(mockGenerate.mock.calls[0][0].config.systemInstruction).toMatch(/own language is Persian/);
    expect(mockGenerate.mock.calls[0][0].model).toBe(QUESTION_MODEL);

    const second = await answer({ userId: USER, testId: first.testId, text: "Ich heiße Sara." });
    expect(second).toEqual({ turn: { ai: "Frage 2?", help: "سوال 2" }, index: 2, total: 6, done: false });
    // Later questions see the chat so far.
    expect(mockGenerate.mock.calls[1][0].contents[0].parts[0].text).toMatch(/Learner: Ich heiße Sara\./);

    const last = await runAll(first.testId, ["a", "b", "c", "d", "e"]);
    expect(last).toEqual({
      index: 6,
      total: 6,
      done: true,
      result: { startLevel: "B1", reason: "You told a clear story about last weekend and gave reasons for your plans." },
    });

    const stored = await Tests.findById(first.testId).lean<any>();
    expect(stored.status).toBe("done");
    expect(stored.turns).toHaveLength(6);
    expect(stored.turns.every((t: any) => t.source === "model" && typeof t.answer === "string")).toBe(true);
    expect(stored.resultSource).toBe("model");
    expect(stored.usage.total_tokens).toBe(340 * 7);
    expect(mockRecordUsage).toHaveBeenCalledTimes(7);
    expect((mockRecordUsage.mock.calls[0][0] as any).serviceType).toBe("level_test");
  });

  it("accept saves the level with source test on a language the learner has", async () => {
    await LanguageProfiles.create({ userId: USER, language: "de", status: "active", startLevel: "A1", startLevelSource: "default" });
    const { testId } = await start({ userId: USER, language: "de" });
    await runAll(testId);
    const out = await finish({ userId: USER, testId, accept: true });
    expect(out).toEqual({ state: { mocked: true }, result: expect.objectContaining({ startLevel: "B1" }), applied: true, language: "de" });
    const lp = await LanguageProfiles.findOne({ userId: USER, language: "de" }).lean<any>();
    expect([lp.startLevel, lp.startLevelSource]).toEqual(["B1", "test"]);
    expect((await Tests.findById(testId).lean<any>()).status).toBe("accepted");
    // Asking again gives the same answer.
    expect((await finish({ userId: USER, testId, accept: true })).result.startLevel).toBe("B1");
  });

  it("accept on a language not added yet only returns the result (the client sends it to add-language)", async () => {
    const { testId } = await start({ userId: USER, language: "es" });
    await runAll(testId);
    const out = await finish({ userId: USER, testId, accept: true });
    expect(out.applied).toBe(false);
    expect(out.result.startLevel).toBe("B1");
    expect(await LanguageProfiles.countDocuments()).toBe(0);
  });

  it("declining the result means A1 and changes nothing", async () => {
    await LanguageProfiles.create({ userId: USER, language: "de", status: "active", startLevel: "A2", startLevelSource: "test" });
    const { testId } = await start({ userId: USER, language: "de" });
    await runAll(testId);
    const out = await finish({ userId: USER, testId, accept: false });
    expect(out.result).toEqual({ startLevel: "A1", reason: STOPPED_REASON });
    expect((await LanguageProfiles.findOne().lean<any>()).startLevel).toBe("A2");
    expect((await Tests.findById(testId).lean<any>()).status).toBe("declined");
  });

  it("stopping half way means A1", async () => {
    const { testId } = await start({ userId: USER, language: "de" });
    await answer({ userId: USER, testId, text: "Hallo" });
    const out = await finish({ userId: USER, testId, accept: true });
    expect(out.result).toEqual({ startLevel: "A1", reason: STOPPED_REASON });
    expect(out.applied).toBe(false);
    expect((await Tests.findById(testId).lean<any>()).status).toBe("stopped");
    await expect(answer({ userId: USER, testId, text: "more" })).rejects.toThrow(/^invalid_argument/);
  });
});

describe("fallbacks", () => {
  it("a failed question uses the fixed question for that step", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("503"));
    const first = await start({ userId: USER, language: "sv" });
    expect(first.turn).toEqual(fallbackQuestion("sv", 1));
    expect((await Tests.findById(first.testId).lean<any>()).turns[0].source).toBe("fallback");
  });

  it("a reply that is not JSON, or has no question, falls back too", async () => {
    mockGenerate.mockResolvedValueOnce({ text: "not json" });
    const first = await start({ userId: USER, language: "lt" });
    expect(first.turn.ai).toBe(fallbackQuestion("lt", 1)!.ai);
    mockGenerate.mockResolvedValueOnce(reply({ ai: "  ", help: "x" }));
    const second = await answer({ userId: USER, testId: first.testId, text: "Labas" });
    expect(second.turn.ai).toBe(fallbackQuestion("lt", 2)!.ai);
  });

  it("a failed grade means A1", async () => {
    mockGenerate.mockImplementation(async (request: any) => {
      if (request.model === GRADE_MODEL) return reply({ startLevel: "C2", reason: "x" });
      return reply({ ai: "Q?", help: "h" });
    });
    const { testId } = await start({ userId: USER, language: "fr" });
    const last = await runAll(testId);
    expect(last.result).toEqual({ startLevel: "A1", reason: FAILED_REASON });
    expect((await Tests.findById(testId).lean<any>()).resultSource).toBe("fallback");
  });

  it("no AI budget: the test cannot start; mid-test it carries on with fixed questions and ends at A1", async () => {
    mockCredit.mockResolvedValueOnce({ allowedToProceed: false });
    await expect(start({ userId: USER, language: "de" })).rejects.toThrow(/^AI_CREDIT_EXHAUSTED/);

    const { testId } = await start({ userId: USER, language: "it" });
    mockCredit.mockResolvedValue({ allowedToProceed: false });
    mockGenerate.mockClear();
    const second = await answer({ userId: USER, testId, text: "Ciao" });
    expect(second.turn.ai).toBe(fallbackQuestion("it", 2)!.ai);
    const last = await runAll(testId, ["b", "c", "d", "e", "f"]);
    expect(last.result.startLevel).toBe("A1");
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("rules", () => {
  it("only one answer per question counts", async () => {
    const { testId } = await start({ userId: USER, language: "de" });
    // Both answers must read the test before either saves, or the second one is simply
    // the answer to question 2. Hold each call at the model until both have arrived there
    // (they read the test first), so the reads always overlap.
    const recorded = mockGenerate.getMockImplementation()!;
    let waiting = 0;
    let release: () => void = () => undefined;
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    mockGenerate.mockImplementation(async (request: any) => {
      if (++waiting >= 2) release();
      await Promise.race([bothArrived, new Promise((resolve) => setTimeout(resolve, 2000))]);
      return recorded(request);
    });
    const [a, b] = await Promise.allSettled([answer({ userId: USER, testId, text: "eins" }), answer({ userId: USER, testId, text: "zwei" })]);
    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const stored = await Tests.findById(testId).lean<any>();
    expect(stored.turns).toHaveLength(2);
  });

  it("a retake abandons the test left half done", async () => {
    const first = await start({ userId: USER, language: "de" });
    await start({ userId: USER, language: "de" });
    expect((await Tests.findById(first.testId).lean<any>()).status).toBe("abandoned");
  });

  it("another learner's test is not found", async () => {
    const { testId } = await start({ userId: USER, language: "de" });
    await expect(answer({ userId: OTHER, testId, text: "x" })).rejects.toThrow(/^not_found/);
    await expect(finish({ userId: OTHER, testId, accept: true })).rejects.toThrow(/^not_found/);
    await expect(answer({ userId: USER, testId: "nope", text: "x" })).rejects.toThrow(/^not_found/);
  });

  it("a language without the level test is not available", async () => {
    process.env.LANGUAGES_ENABLED = "en";
    await expect(start({ userId: USER, language: "de" })).rejects.toThrow(/^not_available/);
    delete process.env.LANGUAGES_ENABLED;
    await expect(start({ userId: USER, language: "pt" })).rejects.toThrow(/^not_available/);
    await expect(start({ language: "de" })).rejects.toThrow(/User ID/);
  });

  it("long answers are cut", async () => {
    const { testId } = await start({ userId: USER, language: "de" });
    await answer({ userId: USER, testId, text: "x".repeat(5000) });
    expect((await Tests.findById(testId).lean<any>()).turns[0].answer).toHaveLength(1000);
  });
});

describe("content", () => {
  it("every launch language has six fixed questions", () => {
    for (const code of ["en", "es", "de", "fr", "it", "sv", "lt"]) {
      expect(ladderLanguages()).toContain(code);
      for (let i = 1; i <= 6; i++) expect(fallbackQuestion(code, i)?.ai).toBeTruthy();
    }
  });

  it("the prompts step up and stay conservative", () => {
    expect(questionPrompt("lt", null, 3)).toMatch(/question 3 of 6/);
    expect(questionPrompt("lt", null, 3)).toMatch(/own language is English/);
    expect(gradePrompt("sv")).toMatch(/choose the lower one/);
  });
});
