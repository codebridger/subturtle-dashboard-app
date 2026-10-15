/**
 * Leitner, Pool and board per language (ADR-006 points 3 and 7, work list B-10 to B-12),
 * against a real in-memory MongoDB: today's documents with no `language` read as English
 * with no backfill, each language has its own documents, get-or-create is an upsert, and
 * paused languages are skipped by the reminder and the age-out.
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
jest.mock("../../schedule/service", () => ({
  ScheduleService: { register: jest.fn(), createJob: jest.fn(async () => undefined) },
}));

import {
  BOARD_ACTIVITY_COLLECTION,
  BUNDLE_COLLECTION,
  LEITNER_SYSTEM_COLLECTION,
  PHRASE_COLLECTION,
  POOL_COLLECTION,
  PROFILE_COLLECTION,
} from "../../../config";
import { LANGUAGE_PROFILE } from "../../../languages/language-settings";
import { LeitnerService, runReviewReminder } from "../service";
import { PoolService } from "../../pool/service";
import { BoardService } from "../../board/service";

const leitnerFns = require("../functions").functions as any[];
const boardFns = require("../../board/functions").functions as any[];
const poolFns = require("../../pool/functions").functions as any[];
const call = (fns: any[], name: string, args: any) => fns.find((f) => f.name === name).callback(args);

const ALICE = new Types.ObjectId().toString();
const DAY = 24 * 60 * 60 * 1000;

let db: MemoryMongo;
let Leitner: Model<any>;
let Pools: Model<any>;
let Board: Model<any>;
let Phrases: Model<any>;
let Profiles: Model<any>;
let LanguageProfiles: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  Leitner = db.model(LEITNER_SYSTEM_COLLECTION, require("../db")[0].schema);
  Pools = db.model(POOL_COLLECTION, require("../../pool/db")[0].schema);
  Board = db.model(BOARD_ACTIVITY_COLLECTION, require("../../board/db")[0].schema);
  Phrases = db.model(PHRASE_COLLECTION);
  Profiles = db.model(PROFILE_COLLECTION);
  LanguageProfiles = db.model(LANGUAGE_PROFILE);
  db.model(BUNDLE_COLLECTION);
  // The unique indexes the index script builds (scripts/multilingual-indexes.ts).
  await Leitner.collection.createIndex({ userId: 1, language: 1 }, { unique: true });
  await Pools.collection.createIndex({ userId: 1, language: 1 }, { unique: true });
  await Board.collection.createIndex({ userId: 1, type: 1, language: 1, refId: 1 }, { unique: true });
}, 120000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.clear();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  (LeitnerService as any).syncedUsers.clear();
});

async function phrase(text: string, language?: string, extra: Record<string, any> = {}) {
  const doc = await Phrases.create({ refId: ALICE, phrase: text, translation: `t(${text})`, ...(language ? { language } : {}), ...extra });
  return String(doc._id);
}

/** A Leitner document from before multilingual: no `language` field at all. */
async function oldLeitner(items: any[]) {
  await Leitner.collection.insertOne({ userId: ALICE, settings: LeitnerService.DEFAULT_SETTINGS, items });
}

const dueItem = (phraseId: string, boxLevel = 1) => ({
  phraseId,
  boxLevel,
  nextReviewDate: new Date(Date.now() - DAY),
  lastAttemptDate: new Date(Date.now() - 2 * DAY),
  consecutiveIncorrect: 0,
});

describe("Leitner on today's data (no backfill)", () => {
  it("an old client with no language gets the old document's cards", async () => {
    const p1 = await phrase("give up");
    await oldLeitner([dueItem(p1)]);

    const items = await call(leitnerFns, "get-review-session", { userId: ALICE });
    expect(items.map((i: any) => i.phraseId)).toEqual([p1]);
    // No second English document was made.
    expect(await Leitner.countDocuments({ userId: ALICE })).toBe(1);
  });

  it("language 'en' also reads the document with no language", async () => {
    const p1 = await phrase("give up");
    await oldLeitner([dueItem(p1)]);

    const items = await call(leitnerFns, "get-review-session", { userId: ALICE, language: "en" });
    expect(items).toHaveLength(1);
    expect(await Leitner.countDocuments({ userId: ALICE })).toBe(1);
  });

  it("an old client of a learner whose active language is German works on German", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "de", learningLanguages: ["en", "de"] });
    const en = await phrase("give up");
    await oldLeitner([dueItem(en)]);

    const items = await call(leitnerFns, "get-review-session", { userId: ALICE });
    expect(items).toEqual([]);
    const docs = await Leitner.find({ userId: ALICE }).lean();
    expect(docs.map((d: any) => d.language ?? null).sort()).toEqual(["de", null]);
  });
});

describe("Leitner per language", () => {
  it("each language has its own cards, stats and settings", async () => {
    const en = await phrase("give up");
    const de = await phrase("aufgeben", "de");
    await LeitnerService.addPhraseToBox(ALICE, en);
    await LeitnerService.addPhraseToBox(ALICE, de); // goes by the phrase's own language

    const enItems = await call(leitnerFns, "get-review-session", { userId: ALICE, language: "en" });
    const deItems = await call(leitnerFns, "get-review-session", { userId: ALICE, language: "de" });
    expect(enItems.map((i: any) => i.phraseId)).toEqual([en]);
    expect(deItems.map((i: any) => i.phraseId)).toEqual([de]);

    await call(leitnerFns, "update-settings", { userId: ALICE, language: "de", settings: { dailyLimit: 5 } });
    const deStats = await call(leitnerFns, "get-stats", { userId: ALICE, language: "de" });
    const enStats = await call(leitnerFns, "get-stats", { userId: ALICE, language: "en" });
    expect(deStats.language).toBe("de");
    expect(deStats.settings.dailyLimit).toBe(5);
    expect(enStats.settings.dailyLimit).toBe(20);
    expect(deStats.totalItems).toBe(1);

    await call(leitnerFns, "reset-system", { userId: ALICE, language: "de" });
    expect((await call(leitnerFns, "get-stats", { userId: ALICE, language: "de" })).totalItems).toBe(0);
    expect((await call(leitnerFns, "get-stats", { userId: ALICE, language: "en" })).totalItems).toBe(1);
  });

  it("update-settings writes Pool settings to that language's profile when it has one", async () => {
    await LanguageProfiles.create({ userId: ALICE, language: "de", poolAgeCutoffDays: 30 });
    await call(leitnerFns, "update-settings", { userId: ALICE, language: "de", settings: { poolAgeCutoffDays: 3 } });
    expect((await call(leitnerFns, "get-stats", { userId: ALICE, language: "de" })).settings.poolAgeCutoffDays).toBe(3);
    expect(((await LanguageProfiles.findOne({ userId: ALICE, language: "de" }).lean()) as any).poolAgeCutoffDays).toBe(3);
    // English has no language profile: the profile value applies.
    expect((await LeitnerService.getSettings(ALICE, "en")).poolAgeCutoffDays).toBe(3);
  });

  it("get-or-create is one upsert: parallel calls leave one document per language", async () => {
    await Promise.all([
      ...Array.from({ length: 5 }, () => LeitnerService.ensureInitialized(ALICE, "de")),
      ...Array.from({ length: 5 }, () => LeitnerService.ensureInitialized(ALICE, "en")),
    ]);
    expect(await Leitner.countDocuments({ userId: ALICE, language: "de" })).toBe(1);
    expect(await Leitner.countDocuments({ userId: ALICE, language: "en" })).toBe(1);
  });

  it("submit-review: right moves up, close keeps the box, wrong moves down; isCorrect still works", async () => {
    const de = await phrase("aufgeben", "de");
    await LeitnerService.addPhraseToBox(ALICE, de, 3);
    const box = async () => (await Leitner.findOne({ userId: ALICE, language: "de" }).lean() as any).items[0].boxLevel;

    const right = await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, result: "right", language: "de" });
    expect(right).toEqual({ success: true, language: "de", result: "right" });
    expect(await box()).toBe(4);

    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, result: "close", language: "de" });
    expect(await box()).toBe(4);
    const after = (await Leitner.findOne({ userId: ALICE, language: "de" }).lean() as any).items[0];
    expect(new Date(after.nextReviewDate).getTime()).toBeGreaterThan(Date.now() + 7 * DAY);

    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, isCorrect: false }); // old client
    expect(await box()).toBe(3);
    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, isCorrect: true, result: "bogus" });
    expect(await box()).toBe(4);
    await expect(call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de })).rejects.toThrow(/result/);
  });

  it("an old client's review of a German card lands in the German box", async () => {
    const de = await phrase("aufgeben", "de");
    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, isCorrect: true });
    const deDoc: any = await Leitner.findOne({ userId: ALICE, language: "de" }).lean();
    expect(deDoc.items.map((i: any) => i.phraseId)).toEqual([de]);
    expect(await Leitner.countDocuments({ userId: ALICE, language: { $in: ["en", null] } })).toBe(0);
  });

  it("removing a deleted phrase with no language takes it out of every language", async () => {
    const id = new Types.ObjectId().toString();
    await Leitner.create({ userId: ALICE, language: "de", settings: LeitnerService.DEFAULT_SETTINGS, items: [dueItem(id)] });
    await oldLeitner([dueItem(id)]);

    await LeitnerService.removePhraseFromBox(ALICE, id);
    const docs: any[] = await Leitner.find({ userId: ALICE }).lean();
    expect(docs.every((d) => d.items.length === 0)).toBe(true);
  });

  it("get-phrase-management-info lists that language's bundles only", async () => {
    const Bundles = mockModels[BUNDLE_COLLECTION];
    await Bundles.create({ refId: ALICE, title: "Old" });
    await Bundles.create({ refId: ALICE, title: "Deutsch", language: "de" });
    const en = await call(leitnerFns, "get-phrase-management-info", { userId: ALICE });
    const de = await call(leitnerFns, "get-phrase-management-info", { userId: ALICE, language: "de" });
    expect(en.bundles.map((b: any) => b.title)).toEqual(["Old"]);
    expect(de.bundles.map((b: any) => b.title)).toEqual(["Deutsch"]);
    expect(de.language).toBe("de");
  });

  it("review items carry the cloze cue and accepted answers", async () => {
    const de = await phrase("ich habe aufgegeben", "de", {
      chunks: [{ text: "aufgegeben", type: "separable_verb", confidence: 0.9, lemma: "aufgeben", form: "aufgegeben", acceptedAnswers: ["aufgegeben"] }],
    });
    await LeitnerService.addPhraseToBox(ALICE, de);
    const [item] = await call(leitnerFns, "get-review-session", { userId: ALICE, language: "de" });
    expect(item.cue).toEqual({ lemma: "aufgeben", form: "aufgegeben" });
    expect(item.acceptedAnswers).toContain("aufgegeben");
  });
});

describe("the review reminder", () => {
  it("toasts every language the learner studies and skips paused ones", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "de", learningLanguages: ["de", "es"], pausedLanguages: ["fr"] });
    for (const language of ["de", "es", "fr"]) {
      const id = await phrase(`p-${language}`, language);
      await Leitner.create({ userId: ALICE, language, settings: LeitnerService.DEFAULT_SETTINGS, items: [dueItem(id)] });
    }

    await runReviewReminder(ALICE);
    const toasted: any[] = await Board.find({ userId: ALICE, type: "leitner_review", state: "toasted" }).lean();
    expect(toasted.map((b) => b.language).sort()).toEqual(["de", "es"]);
  });
});

describe("Pool per language", () => {
  it("adds go to the phrase's language and are idempotent", async () => {
    const en = await phrase("give up");
    const de = await phrase("aufgeben", "de");
    await Promise.all([PoolService.add(ALICE, en), PoolService.add(ALICE, en), PoolService.add(ALICE, de)]);

    expect(await call(poolFns, "get-pool", { userId: ALICE, language: "en" })).toHaveLength(1);
    expect((await call(poolFns, "get-pool", { userId: ALICE, language: "de" })).map((i: any) => i.phraseId)).toEqual([de]);
    expect(await Pools.countDocuments({ userId: ALICE })).toBe(2);
  });

  it("an old Pool with no language is the English Pool", async () => {
    const en = await phrase("give up");
    await Pools.collection.insertOne({ userId: ALICE, items: [{ phraseId: en, pooled_at: new Date(), encountered: false }] });
    expect(await call(poolFns, "get-pool", { userId: ALICE })).toHaveLength(1);
    await PoolService.add(ALICE, await phrase("hold on"));
    expect(await Pools.countDocuments({ userId: ALICE })).toBe(1);
  });

  it("complete-pool-session moves each phrase into its own language's box 1", async () => {
    const de = await phrase("aufgeben", "de");
    await PoolService.add(ALICE, de);
    await call(poolFns, "complete-pool-session", { userId: ALICE, phraseIds: [de] });

    expect(await call(poolFns, "get-pool", { userId: ALICE, language: "de" })).toHaveLength(0);
    const deDoc: any = await Leitner.findOne({ userId: ALICE, language: "de" }).lean();
    expect(deDoc.items[0]).toMatchObject({ phraseId: de, boxLevel: 1, encountered: true });
  });

  it("the age-out skips paused and removed languages and reads the cut-off per language", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "de", learningLanguages: ["de", "es"], pausedLanguages: ["fr"], poolAgeCutoffDays: 7 });
    await LanguageProfiles.create({ userId: ALICE, language: "es", poolAgeCutoffDays: 30 });
    const old = new Date(Date.now() - 10 * DAY);
    const ids: Record<string, string> = {};
    for (const language of ["de", "es", "fr", "it"]) {
      ids[language] = await phrase(`p-${language}`, language);
      await Pools.create({ userId: ALICE, language, items: [{ phraseId: ids[language], pooled_at: old, encountered: false }] });
    }

    await PoolService.ageOutAllUsers();

    const left = async (language: string) => ((await Pools.findOne({ userId: ALICE, language }).lean()) as any).items.length;
    expect(await left("de")).toBe(0); // 10 days > 7: promoted
    expect(await left("es")).toBe(1); // its own cut-off is 30 days
    expect(await left("fr")).toBe(1); // paused
    expect(await left("it")).toBe(1); // not studied (removed)
    const deDoc: any = await Leitner.findOne({ userId: ALICE, language: "de" }).lean();
    expect(deDoc.items[0]).toMatchObject({ phraseId: ids.de, encountered: false });
  });
});

describe("board per language", () => {
  it("get-board: the old list without language, the 2.0 object with it", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "de", learningLanguages: ["en", "de"] });
    await BoardService.refreshActivity(ALICE, "leitner_review", { dueCount: 2, isActive: true }, true, "singleton", undefined, true, "en");
    await BoardService.refreshActivity(ALICE, "leitner_review", { dueCount: 1, isActive: true }, true, "singleton", undefined, true, "de");

    const old = await call(boardFns, "get-board", { userId: ALICE });
    expect(Array.isArray(old)).toBe(true);
    expect(old.map((a: any) => a.language)).toEqual(["de"]); // the active language

    const en = await call(boardFns, "get-board", { userId: ALICE, language: "en" });
    expect(en.language).toBe("en");
    expect(en.activities.map((a: any) => a.meta.dueCount)).toEqual([2]);
    expect(en.newLanguage).toBe(true); // no English phrases saved

    await phrase("aufgeben", "de");
    const de = await call(boardFns, "get-board", { userId: ALICE, language: "de" });
    expect(de.newLanguage).toBe(false);
  });

  it("rows from before multilingual are the English board; consume works per language", async () => {
    await Board.collection.insertOne({ userId: ALICE, type: "leitner_review", toastType: "singleton", state: "toasted", persistent: true, meta: {} });
    await BoardService.refreshActivity(ALICE, "leitner_review", { dueCount: 3 }, true);
    expect(await Board.countDocuments({ userId: ALICE })).toBe(1);

    await BoardService.refreshActivity(ALICE, "leitner_review", { dueCount: 1, isActive: true }, true, "singleton", undefined, true, "de");
    await call(boardFns, "consume-activity", { userId: ALICE, type: "leitner_review", language: "de" });
    const rows: any[] = await Board.find({ userId: ALICE }).lean();
    expect(rows.find((r) => r.language === "de").state).toBe("idle");
    expect(rows.find((r) => !r.language).state).toBe("toasted");
  });

  it("parallel refreshes create one row", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => BoardService.refreshActivity(ALICE, "leitner_review", { dueCount: 1 }, true, "singleton", undefined, true, "de"))
    );
    expect(await Board.countDocuments({ userId: ALICE, language: "de" })).toBe(1);
  });
});
