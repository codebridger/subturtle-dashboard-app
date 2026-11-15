/**
 * The follow-up to the multilingual backfill: phrases it defaulted to English although
 * another language was detected go to their real language, with the owner's language
 * profile, the bundle, and the Leitner card. Against an in-memory MongoDB with the physical
 * collection names modular-rest uses. Dry run by default, safe to run twice.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import mongoose, { Connection, Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { moveDetectedPhrases } from "../multilingual-detected";
import { physicalName } from "../multilingual";

let mongo: MongoMemoryServer;
let connection: Connection;
let db: any;
const quiet = { log: () => undefined, batchSize: 2 }; // tiny batches exercise the paging
const apply = { ...quiet, apply: true };
const c = (name: string) => db.collection(physicalName(name));

const U1 = new Types.ObjectId().toString(); // a profile, already given an English language profile by backfill
const U2 = new Types.ObjectId().toString(); // no profile document and no language profile at all
const U3 = new Types.ObjectId().toString(); // removed German a while ago
const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const ids = (docs: any[]) => docs.map((d) => String(d._id)).sort();

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

async function dump() {
  const out: Record<string, any[]> = {};
  for (const collection of await db.listCollections().toArray()) out[collection.name] = await db.collection(collection.name).find({}).sort({ _id: 1 }).toArray();
  return out;
}

/** The state after `migrate:multilingual --apply`: every document has `language: "en"`. */
const backfilled = { language: "en", languageSource: "backfill" };

async function seed() {
  await c("profile").insertOne({ refId: U1, onboardingState: "done", learningLanguage: "en", learningLanguages: ["en"], translationLanguage: "ru", createdAt: day(1) });
  await c("language_profile").insertOne({ userId: U1, language: "en", status: "active", addedAt: day(1) });
  const p = await c("phrase").insertMany([
    { refId: U1, phrase: "seltsam", translation: "странный", language_info: { source: "de", target: "ru" }, createdAt: day(2), ...backfilled, languageDetected: "de" },
    { refId: U1, phrase: "Auftrag", translation: "задание", language_info: { source: "de", target: "ru" }, createdAt: day(3), ...backfilled, languageDetected: "de" },
    { refId: U1, phrase: "give up", translation: "x", language_info: { source: "en", target: "ru" }, createdAt: day(4), ...backfilled },
    // saved as English on purpose: never moved, even though a German guess is on it
    { refId: U1, phrase: "Gift", translation: "x", createdAt: day(5), language: "en", languageSource: "user", languageDetected: "de" },
  ]);
  const [seltsam, auftrag, giveUp] = Object.values(p.insertedIds);
  await c("phrase_bundle").insertMany([
    { refId: U1, language: "en", title: "Netflix", desc: "shows", phrases: [seltsam, auftrag, giveUp] }, // keeps one English phrase
    { refId: U1, language: "en", title: "Only German", phrases: [seltsam] }, // emptied
  ]);
  await c("leitner_system").insertOne({
    userId: U1,
    language: "en",
    settings: { dailyLimit: 7, totalBoxes: 5 },
    items: [
      { phraseId: String(seltsam), boxLevel: 3, nextReviewDate: day(20) },
      { phraseId: String(giveUp), boxLevel: 1, nextReviewDate: day(21) },
    ],
  });
  await c("pool").insertOne({ userId: U1, language: "en", items: [{ phraseId: String(auftrag), pooled_at: day(6), encountered: false }] });

  // an extension-only account that never opened the dashboard: no profile document
  const q = await c("phrase").insertMany([
    { refId: U2, phrase: "matrimonio", translation: "marriage", language_info: { source: "es", target: "en" }, createdAt: day(2), ...backfilled, languageDetected: "es" },
    { refId: U2, phrase: "hello", translation: "x", language_info: { source: "en", target: "ru" }, createdAt: day(3), ...backfilled },
  ]);
  const [matrimonio] = Object.values(q.insertedIds);
  await c("phrase_bundle").insertOne({ refId: U2, language: "en", title: "Academic", phrases: [matrimonio] });
  await c("leitner_system").insertOne({ userId: U2, language: "en", settings: { dailyLimit: 20 }, items: [{ phraseId: String(matrimonio), boxLevel: 2 }] });

  // removed German, still inside its 30 days
  await c("profile").insertOne({ refId: U3, onboardingState: "done", learningLanguage: "en", learningLanguages: ["en"] });
  await c("language_profile").insertMany([
    { userId: U3, language: "en", status: "active", addedAt: day(1) },
    { userId: U3, language: "de", status: "removed", addedAt: day(1) },
  ]);
  await c("phrase").insertOne({ refId: U3, phrase: "Haus", translation: "x", language_info: { source: "de", target: "ru" }, ...backfilled, languageDetected: "de" });
  return { seltsam: String(seltsam), auftrag: String(auftrag), giveUp: String(giveUp), matrimonio: String(matrimonio) };
}

describe("moveDetectedPhrases", () => {
  it("a dry run reports the plan and writes nothing", async () => {
    await seed();
    const before = await dump();
    const report = await moveDetectedPhrases(db, quiet);
    expect(report.apply).toBe(false);
    expect(report.candidates).toBe(4); // seltsam, Auftrag, matrimonio, Haus
    expect(report.phrases).toBe(3); // Haus: the learner removed German
    expect(report.byLanguage).toEqual({ de: 2, es: 1 });
    expect(report.owners).toBe(2);
    expect(report.notes.join("\n")).toMatch(/removed de/);
    expect(await dump()).toEqual(before);
  });

  it("moves the phrase, its language profile, bundle and Leitner card, and leaves the rest alone", async () => {
    const s = await seed();
    const report = await moveDetectedPhrases(db, apply);
    expect(report).toMatchObject({ phrases: 3, languageProfilesCreated: 2, englishProfilesCreated: 1, profileDocsCreated: 1, bundlesCreated: 3, bundlesDeleted: 2, bundlesKept: 1, leitnerCardsMoved: 2, poolItemsMoved: 1 });

    // the phrases
    const phrases = await c("phrase").find({ refId: U1 }).toArray();
    const by = (t: string) => phrases.find((p: any) => p.phrase === t);
    expect(by("seltsam")).toMatchObject({ language: "de", languageSource: "detected", languageDetected: "de" });
    expect(by("Auftrag")).toMatchObject({ language: "de", languageSource: "detected" });
    expect(by("give up")).toMatchObject({ language: "en", languageSource: "backfill" });
    expect(by("Gift")).toMatchObject({ language: "en", languageSource: "user" }); // saved as English on purpose

    // the language profile has the shape the language service writes
    const german = await c("language_profile").findOne({ userId: U1, language: "de" });
    expect(german).toMatchObject({ status: "active", startLevel: "A1", startLevelSource: "default", goals: [], explanationLanguage: "ru", starterPack: { state: "none", heard: [], total: 0 } });
    expect(german.addedAt).toBeInstanceOf(Date);
    expect((await c("language_profile").findOne({ userId: U1, language: "en" })).addedAt).toEqual(day(1)); // untouched
    expect((await c("profile").findOne({ refId: U1 })).learningLanguages.sort()).toEqual(["de", "en"]);
    expect((await c("profile").findOne({ refId: U1 })).learningLanguage).toBe("en"); // the active language does not change

    // bundles: the English one keeps its remaining phrase, the German one has the same title and the moved phrases
    const english = await c("phrase_bundle").findOne({ refId: U1, language: "en", title: "Netflix" });
    expect(english.phrases.map(String)).toEqual([s.giveUp]);
    const deBundle = await c("phrase_bundle").findOne({ refId: U1, language: "de", title: "Netflix" });
    expect(deBundle.phrases.map(String).sort()).toEqual([s.seltsam, s.auftrag].sort());
    expect(deBundle.desc).toBe("shows");
    expect(await c("phrase_bundle").findOne({ refId: U1, language: "en", title: "Only German" })).toBeNull(); // emptied: deleted
    expect((await c("phrase_bundle").findOne({ refId: U1, language: "de", title: "Only German" })).phrases.map(String)).toEqual([s.seltsam]);

    // Leitner and Pool: the card moved with its box and dates, the English document keeps the rest
    const leitnerEn = await c("leitner_system").findOne({ userId: U1, language: "en" });
    expect(leitnerEn.items.map((i: any) => i.phraseId)).toEqual([s.giveUp]);
    const leitnerDe = await c("leitner_system").findOne({ userId: U1, language: "de" });
    expect(leitnerDe.settings).toEqual({ dailyLimit: 7, totalBoxes: 5 });
    expect(leitnerDe.items).toEqual([{ phraseId: s.seltsam, boxLevel: 3, nextReviewDate: day(20) }]);
    expect((await c("pool").findOne({ userId: U1, language: "en" })).items).toEqual([]);
    expect((await c("pool").findOne({ userId: U1, language: "de" })).items.map((i: any) => i.phraseId)).toEqual([s.auftrag]);

    // the account with no profile at all gets English and Spanish, and a profile document the way adoptLegacyAccount makes it
    const profiles2 = await c("language_profile").find({ userId: U2 }).toArray();
    expect(profiles2.map((p: any) => p.language).sort()).toEqual(["en", "es"]);
    expect(profiles2.find((p: any) => p.language === "en").addedAt).toEqual(day(2)); // the first phrase: English ranks first
    const profile2 = await c("profile").findOne({ refId: U2 });
    expect(profile2).toMatchObject({ onboardingState: "done", learningLanguage: "en", translationLanguage: "ru" });
    expect(profile2.learningLanguages.sort()).toEqual(["en", "es"]);
    expect(await c("phrase_bundle").findOne({ refId: U2, language: "en" })).toBeNull();
    expect((await c("phrase_bundle").findOne({ refId: U2, language: "es", title: "Academic" })).phrases).toHaveLength(1);

    // removed German: left in English
    expect(await c("phrase").findOne({ refId: U3 })).toMatchObject({ language: "en" });
    expect(await c("language_profile").countDocuments({ userId: U3 })).toBe(2);
  });

  it("changes nothing the second time", async () => {
    await seed();
    await moveDetectedPhrases(db, apply);
    const after = await dump();
    const again = await moveDetectedPhrases(db, apply);
    expect(again.phrases).toBe(0);
    expect(again.languageProfilesCreated + again.bundlesCreated + again.leitnerCardsMoved).toBe(0);
    expect(await dump()).toEqual(after);
  });

  it("finishes a run that stopped before the phrases were updated", async () => {
    const s = await seed();
    await moveDetectedPhrases(db, apply);
    // put the phrase flags back, as if the process died after the bundle, profile and card moves
    await c("phrase").updateMany({ language: "de", refId: U1 }, { $set: { language: "en", languageSource: "backfill" } });
    await moveDetectedPhrases(db, apply);
    expect((await c("phrase").find({ refId: U1, language: "de" }).toArray()).length).toBe(2);
    const deBundle = await c("phrase_bundle").findOne({ refId: U1, language: "de", title: "Netflix" });
    expect(deBundle.phrases.map(String).sort()).toEqual([s.seltsam, s.auftrag].sort()); // no duplicates
    expect((await c("leitner_system").findOne({ userId: U1, language: "de" })).items).toHaveLength(1);
  });

  it("adds to a bundle of that language that already exists, without duplicates", async () => {
    const s = await seed();
    const mine = new Types.ObjectId();
    await c("phrase_bundle").insertOne({ refId: U1, language: "de", title: "Netflix", phrases: [mine] });
    const report = await moveDetectedPhrases(db, apply);
    expect(report.bundlesReused).toBe(1);
    const deBundle = await c("phrase_bundle").findOne({ refId: U1, language: "de", title: "Netflix" });
    expect(deBundle.phrases.map(String).sort()).toEqual([String(mine), s.seltsam, s.auftrag].sort());
  });

  it("works before the backfill too: no language yet, the detected source decides", async () => {
    await c("profile").insertOne({ refId: U1, name: "old" });
    await c("phrase").insertMany([
      { refId: U1, phrase: "hola", translation: "x", language_info: { source: "es", target: "fa" } },
      { refId: U1, phrase: "hi", translation: "x", language_info: { source: "English", target: "fa" } },
      { refId: U1, phrase: "no info", translation: "x" },
    ]);
    const report = await moveDetectedPhrases(db, apply);
    expect(report.byLanguage).toEqual({ es: 1 });
    expect(await c("phrase").findOne({ phrase: "hola" })).toMatchObject({ language: "es", languageSource: "detected" });
    expect((await c("phrase").findOne({ phrase: "hi" })).language).toBeUndefined();
  });

  it("leaves a phrase in English when its language is not offered", async () => {
    await c("phrase").insertOne({ refId: U1, phrase: "obrigado", translation: "x", ...backfilled, languageDetected: "pt" });
    const report = await moveDetectedPhrases(db, apply);
    expect(report.phrases).toBe(0);
    expect(report.notes.join("\n")).toMatch(/pt is not offered/);
    expect((await c("phrase").findOne({ phrase: "obrigado" })).language).toBe("en");
  });

  it("--ids, --exclude and --languages narrow it to the confirmed phrases", async () => {
    const s = await seed();
    await moveDetectedPhrases(db, { ...apply, exclude: [s.seltsam] });
    expect((await c("phrase").findOne({ phrase: "seltsam" })).language).toBe("en");
    expect((await c("phrase").findOne({ phrase: "Auftrag" })).language).toBe("de");
    expect((await c("phrase").findOne({ phrase: "matrimonio" })).language).toBe("es");

    await moveDetectedPhrases(db, { ...apply, ids: [s.seltsam], languages: ["es"] }); // nothing matches both
    expect((await c("phrase").findOne({ phrase: "seltsam" })).language).toBe("en");
    await moveDetectedPhrases(db, { ...apply, ids: [s.seltsam], languages: ["de"] });
    expect((await c("phrase").findOne({ phrase: "seltsam" })).language).toBe("de");
  });

  it("moves each owner's phrases only into that owner's documents", async () => {
    await seed();
    await moveDetectedPhrases(db, apply);
    const others = await c("language_profile").find({ userId: { $nin: [U1, U2, U3] } }).toArray();
    expect(others).toEqual([]);
    expect(ids(await c("phrase_bundle").find({ refId: U3 }).toArray())).toEqual([]);
  });
});
