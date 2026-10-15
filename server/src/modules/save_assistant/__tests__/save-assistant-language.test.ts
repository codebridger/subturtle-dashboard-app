/**
 * B-16 / B-17: the save assistant stores the learning language and the own language as
 * codes, accepts the old `targetLanguage` name, and returns the detected language. Real
 * in-memory MongoDB; the translation service and the subscription service are mocked.
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

jest.mock("../../subscription/service", () => ({
  checkCreditAllocation: async () => ({ allowedToProceed: true }),
  recordUsage: async () => undefined,
  getTextChatMessageCap: async () => null,
}));

import {
  LEGACY_USAGE_COLLECTION,
  PROFILE_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
} from "../../../config";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;
const createSaveSession = fn("createSaveSession");
const saveSessionTurn = fn("saveSessionTurn");
const listSaveSessions = fn("listSaveSessions");

const sessionDefinition = require("../db")[0];
const legacyDefinition = require("../../translation/db")[0];

const USER = new mongoose.Types.ObjectId().toString();

function translationIn(source: string, chunks: any[] = []) {
  return {
    chunks,
    direction: { source: "ltr", target: "rtl" },
    translation: { phrase: "fa" },
    language_info: { source, target: "fa" },
    linguistic_data: { isValid: true, type: "x", definition: "d", phonetic: { transliteration: "" }, formality_level: "neutral" },
  };
}

let mongo: MongoMemoryServer;
let connection: Connection;
let Sessions: Model<any>;
let Profiles: Model<any>;
let Legacy: Model<any>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  Sessions = connection.model(SAVE_ASSISTANT_SESSION_COLLECTION, sessionDefinition.schema);
  Profiles = connection.model(PROFILE_COLLECTION, new Schema({ refId: String }, { strict: false }));
  Legacy = connection.model(LEGACY_USAGE_COLLECTION, legacyDefinition.schema);
  mockModels[SAVE_ASSISTANT_SESSION_COLLECTION] = Sessions;
  mockModels[PROFILE_COLLECTION] = Profiles;
  mockModels[LEGACY_USAGE_COLLECTION] = Legacy;
  await Legacy.init();
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Sessions.deleteMany({}), Profiles.deleteMany({}), Legacy.deleteMany({})]);
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  await Profiles.create({ refId: USER, learningLanguage: "de", learningLanguages: ["de", "es"], translationLanguage: "fa" });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("save assistant languages (B-16, B-17)", () => {
  it("stores the detected language when the learner has it, and the own language as a code", async () => {
    mockDetailed.mockResolvedValue(translationIn("es"));
    const out = await createSaveSession({ userId: USER, message: "Me levanto temprano", translationLanguage: "Persian" });

    expect(out.detectedLanguage).toBe("es");
    expect(out.language).toBe("es");
    expect(out.inProfile).toBe(true);
    const stored = await Sessions.findById(out.sessionId).lean<any>();
    expect(stored.language).toBe("es");
    expect(stored.translationLanguage).toBe("fa");
    expect(stored.detectedLanguage).toBe("es");
    // The prompt gets the learning language and the own language.
    expect(mockDetailed.mock.calls[0][0]).toEqual(
      expect.objectContaining({ translationLanguage: "fa", learningLanguage: "de", sourceLanguage: "" })
    );
    expect(await Legacy.countDocuments()).toBe(0);
  });

  it("falls back to the active language when the detected one is not in the profile", async () => {
    mockDetailed.mockResolvedValue(translationIn("fr"));
    const out = await createSaveSession({ userId: USER, message: "Il y a du monde", translationLanguage: "fa" });
    expect(out.detectedLanguage).toBe("fr");
    expect(out.inProfile).toBe(false);
    expect(out.language).toBe("de");
  });

  it("uses the language the client sends", async () => {
    mockDetailed.mockResolvedValue(translationIn("fr"));
    const out = await createSaveSession({ userId: USER, message: "Il y a du monde", translationLanguage: "fa", language: "fr" });
    expect(out.language).toBe("fr");
    expect(mockDetailed.mock.calls[0][0]).toEqual(expect.objectContaining({ learningLanguage: "fr" }));
  });

  it("accepts the old targetLanguage name and counts it", async () => {
    mockDetailed.mockResolvedValue(translationIn("de"));
    const out = await createSaveSession({ userId: USER, message: "Ich fange morgen an", targetLanguage: "fa" });
    expect(out.language).toBe("de");
    const stored = await Sessions.findById(out.sessionId).lean<any>();
    expect(stored.targetLanguage).toBe("fa");
    expect(stored.translationLanguage).toBe("fa");
    await flush();
    const counter = await Legacy.findOne({ field: "targetLanguage", surface: "createSaveSession" }).lean<any>();
    expect(counter.count).toBe(1);
  });

  it("refuses a request with neither name", async () => {
    await expect(createSaveSession({ userId: USER, message: "hi" })).rejects.toThrow(/translationLanguage/);
  });

  it("a turn on an old session (targetLanguage only) still works and returns the detected language", async () => {
    const old = await Sessions.create({
      refId: USER,
      title: "old",
      targetLanguage: "fa",
      messages: [{ id: "u1", role: "user", kind: "text", text: "I give up quickly now" }],
      candidates: [{ text: "I give up quickly now", type: "full" }, { text: "give up", type: "phrasal_verb" }],
    });
    mockDetailed.mockResolvedValue(translationIn("en"));
    const out = await saveSessionTurn({ userId: USER, sessionId: String(old._id), pick: "give up" });
    expect(out.detectedLanguage).toBe("en");
    expect(mockDetailed.mock.calls[0][0]).toEqual(expect.objectContaining({ translationLanguage: "fa" }));

    mockAdvice.mockResolvedValue({ reply: "ok" });
    const reply = await saveSessionTurn({ userId: USER, sessionId: String(old._id), message: "why?" });
    expect(reply.detectedLanguage).toBe("unknown");
  });

  it("lists one language's sessions; sessions with no language are English", async () => {
    await Sessions.create({ refId: USER, title: "old english", targetLanguage: "fa", lastMessageAt: new Date() });
    await Sessions.create({ refId: USER, title: "german", targetLanguage: "fa", language: "de", lastMessageAt: new Date() });
    const de = await listSaveSessions({ userId: USER, language: "de" });
    expect(de.map((s: any) => s.title)).toEqual(["german"]);
    const en = await listSaveSessions({ userId: USER, language: "en" });
    expect(en.map((s: any) => [s.title, s.language])).toEqual([["old english", "en"]]);
    expect(await listSaveSessions({ userId: USER })).toHaveLength(2);
  });
});
