/**
 * The multilingual migration (B-27, B-30 snapshot) against an in-memory MongoDB with the
 * physical collection names modular-rest uses. Every step is a dry run by default, runs in
 * batches, and changes nothing the second time.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import mongoose, { Connection, Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  backfillBoard,
  backfillBundles,
  backfillLeitner,
  backfillPhrases,
  backfillPools,
  backfillProfiles,
  backfillSessions,
  ensureIndexes,
  measure,
  mergeLeitnerItems,
  OLD_BUNDLE_INDEX,
  physicalName,
  runBackfill,
  snapshotReviewLog,
} from "../multilingual";
import { databaseName, parseArgs } from "../cli";

let mongo: MongoMemoryServer;
let connection: Connection;
let db: any;
const quiet = { log: () => undefined, batchSize: 2 }; // tiny batches exercise the paging
const apply = { ...quiet, apply: true };
const c = (name: string) => db.collection(physicalName(name));

const U1 = new Types.ObjectId().toString();
const U2 = new Types.ObjectId().toString();
const day = (n: number) => new Date(Date.UTC(2026, 0, n));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  db = connection.db;
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  for (const collection of await db.listCollections().toArray()) await db.collection(collection.name).drop();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

/** Everything in the database, for "a dry run wrote nothing". */
async function dump() {
  const out: Record<string, any[]> = {};
  for (const collection of await db.listCollections().toArray()) {
    out[collection.name] = await db.collection(collection.name).find({}).sort({ _id: 1 }).toArray();
  }
  return out;
}

async function seed() {
  await c("profile").insertMany([
    { refId: U1, name: "old", createdAt: day(1) },
    { refId: U2, onboardingState: "needs_language" },
  ]);
  const phrases = await c("phrase").insertMany([
    { refId: U1, phrase: "give up", translation: "x", language_info: { source: "English", target: "Persian" }, translation_language: "fa", chunks: [{ text: "give up", confidence: 0.9 }] },
    { refId: U1, phrase: "hola", translation: "x", language_info: { source: "es", target: "fa" } },
    { refId: U1, phrase: "hi", translation: "x", translation_language: "fa" },
    { refId: U1, phrase: "Kind", translation: "x", language: "de", languageSource: "user" },
  ]);
  const ids = Object.values(phrases.insertedIds).map(String);
  await c("phrase_bundle").insertMany([
    { refId: U1, title: "Movies" },
    { refId: U1, title: "Movies", language: "en" }, // made after multilingual started
    { refId: U1, title: "Movies (2)", language: "en" },
    { refId: U1, title: "Books" },
  ]);
  await c("phrase_bundle").createIndex({ refId: 1, title: 1 }, { name: OLD_BUNDLE_INDEX, unique: false });
  const item = (phraseId: string, boxLevel: number, last: number) => ({ phraseId, boxLevel, nextReviewDate: day(last + 1), lastAttemptDate: day(last), consecutiveIncorrect: 0 });
  await c("leitner_system").insertMany([
    { userId: U1, settings: { dailyLimit: 20 }, items: [item(ids[0], 3, 5), item(ids[1], 1, 2)] },
    { userId: U1, settings: { dailyLimit: 9 }, items: [item(ids[0], 1, 7)] }, // a duplicate from find-then-create
    { userId: U1, language: "de", settings: {}, items: [item(ids[3], 2, 3)] },
  ]);
  await c("pool").insertMany([
    { userId: U1, items: [{ phraseId: ids[2], pooled_at: day(3), encountered: false }] },
    { userId: U1, items: [{ phraseId: ids[2], pooled_at: day(1), encountered: true }] },
  ]);
  await c("board_activity").insertMany([
    { userId: U1, type: "leitner_review", state: "idle", lastUpdated: day(1), meta: { dueCount: 1 } },
    { userId: U1, type: "leitner_review", state: "toasted", lastUpdated: day(4), meta: { dueCount: 4 } },
  ]);
  await c("live_session").insertOne({ refId: U1, metadata: { nativeLanguage: "Persian" } });
  await c("live_session_text").insertOne({ refId: U1, metadata: {} });
  await c("save_assistant_session").insertOne({ refId: U1, targetLanguage: "Persian" });
  return ids;
}

describe("physical names and the CLI", () => {
  it("uses the names modular-rest stores collections under", () => {
    expect(physicalName("leitner_system")).toBe("leitner_systems");
    expect(physicalName("board_activity")).toBe("board_activities");
    expect(physicalName("phrase_bundle")).toBe("phrase_bundles");
  });

  it("is a dry run unless --apply is given", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(["--apply", "--batch-size=20", "--only", "phrases,bundles"])).toEqual({ apply: true, batchSize: 20, only: ["phrases", "bundles"] });
    expect(databaseName({ MONGO_DB_PREFIX: "subturtle_" } as any)).toBe("subturtle_user_content");
    expect(databaseName({ MONGO_SINGLE_DATABASE: "true" } as any)).toBeUndefined();
  });
});

describe("a dry run", () => {
  it("writes nothing, in every step, the snapshot and the indexes", async () => {
    await seed();
    const before = await dump();
    const reports = await runBackfill(db, quiet);
    await snapshotReviewLog(db, quiet);
    const indexes = await ensureIndexes(db, quiet);
    expect(await dump()).toEqual(before);
    expect(reports.find((r) => r.step === "phrases")!.changed).toBe(3);
    expect(indexes.apply).toBe(false);
  });
});

describe("measure", () => {
  it("counts documents without language, duplicates and the detected languages", async () => {
    await seed();
    const m = await measure(db, quiet);
    expect(m.withoutLanguage).toMatchObject({ phrase: 3, phrase_bundle: 2, leitner_system: 2, pool: 2, board_activity: 2 });
    expect(m.duplicates).toMatchObject({ leitner_system: 1, pool: 1, board_activity: 1 });
    expect(m.detectedSources).toEqual({ en: 1, es: 1, unknown: 1 });
  });
});

describe("each step", () => {
  it("profiles: an old profile studies English; a new account is left alone", async () => {
    await seed();
    const r = await backfillProfiles(db, apply);
    expect(r.changed).toBe(1);
    const old = await c("profile").findOne({ refId: U1 });
    expect(old).toMatchObject({ onboardingState: "done", learningLanguage: "en", learningLanguages: ["en"], translationLanguage: "fa" });
    expect(await c("language_profile").findOne({ userId: U1 })).toMatchObject({ language: "en", status: "active", startLevel: "A1", startLevelSource: "default" });
    expect(await c("profile").findOne({ refId: U2 })).not.toHaveProperty("learningLanguage");
    expect(await c("language_profile").countDocuments({ userId: U2 })).toBe(0);
    expect((await backfillProfiles(db, apply)).changed).toBe(0);
  });

  it("phrases: English, marked backfill; a non-English guess is kept, not moved", async () => {
    await seed();
    expect((await backfillPhrases(db, apply)).changed).toBe(3);
    const hola = await c("phrase").findOne({ phrase: "hola" });
    expect(hola).toMatchObject({ language: "en", languageSource: "backfill", languageDetected: "es" });
    expect(await c("phrase").findOne({ phrase: "give up" })).not.toHaveProperty("languageDetected");
    expect(await c("phrase").findOne({ phrase: "Kind" })).toMatchObject({ language: "de", languageSource: "user" });
    expect((await backfillPhrases(db, apply)).changed).toBe(0);
  });

  it("bundles: English; a title an English bundle already has is renamed", async () => {
    await seed();
    const r = await backfillBundles(db, apply);
    expect(r.changed).toBe(2);
    const titles = (await c("phrase_bundle").find({ refId: U1 }).toArray()).map((b: any) => `${b.language}:${b.title}`).sort();
    expect(titles).toEqual(["en:Books", "en:Movies", "en:Movies (2)", "en:Movies (3)"]);
    expect((await backfillBundles(db, apply)).changed).toBe(0);
  });

  it("Leitner: duplicates merge (the latest answer wins), then the language is set", async () => {
    const ids = await seed();
    await backfillLeitner(db, apply);
    const docs = await c("leitner_system").find({ userId: U1 }).sort({ language: 1 }).toArray();
    expect(docs.map((d: any) => d.language)).toEqual(["de", "en"]);
    const en = docs[1];
    expect(en.settings.dailyLimit).toBe(20); // the fuller document stays
    expect(en.items.find((i: any) => i.phraseId === ids[0]).boxLevel).toBe(1); // answered on day 7
    expect(en.items).toHaveLength(2);
    expect((await backfillLeitner(db, apply)).changed).toBe(0);
  });

  it("merging keeps every card", () => {
    const merged = mergeLeitnerItems([{ phraseId: "a", lastAttemptDate: day(2) }], [[{ phraseId: "a", lastAttemptDate: day(1) }, { phraseId: "b" }]]);
    expect(merged.map((i) => i.phraseId).sort()).toEqual(["a", "b"]);
    expect(merged.find((i) => i.phraseId === "a")!.lastAttemptDate).toEqual(day(2));
  });

  it("Pool: duplicates merge (earliest pooled_at, met if met anywhere)", async () => {
    await seed();
    await backfillPools(db, apply);
    const pools = await c("pool").find({ userId: U1 }).toArray();
    expect(pools).toHaveLength(1);
    expect(pools[0].language).toBe("en");
    expect(pools[0].items).toHaveLength(1);
    expect(pools[0].items[0]).toMatchObject({ pooled_at: day(1), encountered: true });
  });

  it("board: the latest row per key stays", async () => {
    await seed();
    await backfillBoard(db, apply);
    const rows = await c("board_activity").find({ userId: U1 }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ language: "en", state: "toasted", meta: { dueCount: 4 } });
  });

  it("sessions: English, with the explanation and own language as codes", async () => {
    await seed();
    expect((await backfillSessions(db, apply)).changed).toBe(3);
    expect(await c("live_session").findOne({})).toMatchObject({ language: "en", explanationLanguage: "fa" });
    expect(await c("live_session_text").findOne({})).toMatchObject({ language: "en" });
    expect(await c("save_assistant_session").findOne({})).toMatchObject({ language: "en", translationLanguage: "fa", targetLanguage: "Persian" });
    expect((await backfillSessions(db, apply)).changed).toBe(0);
  });

  it("after every step nothing is left without a language", async () => {
    await seed();
    await runBackfill(db, apply);
    const m = await measure(db, quiet);
    expect(Object.values(m.withoutLanguage).every((n) => n === 0)).toBe(true);
    expect(Object.values(m.duplicates).every((n) => n === 0)).toBe(true);
  });
});

describe("indexes", () => {
  it("refuses the unique per-user indexes before the backfill, and keeps the old bundle index until the new one exists", async () => {
    await seed();
    const early = await ensureIndexes(db, apply);
    expect(early.blocked.join("\n")).toMatch(/leitner_systems.*no language/);
    expect(early.created).toContain("phrase_bundles.refId_1_language_1_title_1");
    expect(early.dropped).toEqual(["phrase_bundles.refId_1_title_1"]);
    const names = (await c("phrase_bundle").indexes()).map((i: any) => i.name);
    expect(names).toContain("refId_1_language_1_title_1");
    expect(names).not.toContain(OLD_BUNDLE_INDEX);
  });

  it("builds every index after the backfill, and a second run changes nothing", async () => {
    await seed();
    await runBackfill(db, apply);
    const first = await ensureIndexes(db, apply);
    expect(first.blocked).toEqual([]);
    expect(first.created).toEqual(
      expect.arrayContaining(["leitner_systems.userId_1_language_1", "pools.userId_1_language_1", "review_logs.userId_1_eventKey_1"])
    );
    await expect(c("leitner_system").insertOne({ userId: U1, language: "en", items: [] })).rejects.toThrow(/duplicate key/);
    const second = await ensureIndexes(db, apply);
    expect(second.created).toEqual([]);
    expect(second.dropped).toEqual([]);
  });
});

describe("review log snapshot", () => {
  it("one row per card with its language and box; a second run adds nothing", async () => {
    const ids = await seed();
    await backfillLeitner(db, apply);
    const dry = await snapshotReviewLog(db, quiet);
    expect(dry.changed).toBe(3);
    expect(await c("review_log").countDocuments({})).toBe(0);

    const first = await snapshotReviewLog(db, apply);
    expect(first.changed).toBe(3);
    const de = await c("review_log").findOne({ phraseId: ids[3] });
    expect(de).toMatchObject({ userId: U1, language: "de", languageSource: "user", kind: "snapshot", cardType: "snapshot", fromBox: 2, toBox: 2, eventKey: `snapshot:de:${ids[3]}` });
    expect(await c("review_log").findOne({ phraseId: ids[0] })).toMatchObject({ language: "en", chunk: "give up", languageSource: "backfill" });

    expect((await snapshotReviewLog(db, apply)).changed).toBe(0);
    expect((await snapshotReviewLog(db, quiet)).changed).toBe(0);
  });
});
