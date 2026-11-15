/**
 * The language purge job against a real in-memory MongoDB: what it claims, what it deletes
 * and keeps, the dry run, the daily cap, a crashed run, and the job registration.
 */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose, { Connection, Model, Schema } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const mockModels: Record<string, Model<any>> = {};
const mockRemoveFile = jest.fn<(id: string) => Promise<void>>();
jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  getCollection: jest.fn((_db: string, name: string) => mockModels[name]),
  fileService: { removeFile: (id: string) => mockRemoveFile(id) },
}));

import {
  BOARD_ACTIVITY_COLLECTION,
  BUNDLE_COLLECTION,
  LANGUAGE_PROFILE_COLLECTION,
  LEITNER_SYSTEM_COLLECTION,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  PHRASE_COLLECTION,
  POOL_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
} from "../../../config";
import { CLAIM_STALE_MS, getPurgeMode, getPurgeTargets, PURGE_JOB_NAME, runLanguagePurge, setupLanguagePurgeJob } from "../purge";

let mongo: MongoMemoryServer;
let connection: Connection;
let LanguageProfiles: Model<any>;
const DAY = 24 * 60 * 60 * 1000;

const OWNED_BY_REF = [PHRASE_COLLECTION, BUNDLE_COLLECTION, LIVE_SESSION_COLLECTION, LIVE_SESSION_TEXT_COLLECTION, SAVE_ASSISTANT_SESSION_COLLECTION];
const OWNED_BY_USER = [LEITNER_SYSTEM_COLLECTION, POOL_COLLECTION, BOARD_ACTIVITY_COLLECTION];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  LanguageProfiles = connection.model(LANGUAGE_PROFILE_COLLECTION, require("../db")[0].schema);
  for (const name of [...OWNED_BY_REF, ...OWNED_BY_USER]) {
    mockModels[name] = connection.model(name, new Schema({}, { strict: false }));
  }
  mockModels[LANGUAGE_PROFILE_COLLECTION] = LanguageProfiles;
  await LanguageProfiles.init();
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mockModels).map((model) => model.deleteMany({})));
  jest.clearAllMocks();
  mockRemoveFile.mockResolvedValue(undefined);
  delete process.env.LANGUAGE_PURGE_MODE;
  delete process.env.LANGUAGE_PURGE_DAILY_CAP;
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

/** One record of every kind for a user and language (`undefined`: no language field). */
async function seed(userId: string, language: string | undefined) {
  const lang = language ? { language } : {};
  for (const name of OWNED_BY_REF) await mockModels[name].create({ refId: userId, ...lang });
  for (const name of OWNED_BY_USER) await mockModels[name].create({ userId, ...lang });
}

async function count(userId: string, language: string | null) {
  const out: Record<string, number> = {};
  for (const name of OWNED_BY_REF) out[name] = await mockModels[name].countDocuments({ refId: userId, language });
  for (const name of OWNED_BY_USER) out[name] = await mockModels[name].countDocuments({ userId, language });
  return out;
}

const allZero = (counts: Record<string, number>) => Object.values(counts).every((n) => n === 0);
const allOne = (counts: Record<string, number>) => Object.values(counts).every((n) => n === 1);

async function removed(userId: string, language: string, purgeAt: Date, extra: Record<string, unknown> = {}) {
  return LanguageProfiles.create({ userId, language, status: "removed", removedAt: new Date(purgeAt.getTime() - 30 * DAY), purgeAt, ...extra });
}

describe("language purge", () => {
  it("is off by default and does nothing", async () => {
    const userId = "u1";
    await seed(userId, "de");
    await removed(userId, "de", new Date(Date.now() - DAY));
    expect(getPurgeMode()).toBe("off");
    const report = await runLanguagePurge();
    expect(report).toEqual({ mode: "off", languages: [], expiredPendingPhrases: 0, capReached: false });
    expect(allOne(await count(userId, "de"))).toBe(true);
  });

  it("an unknown mode is treated as off", () => {
    process.env.LANGUAGE_PURGE_MODE = "yes please";
    expect(getPurgeMode()).toBe("off");
  });

  it("dry run counts what would go, deletes and claims nothing", async () => {
    const userId = "u1";
    await seed(userId, "de");
    await mockModels[PHRASE_COLLECTION].create({ refId: userId, language: "de", images: [{ _id: new mongoose.Types.ObjectId() }] });
    await removed(userId, "de", new Date(Date.now() - DAY));

    const report = await runLanguagePurge({ mode: "dry-run" });
    expect(report.languages).toHaveLength(1);
    expect(report.languages[0].deleted[`user_content.${PHRASE_COLLECTION}`]).toBe(2);
    expect(report.languages[0].files).toBe(1);
    expect(mockRemoveFile).not.toHaveBeenCalled();
    expect(allZero(await count(userId, "de"))).toBe(false);
    expect((await LanguageProfiles.findOne({ userId }).lean<any>()).status).toBe("removed");
  });

  it("deletes a due language's records and files, then its language profile; keeps everything else", async () => {
    const imageId = new mongoose.Types.ObjectId();
    await seed("u1", "de");
    await seed("u1", "fr");
    await seed("u2", "de");
    await mockModels[PHRASE_COLLECTION].create({ refId: "u1", language: "de", images: [{ _id: imageId }] });
    await removed("u1", "de", new Date(Date.now() - DAY));
    await removed("u1", "fr", new Date(Date.now() + DAY)); // not due yet
    await LanguageProfiles.create({ userId: "u2", language: "de", status: "active" });

    const report = await runLanguagePurge({ mode: "on" });

    expect(report.languages.map((l) => `${l.userId}/${l.language}`)).toEqual(["u1/de"]);
    expect(report.languages[0].files).toBe(1);
    expect(mockRemoveFile).toHaveBeenCalledWith(String(imageId));
    expect(allZero(await count("u1", "de"))).toBe(true);
    expect(allOne(await count("u1", "fr"))).toBe(true);
    expect(allOne(await count("u2", "de"))).toBe(true);
    expect(await LanguageProfiles.exists({ userId: "u1", language: "de" })).toBeNull();
    expect(await LanguageProfiles.countDocuments()).toBe(2);
  });

  it("English also takes the records from before multilingual (no language field)", async () => {
    await seed("u1", undefined);
    await seed("u1", "de");
    await removed("u1", "en", new Date(Date.now() - DAY));
    await runLanguagePurge({ mode: "on" });
    expect(allZero(await count("u1", null))).toBe(true);
    expect(allOne(await count("u1", "de"))).toBe(true);
  });

  it("claims before deleting, so a language re-added in time is not purged", async () => {
    await seed("u1", "de");
    const lp = await removed("u1", "de", new Date(Date.now() - DAY));
    // The learner re-added it before the job ran.
    await LanguageProfiles.updateOne({ _id: lp._id, status: "removed" }, { $set: { status: "active" }, $unset: { purgeAt: 1 } });
    const report = await runLanguagePurge({ mode: "on" });
    expect(report.languages).toEqual([]);
    expect(allOne(await count("u1", "de"))).toBe(true);
  });

  it("finishes a language a crashed run left purging, once the claim is stale", async () => {
    await seed("u1", "de");
    await seed("u2", "de");
    await removed("u1", "de", new Date(Date.now() - DAY), { status: "purging", purgeClaimedAt: new Date(Date.now() - CLAIM_STALE_MS - 1000) });
    await removed("u2", "de", new Date(Date.now() - DAY), { status: "purging", purgeClaimedAt: new Date() });

    const report = await runLanguagePurge({ mode: "on" });
    expect(report.languages.map((l) => l.userId)).toEqual(["u1"]);
    expect(allOne(await count("u2", "de"))).toBe(true);
  });

  it("stops at the daily cap and says so", async () => {
    for (const userId of ["a", "b", "c"]) {
      await seed(userId, "de");
      await removed(userId, "de", new Date(Date.now() - DAY));
    }
    process.env.LANGUAGE_PURGE_DAILY_CAP = "2";
    const report = await runLanguagePurge({ mode: "on" });
    expect(report.languages).toHaveLength(2);
    expect(report.capReached).toBe(true);
    expect(await LanguageProfiles.countDocuments({ status: "removed" })).toBe(1);

    const dry = await runLanguagePurge({ mode: "dry-run", cap: 5 });
    expect(dry.languages).toHaveLength(1);
    expect(dry.capReached).toBe(false);
  });

  it("deletes kept phrases whose 30 days ran out, and only those", async () => {
    const phrases = mockModels[PHRASE_COLLECTION];
    await phrases.create([
      { refId: "u1", language: "de", status: "pending", pendingExpiresAt: new Date(Date.now() - 1000) },
      { refId: "u1", language: "de", status: "pending", pendingExpiresAt: new Date(Date.now() + DAY) },
      { refId: "u1", language: "de", pendingExpiresAt: new Date(Date.now() - 1000) }, // moved in, field left over
    ]);
    expect((await runLanguagePurge({ mode: "dry-run" })).expiredPendingPhrases).toBe(1);
    expect(await phrases.countDocuments()).toBe(3);
    expect((await runLanguagePurge({ mode: "on" })).expiredPendingPhrases).toBe(1);
    expect(await phrases.countDocuments()).toBe(2);
  });

  it("covers every per-language collection", () => {
    expect(getPurgeTargets().map((t) => t.collection)).toEqual(expect.arrayContaining([...OWNED_BY_REF, ...OWNED_BY_USER]));
  });
});

describe("job registration", () => {
  const scheduler = () => ({
    register: jest.fn(),
    createJob: jest.fn<(...args: any[]) => Promise<unknown>>().mockResolvedValue(undefined),
    deleteJob: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
  });

  it("registers the function but keeps no daily job while off", async () => {
    const s = scheduler();
    await setupLanguagePurgeJob(s);
    expect(s.register).toHaveBeenCalledWith(PURGE_JOB_NAME, expect.any(Function));
    expect(s.createJob).not.toHaveBeenCalled();
    expect(s.deleteJob).toHaveBeenCalledWith(PURGE_JOB_NAME);
  });

  it("creates the daily job in dry-run and on", async () => {
    for (const mode of ["dry-run", "on"]) {
      process.env.LANGUAGE_PURGE_MODE = mode;
      const s = scheduler();
      await setupLanguagePurgeJob(s);
      expect(s.createJob).toHaveBeenCalledWith(PURGE_JOB_NAME, PURGE_JOB_NAME, expect.objectContaining({ jobType: "recurrent" }));
      expect(s.deleteJob).not.toHaveBeenCalled();
    }
  });
});
