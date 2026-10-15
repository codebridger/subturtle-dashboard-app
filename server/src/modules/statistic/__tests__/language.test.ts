/**
 * Progress per language (work list B-23) against an in-memory MongoDB: counts and the
 * chart cover one language, the streak covers all of them, and the chart only counts
 * phrases or bundles.
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
jest.mock("../../subscription/enforcement", () => ({ assertFeatureEnabled: jest.fn(async () => undefined) }));

import { BUNDLE_COLLECTION, PHRASE_COLLECTION, PROFILE_COLLECTION } from "../../../config";
import { globalStreak } from "../functions";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;

const ALICE = new Types.ObjectId().toString();
const DAY = 24 * 60 * 60 * 1000;
let db: MemoryMongo;
let Phrases: Model<any>;
let Bundles: Model<any>;
let Profiles: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  Phrases = db.model(PHRASE_COLLECTION);
  Bundles = db.model(BUNDLE_COLLECTION);
  Profiles = db.model(PROFILE_COLLECTION);
}, 120000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.clear();
});

async function saved(daysAgo: number, language?: string, extra: Record<string, any> = {}) {
  await Phrases.collection.insertOne({ refId: ALICE, phrase: "p", createdAt: new Date(Date.now() - daysAgo * DAY), ...(language ? { language } : {}), ...extra });
}

describe("getUserStatistic", () => {
  it("counts one language; old documents are English; kept phrases do not count", async () => {
    await Profiles.create({ refId: ALICE, learningLanguage: "de" });
    await saved(0); // old, English
    await saved(0, "en");
    await saved(0, "de");
    await saved(0, "de", { status: "pending" });
    await Bundles.collection.insertOne({ refId: ALICE, title: "Old" });
    await Bundles.collection.insertOne({ refId: ALICE, title: "Deutsch", language: "de" });

    const de = await fn("getUserStatistic")({ userId: ALICE });
    expect(de).toMatchObject({ language: "de", totalPhrases: 1, totalBundles: 1 });
    const en = await fn("getUserStatistic")({ userId: ALICE, language: "en" });
    expect(en).toMatchObject({ language: "en", totalPhrases: 2, totalBundles: 1 });
  });

  it("the streak stays global: saves in any language keep it going", async () => {
    await saved(0, "de");
    await saved(1, "en");
    await saved(2); // old, English
    await saved(3, "es");
    await saved(5, "de"); // a gap on day 4 ends the run
    const de = await fn("getUserStatistic")({ userId: ALICE, language: "de" });
    const es = await fn("getUserStatistic")({ userId: ALICE, language: "es" });
    expect(de.streak).toBe(4);
    expect(es.streak).toBe(4);
  });

  it("a day with no save yet does not break the streak", async () => {
    await saved(1, "de");
    await saved(2, "en");
    expect(await globalStreak(ALICE)).toBe(2);
    expect(await globalStreak(ALICE, new Date(Date.now() + 2 * DAY))).toBe(0);
  });
});

describe("generateChartDataForInsertionRatio", () => {
  const chart = (args: Record<string, any>) =>
    fn("generateChartDataForInsertionRatio")({ userId: ALICE, days: 3, database: "user_content", collection: PHRASE_COLLECTION, ...args });
  const total = (points: [string, number][]) => points.reduce((sum, [, n]) => sum + n, 0);

  beforeEach(async () => {
    await saved(0, "de");
    await saved(1, "de");
    await saved(1); // old, English
    await saved(0, "de", { status: "pending" });
  });

  it("charts one language (the active one when none is sent)", async () => {
    expect(total(await chart({ language: "de" }))).toBe(2);
    expect(total(await chart({}))).toBe(1); // no profile: English
  });

  it("charts every language with language: all", async () => {
    expect(total(await chart({ language: "all" }))).toBe(3);
  });

  it("refuses any collection other than phrases and bundles", async () => {
    await expect(chart({ collection: "subscription" })).rejects.toThrow(/counts/);
    await expect(chart({ database: "cms", collection: "auth" })).rejects.toThrow(/counts/);
  });
});
