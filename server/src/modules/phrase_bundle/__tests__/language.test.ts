/**
 * Phrases and bundles per language (work list B-08, B-09, B-25) against an in-memory
 * MongoDB: createPhrase resolves the language (given, then detected if the learner has it,
 * then active), the duplicate check and the bundle title are per language, and old clients
 * that send no language write into the active language.
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
jest.mock("../../subscription/service", () => ({
  isUserOnFreemium: jest.fn(async () => false),
  updateFreemiumAllocation: jest.fn(),
  getOrCreateFreemiumAllocation: jest.fn(async () => ({ allowed_save_words_used: 0 })),
}));
jest.mock("../../subscription/enforcement", () => ({
  getEffectiveCap: jest.fn(async () => null),
  EntitlementLimitError: class EntitlementLimitError extends Error {},
}));
jest.mock("../../../utils/analytics", () => ({ trackServerEvent: jest.fn(), SERVER_ANALYTICS_EVENTS: {} }));
const mockModel = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../utils/openrouter", () => ({ openRouter: { createStructuredOutputWithZod: (...args: any[]) => mockModel(...args) } }));
// The insert triggers route new phrases into the Pool; that is covered in leitner_box.
jest.mock("../triggers", () => ({ phraseBundleTriggers: [] }));

import { BUNDLE_COLLECTION, PHRASE_COLLECTION, PROFILE_COLLECTION } from "../../../config";

const definitions = require("../db") as any[];
const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;
const createPhrase = fn("createPhrase");
const suggest = fn("getBundleSuggestionForPage");

const ALICE = new Types.ObjectId().toString();
let db: MemoryMongo;
let Phrases: Model<any>;
let Bundles: Model<any>;
let Profiles: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  Phrases = db.model(PHRASE_COLLECTION, definitions.find((d) => d.collection === PHRASE_COLLECTION).schema);
  Bundles = db.model(BUNDLE_COLLECTION, definitions.find((d) => d.collection === BUNDLE_COLLECTION).schema);
  Profiles = db.model(PROFILE_COLLECTION);
  await Promise.all([Phrases.init(), Bundles.init()]);
}, 120000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.clear();
  mockModel.mockReset();
  await Profiles.create({ refId: ALICE, learningLanguage: "en", learningLanguages: ["en", "de"], pausedLanguages: ["it"] });
});

async function bundle(title = "Mine", language?: string) {
  const doc = await Bundles.create({ refId: ALICE, title, ...(language ? { language } : {}) });
  return String(doc._id);
}

const save = (args: Record<string, any>) => createPhrase({ refId: ALICE, translation: "t", bundleIds: [], ...args });

describe("createPhrase resolves the language", () => {
  it("uses the language the client sends", async () => {
    const out = await save({ phrase: "Kind", language: "de" });
    expect(out).toMatchObject({ language: "de", languageSource: "user" });
    expect(await Phrases.findById(out._id).lean()).toMatchObject({ language: "de", languageSource: "user" });
  });

  it("an old build: the detected language when the learner has it (also paused)", async () => {
    const de = await save({ phrase: "Kind", type: "linguistic", language_info: { source: "German", target: "Persian" } });
    expect(de).toMatchObject({ language: "de", languageSource: "legacy" });
    const it = await save({ phrase: "bambino", type: "linguistic", language_info: { source: "it", target: "fa" } });
    expect(it.language).toBe("it");
  });

  it("an old build: the active language when the detected one is not the learner's; the guess is kept", async () => {
    const out = await save({ phrase: "niño", type: "linguistic", language_info: { source: "es", target: "fa" } });
    expect(out).toMatchObject({ language: "en", languageSource: "legacy" });
    expect(((await Phrases.findById(out._id).lean()) as any).languageDetected).toBe("es");
  });

  it("an old build with nothing detected: the active language, else English", async () => {
    expect((await save({ phrase: "hello" })).language).toBe("en");
    await Profiles.deleteMany({});
    expect((await save({ phrase: "bye" })).language).toBe("en");
  });

  it("the duplicate check is per language: German Kind and English kind are two phrases", async () => {
    const de1 = await save({ phrase: "Gift", language: "de" });
    const de2 = await save({ phrase: "Gift", language: "de" });
    const en = await save({ phrase: "Gift", language: "en" });
    expect(String(de2._id)).toBe(String(de1._id));
    expect(String(en._id)).not.toBe(String(de1._id));
    expect(await Phrases.countDocuments({ refId: ALICE })).toBe(2);
    expect(de2.language).toBe("de");
  });

  it("an English phrase from before multilingual (no language) is reused for English", async () => {
    const old = await Phrases.collection.insertOne({ refId: ALICE, phrase: "give up", translation: "t", type: "normal" });
    const out = await save({ phrase: "give up", language: "en" });
    expect(String(out._id)).toBe(String(old.insertedId));
    expect(out).toMatchObject({ language: "en", languageSource: "backfill" });
  });

  it("a kept (pending) phrase is not reused as a saved one", async () => {
    await Phrases.create({ refId: ALICE, phrase: "Kind", translation: "t", language: "de", status: "pending" });
    const out = await save({ phrase: "Kind", language: "de" });
    expect(await Phrases.countDocuments({ refId: ALICE })).toBe(2);
    expect(out.status).toBeUndefined();
  });

  it("the phrase language wins over the bundle's", async () => {
    const en = await bundle("English bundle", "en");
    const out = await save({ phrase: "Kind", language: "de", bundleIds: [en] });
    expect(out.language).toBe("de");
    expect(((await Bundles.findById(en).lean()) as any).phrases.map(String)).toEqual([String(out._id)]);
  });
});

describe("bundles per language", () => {
  it("the same title is allowed once per language", async () => {
    await bundle("Netflix", "de");
    await bundle("Netflix", "en");
    await expect(bundle("Netflix", "de")).rejects.toThrow(/duplicate key/);
    const indexes = await Bundles.collection.indexes();
    expect(indexes.map((i: any) => i.name)).toContain("refId_1_language_1_title_1");
    expect(indexes.map((i: any) => i.name)).not.toContain("refId_1_title_1");
  });

  it("a client insert with no language goes to the active language; a given one is kept", async () => {
    await Profiles.updateOne({ refId: ALICE }, { $set: { learningLanguage: "de" } });
    const plain = await Bundles.create({ refId: ALICE, title: "Old client" });
    const given = await Bundles.create({ refId: ALICE, title: "Extension", language: "en" });
    expect(plain.language).toBe("de");
    expect(given.language).toBe("en");
    const phrase = await Phrases.create({ refId: ALICE, phrase: "x", translation: "y" });
    expect(phrase).toMatchObject({ language: "de", languageSource: "active" });
  });
});

describe("getBundleSuggestionForPage per language", () => {
  const PAGE = "https://www.youtube.com/watch?v=abc";

  it("matches the page's bundle in the requested language only", async () => {
    const deBundle = await bundle("Dark S1", "de");
    const enBundle = await bundle("Dark S1 (EN)", "en");
    const de = await save({ phrase: "Kind", language: "de", bundleIds: [deBundle], type: "linguistic", sourceUrl: PAGE });
    await save({ phrase: "child", language: "en", bundleIds: [enBundle], type: "linguistic", sourceUrl: PAGE });
    expect(de.language).toBe("de");

    const forDe = await suggest({ refId: ALICE, pageUrl: PAGE, language: "de" });
    expect(forDe.matchedBundle).toEqual({ _id: deBundle, title: "Dark S1" });
    const forEn = await suggest({ refId: ALICE, pageUrl: PAGE }); // old client: active (English)
    expect(forEn.matchedBundle).toEqual({ _id: enBundle, title: "Dark S1 (EN)" });
  });

  it("a suggested name matches an existing bundle of that language only", async () => {
    await bundle("Dark", "en");
    mockModel.mockResolvedValue({ bundle_name: "Dark" });
    expect((await suggest({ refId: ALICE, pageTitle: "Dark S1E1 - Netflix", language: "de" })).suggestedName).toBe("Dark");
    expect((await suggest({ refId: ALICE, pageTitle: "Dark S1E1 - Netflix", language: "en" })).matchedBundle.title).toBe("Dark");
  });
});
