/**
 * Coach sessions per language (work list B-13) against an in-memory MongoDB: a voice
 * record stores its learning and explanation languages, and the history lists one
 * language, with sessions from before multilingual counted as English.
 */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { Model, Types } from "mongoose";
import { startMemoryMongo, MemoryMongo } from "../../../test-utils/memory-mongo";

const mockModels: Record<string, Model<any>> = {};
jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  defineFunction: (opts: any) => opts,
  getCollection: jest.fn((_db: string, name: string) => {
    const model = mockModels[name];
    if (!model) throw new Error(`collection ${name} not found`);
    return model;
  }),
}));
jest.mock("../openai/functions", () => ({ requestEphemeralToken: {} }));
jest.mock("../gemini/functions", () => ({ requestGeminiEphemeralToken: {} }));
jest.mock("../../subscription/service", () => ({ recordUsage: jest.fn(), debitVoiceMinutes: jest.fn() }));
jest.mock("../../subscription/enforcement", () => ({ assertFeatureEnabled: jest.fn(async () => undefined) }));

import { LIVE_SESSION_COLLECTION, LIVE_SESSION_TEXT_COLLECTION, PROFILE_COLLECTION } from "../../../config";
import { LANGUAGE_PROFILE } from "../../../languages/language-settings";
import { sessionLanguages } from "../session-language";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;

const ALICE = new Types.ObjectId().toString();
let db: MemoryMongo;
let Voice: Model<any>;
let Text: Model<any>;
let Profiles: Model<any>;
let LanguageProfiles: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  Voice = db.model(LIVE_SESSION_COLLECTION, require("../db")[0].schema);
  Text = db.model(LIVE_SESSION_TEXT_COLLECTION, require("../../live_session_text/db")[0].schema);
  Profiles = db.model(PROFILE_COLLECTION);
  LanguageProfiles = db.model(LANGUAGE_PROFILE);
}, 120000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.clear();
});

const create = (args: Record<string, any>) =>
  fn("create-live-session-record")({ userId: ALICE, type: "bundle-practice", provider: "gemini", session: { id: "s" }, ...args });

describe("session languages", () => {
  it("stores the given learning and explanation languages", async () => {
    const record = await create({ language: "de", explanationLanguage: "fa" });
    expect(record.language).toBe("de");
    expect(record.explanationLanguage).toBe("fa");
  });

  it("an old client: the active language, and the old nativeLanguage title as the explanation language", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "es", translationLanguage: "fa" });
    const record = await create({ metadata: { aiCharacter: "x", nativeLanguage: "Persian" } });
    expect(record.language).toBe("es");
    expect(record.explanationLanguage).toBe("fa");
  });

  it("falls back to the language's setting, then the learner's own language", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "de", translationLanguage: "fa" });
    await LanguageProfiles.create({ userId: ALICE, language: "de", explanationLanguage: "en" });
    expect(await sessionLanguages(ALICE, {})).toEqual({ language: "de", explanationLanguage: "en" });
    expect(await sessionLanguages(ALICE, { language: "it" })).toEqual({ language: "it", explanationLanguage: "fa" });
  });

  it("an account from before multilingual: English, no explanation language", async () => {
    expect(await sessionLanguages(ALICE, {})).toEqual({ language: "en" });
  });
});

describe("list-live-sessions per language", () => {
  beforeEach(async () => {
    await Voice.collection.insertOne({ refId: ALICE, type: "bundle-practice", session: {}, createdAt: new Date("2026-01-01") }); // old: English
    await Voice.create({ refId: ALICE, type: "bundle-practice", session: {}, language: "de" });
    await Text.collection.insertOne({ refId: ALICE, instructions: "x", createdAt: new Date("2026-01-02") }); // old: English
    await Text.create({ refId: ALICE, instructions: "x", language: "de" });
    await Text.create({ refId: ALICE, instructions: "x", language: "es" });
  });

  it("lists one language, voice and text together", async () => {
    const de = await fn("list-live-sessions")({ userId: ALICE, language: "de" });
    expect(de.total).toBe(2);
    expect(de.items.every((s: any) => s.language === "de")).toBe(true);
  });

  it("an old client with no language gets the English history, old sessions included", async () => {
    const en = await fn("list-live-sessions")({ userId: ALICE });
    expect(en.total).toBe(2);
    expect(en.items.every((s: any) => !s.language)).toBe(true);
  });
});
