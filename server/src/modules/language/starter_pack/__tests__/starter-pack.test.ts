/**
 * B-21 / B-22: get-starter-pack, complete-starter-pack-items and skip-starter-pack on an
 * in-memory MongoDB, with small fixture packs.
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
jest.mock("../../../phrase_bundle/triggers", () => ({ phraseBundleTriggers: [] }));

import { BUNDLE_COLLECTION, LANGUAGE_PROFILE_COLLECTION, PHRASE_COLLECTION, PROFILE_COLLECTION } from "../../../../config";
import { LanguageService } from "../../service";
import { audioTextHash, setStarterPacksForTest, StarterPack } from "../../../../languages/starter-pack";
import { onAdded } from "../service";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;
const getStarterPack = fn("get-starter-pack");
const complete = fn("complete-starter-pack-items");
const skipPack = fn("skip-starter-pack");

const phraseBundleDefs = require("../../../phrase_bundle/db");
const languageDefs = require("../../db");

const USER = new mongoose.Types.ObjectId().toString();

const item = (id: string, text: string, extra: any = {}) => ({
  id,
  text,
  translations: { fa: `fa:${text}`, en: `en:${text}`, ar: `ar:${text}`, es: `es:${text}`, vi: `vi:${text}`, tr: `tr:${text}` },
  band: 1 as const,
  group: "greetings",
  ...extra,
});

const DE: StarterPack = {
  language: "de",
  version: 1,
  groups: [{ id: "greetings", name: "Greetings" }],
  items: [
    item("de-greetings-01", "Hallo!"),
    item("de-greetings-02", "Guten Morgen!", { lemma: "Morgen", form: "Morgen" }),
    item("de-greetings-03", "Tschüss!"),
  ],
};
const SV: StarterPack = { ...DE, language: "sv", items: [item("sv-greetings-01", "Hej!")] };

let mongo: MongoMemoryServer;
let connection: Connection;
let Phrases: Model<any>, Bundles: Model<any>, LanguageProfiles: Model<any>, Profiles: Model<any>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  Phrases = connection.model(PHRASE_COLLECTION, phraseBundleDefs.find((d: any) => d.collection === PHRASE_COLLECTION).schema);
  Bundles = connection.model(BUNDLE_COLLECTION, phraseBundleDefs.find((d: any) => d.collection === BUNDLE_COLLECTION).schema);
  LanguageProfiles = connection.model(LANGUAGE_PROFILE_COLLECTION, languageDefs.find((d: any) => d.collection === LANGUAGE_PROFILE_COLLECTION).schema);
  Profiles = connection.model(PROFILE_COLLECTION, new Schema({}, { strict: false }));
  Object.assign(mockModels, {
    [PHRASE_COLLECTION]: Phrases,
    [BUNDLE_COLLECTION]: Bundles,
    [LANGUAGE_PROFILE_COLLECTION]: LanguageProfiles,
    [PROFILE_COLLECTION]: Profiles,
  });
  await Promise.all([Bundles.init(), LanguageProfiles.init()]);
}, 120000);

afterAll(async () => {
  setStarterPacksForTest(null);
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Phrases, Bundles, LanguageProfiles, Profiles].map((m) => m.deleteMany({})));
  jest.restoreAllMocks();
  jest.spyOn(LanguageService, "getState").mockResolvedValue({ mocked: true } as any);
  delete process.env.STARTER_PACK_AUDIO_BASE_URL;
  delete process.env.LANGUAGES_ENABLED;
  setStarterPacksForTest([DE, SV]);
  await Profiles.create({ refId: USER, learningLanguage: "de", learningLanguages: ["de"], translationLanguage: "fa" });
  await LanguageProfiles.create({ userId: USER, language: "de", status: "active", starterPack: { state: "offered", heard: [], total: 0 } });
});

describe("get-starter-pack", () => {
  it("serves the pack in the learner's own language, with what was heard", async () => {
    const pack = await getStarterPack({ userId: USER, language: "de" });
    expect(pack.total).toBe(3);
    expect(pack.state).toBe("offered");
    expect(pack.heard).toEqual([]);
    expect(pack.items[0]).toEqual({ id: "de-greetings-01", text: "Hallo!", translation: "fa:Hallo!", translationLanguage: "fa", band: 1, group: "greetings" });
    expect(pack.items[1]).toEqual(expect.objectContaining({ lemma: "Morgen", form: "Morgen" }));
    expect(pack.items[0].audioUrl).toBeUndefined();
  });

  it("uses the active language when none is sent, and English when the own language is missing", async () => {
    await Profiles.updateOne({ refId: USER }, { $set: { translationLanguage: "de" } });
    const pack = await getStarterPack({ userId: USER });
    expect(pack.language).toBe("de");
    expect(pack.items[0]).toEqual(expect.objectContaining({ translation: "en:Hallo!", translationLanguage: "en" }));
  });

  it("adds audioUrl only for stored audio that matches the text", async () => {
    process.env.STARTER_PACK_AUDIO_BASE_URL = "https://cdn.example/starter/";
    const voice = "de-DE-Chirp3-HD-Kore";
    setStarterPacksForTest([DE], {
      de: {
        "de-greetings-01": { file: "de/de-greetings-01.mp3", voice, textHash: audioTextHash("Hallo!", voice) },
        "de-greetings-02": { file: "de/de-greetings-02.mp3", voice, textHash: audioTextHash("old text", voice) },
      },
    });
    const pack = await getStarterPack({ userId: USER, language: "de" });
    expect(pack.items[0].audioUrl).toBe("https://cdn.example/starter/de/de-greetings-01.mp3");
    expect(pack.items[1].audioUrl).toBeUndefined();
  });

  it("is not available for a language that is switched off or has no pack", async () => {
    expect((await getStarterPack({ userId: USER, language: "sv" })).total).toBe(1);
    process.env.LANGUAGES_ENABLED = "en,de";
    await expect(getStarterPack({ userId: USER, language: "sv" })).rejects.toThrow(/^not_available/);
    await expect(getStarterPack({ userId: USER, language: "pt" })).rejects.toThrow(/^not_available/);
  });
});

describe("complete-starter-pack-items", () => {
  it("adds heard items as phrases in the language's starter bundle", async () => {
    const out = await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01", "de-greetings-02", "nope", "de-greetings-01"] });
    expect(out).toEqual({ heard: 2, total: 3, done: false, added: ["de-greetings-01", "de-greetings-02"], deferred: [] });

    const bundle = await Bundles.findOne({ refId: USER }).lean<any>();
    expect(bundle.title).toBe("German starter pack");
    expect(bundle.language).toBe("de");
    expect(bundle.phrases).toHaveLength(2);

    const docs = await Phrases.find({ refId: USER }).sort({ phrase: 1 }).lean<any[]>();
    expect(docs.map((d) => [d.phrase, d.translation, d.language, d.languageSource])).toEqual([
      ["Guten Morgen!", "fa:Guten Morgen!", "de", "starter_pack"],
      ["Hallo!", "fa:Hallo!", "de", "starter_pack"],
    ]);
    expect(docs[0].chunks[0]).toEqual(expect.objectContaining({ text: "Morgen", lemma: "Morgen", acceptedAnswers: ["Morgen"] }));

    const lp = await LanguageProfiles.findOne({ userId: USER, language: "de" }).lean<any>();
    expect(lp.starterPack).toEqual(expect.objectContaining({ state: "in_progress", total: 3 }));
    expect(lp.starterPack.heard).toEqual(["de-greetings-01", "de-greetings-02"]);
  });

  it("is idempotent and finishes the pack", async () => {
    await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01"] });
    await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01"] });
    const out = await complete({ userId: USER, language: "de", itemIds: ["de-greetings-02", "de-greetings-03"] });
    expect(out.done).toBe(true);
    expect(out.heard).toBe(3);
    expect(await Phrases.countDocuments()).toBe(3);
    expect(await Bundles.countDocuments()).toBe(1);
    expect((await LanguageProfiles.findOne().lean<any>()).starterPack.state).toBe("done");
  });

  it("keeps to the daily intake and defers the rest", async () => {
    await LanguageProfiles.updateOne({ userId: USER }, { $set: { newPhrasesPerDay: 2 } });
    const out = await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01", "de-greetings-02", "de-greetings-03"] });
    expect(out.added).toEqual(["de-greetings-01", "de-greetings-02"]);
    expect(out.deferred).toEqual(["de-greetings-03"]);
    expect(out.heard).toBe(2);
    const again = await complete({ userId: USER, language: "de", itemIds: ["de-greetings-03"] });
    expect(again).toEqual(expect.objectContaining({ added: [], deferred: ["de-greetings-03"], heard: 2 }));
  });

  it("reuses a phrase the learner already saved in that language", async () => {
    const own = await Phrases.create({ refId: USER, phrase: "Hallo!", translation: "mine", language: "de" });
    await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01"] });
    expect(await Phrases.countDocuments()).toBe(1);
    expect((await Bundles.findOne().lean<any>()).phrases.map(String)).toEqual([String(own._id)]);
  });

  it("does not clash with a bundle of the same title in another language", async () => {
    await Bundles.create({ refId: USER, title: "German starter pack", language: "en", phrases: [] });
    await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01"] });
    const titles = (await Bundles.find({ refId: USER, language: "de" }).lean<any[]>()).map((b) => b.title);
    expect(titles).toEqual(["German starter pack (2)"]);
  });

  it("needs an active language and a list", async () => {
    await LanguageProfiles.updateOne({ userId: USER }, { $set: { status: "paused" } });
    await expect(complete({ userId: USER, language: "de", itemIds: [] })).rejects.toThrow(/^not_active/);
    await LanguageProfiles.updateOne({ userId: USER }, { $set: { status: "active" } });
    await expect(complete({ userId: USER, language: "de", itemIds: "x" })).rejects.toThrow(/itemIds/);
    await expect(complete({ language: "de", itemIds: [] })).rejects.toThrow(/User ID/);
  });
});

describe("skip-starter-pack", () => {
  it("marks the pack skipped and returns the state", async () => {
    const out = await skipPack({ userId: USER, language: "de" });
    expect(out).toEqual({ state: { mocked: true } });
    expect((await LanguageProfiles.findOne().lean<any>()).starterPack.state).toBe("skipped");
  });

  it("a skipped pack the learner opens again is in progress", async () => {
    await skipPack({ userId: USER, language: "de" });
    await complete({ userId: USER, language: "de", itemIds: ["de-greetings-01"] });
    expect((await LanguageProfiles.findOne().lean<any>()).starterPack.state).toBe("in_progress");
  });

  it("does not undo a finished pack", async () => {
    await complete({ userId: USER, language: "de", itemIds: DE.items.map((i) => i.id) });
    await skipPack({ userId: USER, language: "de" });
    expect((await LanguageProfiles.findOne().lean<any>()).starterPack.state).toBe("done");
  });
});

describe("onLanguageAdded hook", () => {
  it("sets the pack size for a language with a pack", async () => {
    const lp = await LanguageProfiles.findOne().lean<any>();
    await onAdded({ userId: USER, language: "de", languageProfile: lp });
    expect((await LanguageProfiles.findOne().lean<any>()).starterPack.total).toBe(3);
  });
});
