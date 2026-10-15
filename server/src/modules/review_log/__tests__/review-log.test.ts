/**
 * The review log (B-30) against an in-memory MongoDB: submit-review and
 * complete-pool-session append one row per event with its language, a retried request with
 * the same key adds nothing, and a broken log never fails the learner's answer.
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
  DATABASE,
  LANGUAGE_PROFILE_COLLECTION,
  LEITNER_SYSTEM_COLLECTION,
  PHRASE_COLLECTION,
  POOL_COLLECTION,
  PROFILE_COLLECTION,
  REVIEW_LOG_COLLECTION,
} from "../../../config";
import { getPurgeTargets } from "../../language/purge";
import { PoolService } from "../../pool/service";
import { LeitnerService } from "../../leitner_box/service";
import { ReviewLogService } from "../service";

const leitnerFns = require("../../leitner_box/functions").functions as any[];
const poolFns = require("../../pool/functions").functions as any[];
const call = (fns: any[], name: string, args: any) => fns.find((f) => f.name === name).callback(args);

const ALICE = new Types.ObjectId().toString();
let db: MemoryMongo;
let Log: Model<any>;
let Phrases: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  db.model(LEITNER_SYSTEM_COLLECTION, require("../../leitner_box/db")[0].schema);
  db.model(POOL_COLLECTION, require("../../pool/db")[0].schema);
  db.model(BOARD_ACTIVITY_COLLECTION, require("../../board/db")[0].schema);
  db.model(PROFILE_COLLECTION);
  db.model(LANGUAGE_PROFILE_COLLECTION);
  Phrases = db.model(PHRASE_COLLECTION);
  Log = db.model(REVIEW_LOG_COLLECTION, require("../db")[0].schema);
  await Log.init();
}, 120000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.clear();
  (LeitnerService as any).syncedUsers.clear();
});

async function phrase(text: string, language?: string, extra: Record<string, any> = {}) {
  return String((await Phrases.create({ refId: ALICE, phrase: text, translation: "t", ...(language ? { language, languageSource: "user" } : {}), ...extra }))._id);
}

describe("submit-review writes the log", () => {
  it("one row per answer, with language, result, boxes and card type", async () => {
    const de = await phrase("ich habe aufgegeben", "de", { chunks: [{ text: "aufgegeben", confidence: 0.9 }] });
    await LeitnerService.addPhraseToBox(ALICE, de, 3);

    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, result: "close", language: "de" });
    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: de, isCorrect: true }); // an old client

    const rows: any[] = await Log.find({ userId: ALICE }).sort({ ts: 1 }).lean();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ language: "de", languageSource: "user", phraseId: de, chunk: "aufgegeben", cardType: "cloze", kind: "review", result: "close", fromBox: 3, toBox: 3 });
    expect(rows[1]).toMatchObject({ language: "de", result: "right", fromBox: 3, toBox: 4 });
  });

  it("an old phrase with no language logs as English, source backfill; the client's card type is kept", async () => {
    const en = await phrase("give up");
    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: en, result: "wrong", cardType: "typed" });
    expect(await Log.findOne({ phraseId: en }).lean()).toMatchObject({ language: "en", languageSource: "backfill", cardType: "typed", result: "wrong", fromBox: null, toBox: 1 });
  });

  it("a retry with the same eventKey adds no second row", async () => {
    const en = await phrase("give up");
    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: en, result: "right", eventKey: "answer-1" });
    await call(leitnerFns, "submit-review", { userId: ALICE, phraseId: en, result: "right", eventKey: "answer-1" });
    expect(await Log.countDocuments({ userId: ALICE, eventKey: "answer-1" })).toBe(1);
  });

  it("a broken log does not fail the answer", async () => {
    const en = await phrase("give up");
    const spy = jest.spyOn(Log, "create").mockRejectedValueOnce(new Error("log down") as never);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(call(leitnerFns, "submit-review", { userId: ALICE, phraseId: en, result: "right" })).resolves.toMatchObject({ success: true });
    expect(error).toHaveBeenCalled();
    spy.mockRestore();
    error.mockRestore();
  });
});

describe("complete-pool-session writes the log", () => {
  it("one 'seen' row per phrase, in its own language; a retried session adds nothing", async () => {
    const de = await phrase("Kind", "de");
    const en = await phrase("give up");
    await PoolService.add(ALICE, de);
    await PoolService.add(ALICE, en);

    await call(poolFns, "complete-pool-session", { userId: ALICE, phraseIds: [de, en], eventKey: "pool-1" });
    await call(poolFns, "complete-pool-session", { userId: ALICE, phraseIds: [de, en], eventKey: "pool-1" });

    const rows: any[] = await Log.find({ userId: ALICE }).lean();
    expect(rows.map((r) => `${r.phraseId === de ? "de" : "en"}:${r.language}:${r.kind}:${r.result}:${r.toBox}`).sort()).toEqual([
      "de:de:pool:seen:1",
      "en:en:pool:seen:1",
    ]);
  });

  it("writes nothing for an empty session", async () => {
    expect(await ReviewLogService.recordPoolSession(ALICE, [])).toBe(0);
  });
});

describe("the log and the purge job", () => {
  it("is registered, so a removed language's log is deleted after 30 days", () => {
    expect(getPurgeTargets()).toContainEqual({ database: DATABASE, collection: REVIEW_LOG_COLLECTION, ownerField: "userId" });
  });
});
