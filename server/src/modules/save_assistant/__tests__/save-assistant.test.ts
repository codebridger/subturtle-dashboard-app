/**
 * Runs the save-assistant functions against a real in-memory MongoDB, so the
 * owner filters, search, paging and the idempotent attach are real queries.
 * The AI provider (translation service) and the subscription service are mocked.
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

const mockDetailed = jest.fn<(...args: any[]) => Promise<any>>();
const mockAdvice = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../translation/service", () => ({
  getDetailedTranslation: (...args: any[]) => mockDetailed(...args),
  getTranslationAdvice: (...args: any[]) => mockAdvice(...args),
}));

const mockCheckCredit = jest.fn<(...args: any[]) => Promise<any>>();
const mockRecordUsage = jest.fn<(...args: any[]) => Promise<any>>();
const mockMessageCap = jest.fn<(...args: any[]) => Promise<number | null>>();
jest.mock("../../subscription/service", () => ({
  checkCreditAllocation: (...args: any[]) => mockCheckCredit(...args),
  recordUsage: (...args: any[]) => mockRecordUsage(...args),
  getTextChatMessageCap: (...args: any[]) => mockMessageCap(...args),
}));

import {
  BUNDLE_COLLECTION,
  PHRASE_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
} from "../../../config";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;
const createSaveSession = fn("createSaveSession");
const saveSessionTurn = fn("saveSessionTurn");
const attachSavedPhrase = fn("attachSavedPhrase");
const listSaveSessions = fn("listSaveSessions");
const getSaveSession = fn("getSaveSession");
const deleteSaveSession = fn("deleteSaveSession");

const sessionDefinition = require("../db")[0];

const ALICE = new mongoose.Types.ObjectId().toString();
const BOB = new mongoose.Types.ObjectId().toString();

function translationFor(phrase: string, chunks: any[] = []) {
  return {
    chunks,
    direction: { source: "ltr", target: "rtl" },
    translation: { phrase: `fa(${phrase})` },
    language_info: { source: "en", target: "fa" },
    linguistic_data: {
      isValid: true,
      type: "expression",
      definition: "def",
      phonetic: { transliteration: "" },
      formality_level: "neutral",
    },
  };
}

const chunk = (text: string, type = "phrasal_verb") => ({
  text,
  type,
  definition: "d",
  transliteration: "t",
  confidence: 0.9,
});

let mongo: MongoMemoryServer;
let connection: Connection;
let Sessions: Model<any>;
let Phrases: Model<any>;
let Bundles: Model<any>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  Sessions = connection.model(SAVE_ASSISTANT_SESSION_COLLECTION, sessionDefinition.schema);
  Phrases = connection.model(
    PHRASE_COLLECTION,
    new Schema({ refId: String, phrase: String }, { strict: false })
  );
  Bundles = connection.model(
    BUNDLE_COLLECTION,
    new Schema({ refId: String, title: String, phrases: [Schema.Types.ObjectId] })
  );
  mockModels[SAVE_ASSISTANT_SESSION_COLLECTION] = Sessions;
  mockModels[PHRASE_COLLECTION] = Phrases;
  mockModels[BUNDLE_COLLECTION] = Bundles;
  await Sessions.init();
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Sessions.deleteMany({}), Phrases.deleteMany({}), Bundles.deleteMany({})]);
  jest.clearAllMocks();
  mockCheckCredit.mockResolvedValue({ allowedToProceed: true });
  mockRecordUsage.mockResolvedValue(undefined);
  mockMessageCap.mockResolvedValue(null);
  mockDetailed.mockImplementation(async ({ phrase }: any) =>
    translationFor(phrase, phrase.length > 20 ? [chunk("get out of"), chunk("had to", "collocation")] : [])
  );
  mockAdvice.mockResolvedValue({ reply: "It means to escape." });
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

const SENTENCE = "I had to get out of the house quickly";

async function newSession(userId = ALICE, message = SENTENCE) {
  return createSaveSession({ userId, message, targetLanguage: "fa", source: { kind: "paste" } });
}

describe("save assistant: full flow for one user", () => {
  it("create → turn (pick, cached pick, message) → attach → list → get → delete", async () => {
    // create
    const created = await newSession();
    expect(created.sessionId).toBeTruthy();
    expect(created.candidates.map((c: any) => c.text)).toEqual([SENTENCE, "get out of", "had to"]);
    expect(created.candidates[0].type).toBe("full");
    expect(created.translation.translation.phrase).toBe(`fa(${SENTENCE})`);
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    expect((mockRecordUsage.mock.calls[0][0] as any).serviceType).toBe("save_assistant");

    let stored = await Sessions.findById(created.sessionId).lean<any>();
    expect(stored.refId).toBe(ALICE);
    expect(stored.title).toBe(SENTENCE);
    expect(stored.sourceLanguage).toBe("en");
    expect(stored.messages.map((m: any) => `${m.role}:${m.kind}`)).toEqual(["user:text", "assistant:translation"]);
    expect(stored.usage.total_tokens).toBeGreaterThan(0);

    // pick a chunk → new translation, billed, context is the first message
    const picked = await saveSessionTurn({ userId: ALICE, sessionId: created.sessionId, pick: "Get Out Of " });
    expect(picked.translation.translation.phrase).toBe("fa(get out of)");
    expect(picked.cached).toBe(false);
    expect(picked.messageId).toMatch(/^assistant-/);
    expect(mockDetailed).toHaveBeenLastCalledWith(
      expect.objectContaining({ phrase: "get out of", context: SENTENCE, sourceLanguage: "en", translationLanguage: "fa" })
    );
    expect(mockRecordUsage).toHaveBeenCalledTimes(2);

    // pick the same chunk again → served from the session, no AI call, no bill
    const again = await saveSessionTurn({ userId: ALICE, sessionId: created.sessionId, pick: "get out of" });
    expect(again.cached).toBe(true);
    expect(mockDetailed).toHaveBeenCalledTimes(2);
    expect(mockRecordUsage).toHaveBeenCalledTimes(2);

    // follow-up question → advice gets the server-held history and the focus phrase
    mockAdvice.mockResolvedValueOnce({ reply: "It means to leave.", chunks: [chunk("quickly", "other")] });
    const turn = await saveSessionTurn({ userId: ALICE, sessionId: created.sessionId, message: "What does it mean?" });
    expect(turn.reply).toBe("It means to leave.");
    expect(turn.wrapUp).toBe(false);
    expect(turn.candidates.map((c: any) => c.text)).toContain("quickly");
    const adviceArgs: any = mockAdvice.mock.calls[0][0];
    expect(adviceArgs.phrase).toBe("get out of");
    expect(adviceArgs.context).toBe(SENTENCE);
    expect(adviceArgs.message).toBe("What does it mean?");
    expect(adviceArgs.history[0]).toEqual({ role: "user", text: SENTENCE });
    expect(adviceArgs.history).not.toContainEqual({ role: "user", text: "What does it mean?" });
    expect(mockRecordUsage).toHaveBeenCalledTimes(3);

    // attach a phrase the user saved (bundle looked up from the phrase)
    const phrase = await Phrases.create({ refId: ALICE, phrase: "get out of" });
    const bundle = await Bundles.create({ refId: ALICE, title: "Daily", phrases: [phrase._id] });
    const attached = await attachSavedPhrase({ userId: ALICE, sessionId: created.sessionId, phraseId: String(phrase._id) });
    expect(attached).toEqual(expect.objectContaining({ attached: true, savedCount: 1 }));
    // attaching twice changes nothing
    const twice = await attachSavedPhrase({ userId: ALICE, sessionId: created.sessionId, phraseId: String(phrase._id) });
    expect(twice).toEqual({ attached: false, savedCount: 1 });

    stored = await Sessions.findById(created.sessionId).lean<any>();
    expect(stored.savedPhraseIds).toEqual([String(phrase._id)]);
    expect(stored.savedCount).toBe(1);
    const saved = stored.messages.filter((m: any) => m.kind === "saved");
    expect(saved).toHaveLength(1);
    expect(saved[0].payload).toEqual({ phraseId: String(phrase._id), phrase: "get out of", bundleId: String(bundle._id) });
    expect(stored.messages).toHaveLength(9);

    // list
    const list = await listSaveSessions({ userId: ALICE });
    expect(list).toEqual([
      {
        sessionId: created.sessionId,
        title: SENTENCE,
        savedCount: 1,
        savedPhrases: ["get out of"],
        lastMessageAt: expect.any(Date),
        language: "en",
      },
    ]);
    expect(list[0]).not.toHaveProperty("messages");

    // get
    const full = await getSaveSession({ userId: ALICE, sessionId: created.sessionId });
    expect(full.sessionId).toBe(created.sessionId);
    expect(full).not.toHaveProperty("_id");
    expect(full.messages).toHaveLength(9);
    expect(full.candidates.map((c: any) => c.text)).toContain("quickly");

    // delete → the session goes, the saved phrase stays
    expect(await deleteSaveSession({ userId: ALICE, sessionId: created.sessionId })).toEqual({ deleted: 1 });
    expect(await Sessions.countDocuments()).toBe(0);
    expect(await Phrases.countDocuments()).toBe(1);
    await expect(getSaveSession({ userId: ALICE, sessionId: created.sessionId })).rejects.toThrow(/not found/);
  });

  it("deletes all of one user's sessions and nobody else's", async () => {
    await newSession(ALICE);
    await newSession(ALICE, "second one");
    await newSession(BOB);
    expect(await deleteSaveSession({ userId: ALICE, all: true })).toEqual({ deleted: 2 });
    expect(await Sessions.countDocuments({ refId: BOB })).toBe(1);
  });

  it("uses an explicit bundleId only when it is the user's", async () => {
    const { sessionId } = await newSession();
    const phrase = await Phrases.create({ refId: ALICE, phrase: "had to" });
    const bobBundle = await Bundles.create({ refId: BOB, title: "Bob's" });
    await expect(
      attachSavedPhrase({ userId: ALICE, sessionId, phraseId: String(phrase._id), bundleId: String(bobBundle._id) })
    ).rejects.toThrow(/Bundle not found/);
    const mine = await Bundles.create({ refId: ALICE, title: "Mine" });
    const res = await attachSavedPhrase({ userId: ALICE, sessionId, phraseId: String(phrase._id), bundleId: String(mine._id) });
    expect(res.attached).toBe(true);
  });
});

describe("save assistant: ownership", () => {
  it("another user cannot read, turn, attach or delete someone else's session", async () => {
    const { sessionId } = await newSession(ALICE);
    const before = await Sessions.findById(sessionId).lean<any>();
    jest.clearAllMocks();

    await expect(getSaveSession({ userId: BOB, sessionId })).rejects.toThrow(/not found/);
    await expect(saveSessionTurn({ userId: BOB, sessionId, message: "hi" })).rejects.toThrow(/not found/);
    await expect(saveSessionTurn({ userId: BOB, sessionId, pick: "get out of" })).rejects.toThrow(/not found/);

    const bobPhrase = await Phrases.create({ refId: BOB, phrase: "get out of" });
    await expect(
      attachSavedPhrase({ userId: BOB, sessionId, phraseId: String(bobPhrase._id) })
    ).rejects.toThrow(/not found/);

    expect(await deleteSaveSession({ userId: BOB, sessionId })).toEqual({ deleted: 0 });
    expect(await listSaveSessions({ userId: BOB })).toEqual([]);

    // Nothing ran and nothing changed.
    expect(mockDetailed).not.toHaveBeenCalled();
    expect(mockAdvice).not.toHaveBeenCalled();
    expect(mockRecordUsage).not.toHaveBeenCalled();
    const after = await Sessions.findById(sessionId).lean<any>();
    expect(after.messages).toHaveLength(before.messages.length);
    expect(after.savedCount).toBe(0);
  });

  it("the owner cannot attach a phrase that belongs to someone else", async () => {
    const { sessionId } = await newSession(ALICE);
    const bobPhrase = await Phrases.create({ refId: BOB, phrase: "get out of" });
    await expect(
      attachSavedPhrase({ userId: ALICE, sessionId, phraseId: String(bobPhrase._id) })
    ).rejects.toThrow(/Phrase not found/);
    expect((await Sessions.findById(sessionId).lean<any>()).savedCount).toBe(0);
  });

  it("refuses calls without a userId and bad session ids", async () => {
    await expect(listSaveSessions({})).rejects.toThrow(/userId is required/);
    await expect(createSaveSession({ message: "x", targetLanguage: "fa" })).rejects.toThrow(/userId is required/);
    await expect(getSaveSession({ userId: ALICE, sessionId: "not-an-id" })).rejects.toThrow(/not found/);
    await expect(getSaveSession({ userId: ALICE, sessionId: { $ne: null } })).rejects.toThrow(/not found/);
  });
});

describe("save assistant: list filters and paging", () => {
  async function seed(title: string, at: string, saved: string[] = [], extraText?: string) {
    const messages = [{ id: "u", role: "user", kind: "text", text: title, createdAt: new Date(at) }];
    if (extraText) messages.push({ id: "u2", role: "user", kind: "text", text: extraText, createdAt: new Date(at) });
    return Sessions.create({
      refId: ALICE,
      title,
      targetLanguage: "fa",
      messages,
      savedPhraseIds: saved.map(() => new mongoose.Types.ObjectId().toString()),
      savedPhrases: saved,
      savedCount: saved.length,
      lastMessageAt: new Date(at),
    });
  }

  beforeEach(async () => {
    await seed("first chat", "2026-10-01T10:00:00Z");
    await seed("second chat about idioms", "2026-10-02T10:00:00Z", ["break a leg"]);
    await seed("third chat", "2026-10-03T10:00:00Z", [], "what about (a+b)?");
    await seed("fourth chat", "2026-10-04T10:00:00Z", ["get out of", "had to"]);
    await Sessions.create({ refId: BOB, title: "bob idioms", targetLanguage: "fa", savedCount: 1, lastMessageAt: new Date() });
  });

  it("returns the newest first, only the user's", async () => {
    const list = await listSaveSessions({ userId: ALICE });
    expect(list.map((s: any) => s.title)).toEqual(["fourth chat", "third chat", "second chat about idioms", "first chat"]);
  });

  it("onlySaved keeps sessions with saved phrases", async () => {
    const list = await listSaveSessions({ userId: ALICE, onlySaved: true });
    expect(list.map((s: any) => s.title)).toEqual(["fourth chat", "second chat about idioms"]);
    expect(list[0].savedPhrases).toEqual(["get out of", "had to"]);
  });

  it("query matches the title or any message text, case-insensitive and literal", async () => {
    expect((await listSaveSessions({ userId: ALICE, query: "IDIOMS" })).map((s: any) => s.title)).toEqual([
      "second chat about idioms",
    ]);
    // Regex characters are matched literally.
    expect((await listSaveSessions({ userId: ALICE, query: "(a+b)" })).map((s: any) => s.title)).toEqual(["third chat"]);
    expect(await listSaveSessions({ userId: ALICE, query: ".*" })).toEqual([]);
  });

  it("query and onlySaved combine", async () => {
    expect((await listSaveSessions({ userId: ALICE, query: "chat", onlySaved: true })).map((s: any) => s.title)).toEqual([
      "fourth chat",
      "second chat about idioms",
    ]);
  });

  it("pages with limit and a before cursor on lastMessageAt", async () => {
    const page1 = await listSaveSessions({ userId: ALICE, limit: 2 });
    expect(page1.map((s: any) => s.title)).toEqual(["fourth chat", "third chat"]);
    const page2 = await listSaveSessions({ userId: ALICE, limit: 2, before: page1[1].lastMessageAt.toISOString() });
    expect(page2.map((s: any) => s.title)).toEqual(["second chat about idioms", "first chat"]);
    const page3 = await listSaveSessions({ userId: ALICE, limit: 2, before: page2[1].lastMessageAt });
    expect(page3).toEqual([]);
  });

  it("caps the page size and rejects a bad cursor", async () => {
    expect(await listSaveSessions({ userId: ALICE, limit: 1000 })).toHaveLength(4);
    await expect(listSaveSessions({ userId: ALICE, before: "yesterday-ish" })).rejects.toThrow(/before/);
  });
});

describe("save assistant: budget and provider failures", () => {
  it("budget exhausted on create → AI_CREDIT_EXHAUSTED, nothing stored or called", async () => {
    mockCheckCredit.mockResolvedValue({ allowedToProceed: false });
    await expect(newSession()).rejects.toThrow(/^AI_CREDIT_EXHAUSTED/);
    expect(mockDetailed).not.toHaveBeenCalled();
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(await Sessions.countDocuments()).toBe(0);
  });

  it("budget exhausted on a turn → AI_CREDIT_EXHAUSTED, nothing stored", async () => {
    const { sessionId } = await newSession();
    jest.clearAllMocks();
    mockCheckCredit.mockResolvedValue({ allowedToProceed: false });

    await expect(saveSessionTurn({ userId: ALICE, sessionId, message: "why?" })).rejects.toThrow(/^AI_CREDIT_EXHAUSTED/);
    await expect(saveSessionTurn({ userId: ALICE, sessionId, pick: "had to" })).rejects.toThrow(/^AI_CREDIT_EXHAUSTED/);
    expect(mockAdvice).not.toHaveBeenCalled();
    expect(mockDetailed).not.toHaveBeenCalled();
    expect((await Sessions.findById(sessionId).lean<any>()).messages).toHaveLength(2);
  });

  it("the exhausted message never says 'credit' outside the code", async () => {
    mockCheckCredit.mockResolvedValue({ allowedToProceed: false });
    const err: any = await newSession().catch((e: any) => e);
    expect(err.message.replace("AI_CREDIT_EXHAUSTED", "")).not.toMatch(/credit/i);
  });

  it("provider failure on create → SAVE_ASSISTANT_UNAVAILABLE, nothing stored or billed", async () => {
    mockDetailed.mockRejectedValue(new Error("Failed to translate text: 502"));
    const err: any = await newSession().catch((e: any) => e);
    expect(err.code).toBe("SAVE_ASSISTANT_UNAVAILABLE");
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(await Sessions.countDocuments()).toBe(0);
  });

  it("provider failure on a turn → nothing stored, nothing billed", async () => {
    const { sessionId } = await newSession();
    const before = await Sessions.findById(sessionId).lean<any>();
    jest.clearAllMocks();
    mockCheckCredit.mockResolvedValue({ allowedToProceed: true });
    mockAdvice.mockRejectedValue(new Error("Failed to get translation advice: 429"));
    mockDetailed.mockRejectedValue(new Error("Failed to translate text: 500"));

    await expect(saveSessionTurn({ userId: ALICE, sessionId, message: "why?" })).rejects.toMatchObject({
      code: "SAVE_ASSISTANT_UNAVAILABLE",
    });
    await expect(saveSessionTurn({ userId: ALICE, sessionId, pick: "had to" })).rejects.toMatchObject({
      code: "SAVE_ASSISTANT_UNAVAILABLE",
    });
    expect(mockRecordUsage).not.toHaveBeenCalled();
    const after = await Sessions.findById(sessionId).lean<any>();
    expect(after.messages).toHaveLength(2);
    expect(after.usage).toEqual(before.usage);
  });
});

describe("save assistant: message cap", () => {
  it("sets wrapUp near the cap and blocks at the cap", async () => {
    mockMessageCap.mockResolvedValue(12); // wrapUp from user message 3 (12 - 9)
    const { sessionId } = await newSession(); // 1 user message
    const second = await saveSessionTurn({ userId: ALICE, sessionId, message: "q2" });
    expect(second.wrapUp).toBe(false);
    const third = await saveSessionTurn({ userId: ALICE, sessionId, message: "q3" });
    expect(third.wrapUp).toBe(true);

    await Sessions.updateOne(
      { _id: sessionId },
      { $push: { messages: { $each: Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, role: "user", kind: "text", text: "x" })) } } }
    );
    const err: any = await saveSessionTurn({ userId: ALICE, sessionId, message: "one too many" }).catch((e: any) => e);
    expect(err.code).toBe("TIER_LIMIT_REACHED");
    expect(err.cap).toBe(12);
  });

  it("falls back to 60 when the tier has no cap", async () => {
    mockMessageCap.mockResolvedValue(null);
    const { sessionId } = await newSession();
    await Sessions.updateOne(
      { _id: sessionId },
      { $push: { messages: { $each: Array.from({ length: 59 }, (_, i) => ({ id: `x${i}`, role: "user", kind: "text", text: "x" })) } } }
    );
    const err: any = await saveSessionTurn({ userId: ALICE, sessionId, message: "61st" }).catch((e: any) => e);
    expect(err.cap).toBe(60);
    expect(mockAdvice).not.toHaveBeenCalled();
  });
});

describe("save assistant: input checks", () => {
  it("needs exactly one of message or pick, and the pick must be offered", async () => {
    const { sessionId } = await newSession();
    await expect(saveSessionTurn({ userId: ALICE, sessionId })).rejects.toThrow(/either message or pick/);
    await expect(saveSessionTurn({ userId: ALICE, sessionId, message: "a", pick: "b" })).rejects.toThrow(/either/);
    await expect(saveSessionTurn({ userId: ALICE, sessionId, pick: "not offered" })).rejects.toThrow(/offered/);
  });

  it("needs a message and a targetLanguage to start", async () => {
    await expect(createSaveSession({ userId: ALICE, message: "  ", targetLanguage: "fa" })).rejects.toThrow(/message/);
    await expect(createSaveSession({ userId: ALICE, message: "hi" })).rejects.toThrow(/targetLanguage/);
    expect(mockCheckCredit).not.toHaveBeenCalled();
  });

  it("cuts long titles to 120 characters", async () => {
    const long = "word ".repeat(60);
    const { sessionId } = await newSession(ALICE, long);
    const stored = await Sessions.findById(sessionId).lean<any>();
    expect(stored.title.length).toBeLessThanOrEqual(120);
    expect(stored.title.endsWith("…")).toBe(true);
  });
});
