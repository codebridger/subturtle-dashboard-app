/**
 * Learners' old Leitner, Pool and board documents (no `language`, from before multilingual)
 * are found on every database (B-10, B-11, B-12).
 *
 * The bug on dev: an English learner with 9 cards saw an empty review. The server looked
 * for the old document with `{ language: { $in: ["en", null] } }`. On MongoDB `null` also
 * matches a missing field, but Firestore with MongoDB compatibility does not promise that,
 * so the old document was missed, login's `ensureInitialized` created an empty `en`
 * document, and every read after that returned the empty one.
 *
 * Every case runs twice against a real in-memory MongoDB:
 * - "mongodb": plain MongoDB;
 * - "strict nulls": each Leitner / Pool / board query is rewritten so `null` matches only a
 *   stored null, never a missing field (the Firestore risk). The old code fails here.
 * As on dev today, there is no unique `(userId, language)` index (the index script runs
 * after the backfill).
 */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { Model, Types } from "mongoose";
import { startMemoryMongo, MemoryMongo } from "../../../test-utils/memory-mongo";

const mockModels: Record<string, any> = {};
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
import { LeitnerService } from "../service";
import { PoolService } from "../../pool/service";
import { BoardService } from "../../board/service";
import { backfillLeitner, backfillPools, physicalName } from "../../../migrations/multilingual";

const leitnerFns = require("../functions").functions as any[];
const boardFns = require("../../board/functions").functions as any[];
const call = (fns: any[], name: string, args: any) => fns.find((f) => f.name === name).callback(args);

const DAY = 24 * 60 * 60 * 1000;

/**
 * Rewrites a filter so `language: null` matches only a stored null, not a missing field,
 * and `language: { $in: [..., null] }` the same. Everything else is left as it is.
 */
function strictNulls(filter: any): any {
  if (Array.isArray(filter)) return filter.map(strictNulls);
  if (!filter || typeof filter !== "object" || filter instanceof Date || filter instanceof Types.ObjectId) return filter;
  const out: any = {};
  const and: any[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "language" && value === null) out[key] = { $type: "null" };
    else if (key === "language" && value && Array.isArray((value as any).$in) && (value as any).$in.includes(null)) {
      and.push({ $or: [{ language: { $in: (value as any).$in.filter((v: any) => v !== null) } }, { language: { $type: "null" } }] });
    } else if (key.startsWith("$")) out[key] = strictNulls(value);
    else out[key] = value;
  }
  if (and.length) out.$and = [...(out.$and || []), ...and];
  return out;
}

const FILTERED = new Set(["find", "findOne", "updateOne", "updateMany", "countDocuments", "deleteOne", "deleteMany"]);

/** The model with every filtered call rewritten by `strictNulls`. */
function withStrictNulls(model: Model<any>): any {
  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && FILTERED.has(prop)) {
        return (filter: any, ...rest: any[]) => (value as any).call(target, strictNulls(filter), ...rest);
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

let db: MemoryMongo;
let Leitner: Model<any>;
let Pools: Model<any>;
let Board: Model<any>;
let Phrases: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  Leitner = db.model(LEITNER_SYSTEM_COLLECTION, require("../db")[0].schema);
  Pools = db.model(POOL_COLLECTION, require("../../pool/db")[0].schema);
  Board = db.model(BOARD_ACTIVITY_COLLECTION, require("../../board/db")[0].schema);
  Phrases = db.model(PHRASE_COLLECTION);
  db.model(PROFILE_COLLECTION);
  db.model(LANGUAGE_PROFILE);
  db.model(BUNDLE_COLLECTION);
}, 120000);

afterAll(async () => {
  await db.stop();
});

describe.each(["mongodb", "strict nulls"])("old documents on %s", (mode) => {
  let USER: string;

  beforeEach(async () => {
    await db.clear();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (LeitnerService as any).syncedUsers.clear();
    USER = new Types.ObjectId().toString();
    const strict = mode === "strict nulls";
    mockModels[LEITNER_SYSTEM_COLLECTION] = strict ? withStrictNulls(Leitner) : Leitner;
    mockModels[POOL_COLLECTION] = strict ? withStrictNulls(Pools) : Pools;
    mockModels[BOARD_ACTIVITY_COLLECTION] = strict ? withStrictNulls(Board) : Board;
  });

  /** Phrases from before multilingual (no language), each due now in box `box`. */
  async function oldCards(count: number, box = 1) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const phrase = await Phrases.create({ refId: USER, phrase: `old ${i}`, translation: `t${i}` });
      items.push({ phraseId: String(phrase._id), boxLevel: box, nextReviewDate: new Date(Date.now() - DAY), lastAttemptDate: new Date(Date.now() - 2 * DAY), consecutiveIncorrect: 0 });
    }
    return items;
  }

  const oldLeitner = (items: any[]) => Leitner.collection.insertOne({ userId: USER, settings: LeitnerService.DEFAULT_SETTINGS, items });
  /** The empty `en` document the bug created at login. */
  const emptyEnLeitner = () => Leitner.collection.insertOne({ userId: USER, language: "en", settings: LeitnerService.DEFAULT_SETTINGS, items: [] });
  const leitnerDocs = () => Leitner.collection.find({ userId: USER }).toArray();

  describe("Leitner", () => {
    it("an old document with cards is found for English, its cards are returned, and it is adopted", async () => {
      const items = await oldCards(9);
      const { insertedId } = await oldLeitner(items);

      const session = await call(leitnerFns, "get-review-session", { userId: USER, language: "en" });
      expect(session).toHaveLength(9);
      const stats = await call(leitnerFns, "get-stats", { userId: USER, language: "en" });
      expect(stats.totalItems).toBe(9);
      expect(stats.distribution).toEqual({ 1: 9 });

      const docs = await leitnerDocs();
      expect(docs).toHaveLength(1); // no empty copy was made
      expect(String(docs[0]._id)).toBe(String(insertedId));
      expect(docs[0].language).toBe("en");
    });

    it("an old document is found without a language in the request (old clients)", async () => {
      await oldLeitner(await oldCards(3));
      expect(await call(leitnerFns, "get-review-session", { userId: USER })).toHaveLength(3);
      expect(await leitnerDocs()).toHaveLength(1);
    });

    it("login on an old account does not create an empty English document", async () => {
      await oldLeitner(await oldCards(2));
      await LeitnerService.ensureInitialized(USER);
      await LeitnerService.ensureInitialized(USER, "en");
      const docs = await leitnerDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].items).toHaveLength(2);
    });

    it("an old document and the empty en copy the bug made are merged into one", async () => {
      const { insertedId } = await oldLeitner(await oldCards(9));
      await emptyEnLeitner();

      const stats = await LeitnerService.getStats(USER, "en");
      expect(stats!.totalItems).toBe(9);
      expect(await LeitnerService.getDueItems(USER, 20, "en")).toHaveLength(9);

      const docs = await leitnerDocs();
      expect(docs).toHaveLength(1);
      expect(String(docs[0]._id)).toBe(String(insertedId)); // the one with the cards stays
      expect(docs[0].language).toBe("en");
    });

    it("cards in both copies are merged, one card per phrase", async () => {
      const [a, b] = await oldCards(2);
      const [c] = await oldCards(1);
      await oldLeitner([a, b]);
      // The en copy got a new card and a newer answer for `a` after the bug.
      await Leitner.collection.insertOne({
        userId: USER,
        language: "en",
        settings: LeitnerService.DEFAULT_SETTINGS,
        items: [{ ...a, boxLevel: 3, lastAttemptDate: new Date() }, c],
      });

      const stats = await LeitnerService.getStats(USER, "en");
      expect(stats!.totalItems).toBe(3);
      const [doc] = await leitnerDocs();
      expect((await leitnerDocs())).toHaveLength(1);
      expect(doc.items.find((i: any) => i.phraseId === a.phraseId).boxLevel).toBe(3); // the latest answer wins
    });

    it("parallel calls on an old account leave one document with every card", async () => {
      await oldLeitner(await oldCards(5));
      await emptyEnLeitner();
      const results = await Promise.all([
        ...Array.from({ length: 6 }, () => call(leitnerFns, "get-review-session", { userId: USER, language: "en" })),
        ...Array.from({ length: 4 }, () => LeitnerService.ensureInitialized(USER)),
      ]);
      for (const session of results.slice(0, 6)) expect(session).toHaveLength(5);
      const docs = await leitnerDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].items).toHaveLength(5);
    });

    it("parallel first calls for a new learner leave one document", async () => {
      await Promise.all(Array.from({ length: 8 }, () => LeitnerService.ensureInitialized(USER, "en")));
      // Any copy left by a race is merged on the next read.
      await LeitnerService.getStats(USER, "en");
      const docs = await leitnerDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].language).toBe("en");
    });

    it("another language never takes the old English document", async () => {
      await oldLeitner(await oldCards(4));
      await LeitnerService.ensureInitialized(USER, "de");
      expect(await LeitnerService.getDueItems(USER, 20, "de")).toEqual([]);
      expect((await LeitnerService.getStats(USER, "en"))!.totalItems).toBe(4);
      expect((await leitnerDocs()).map((d: any) => d.language).sort()).toEqual(["de", "en"]);
    });
  });

  describe("Pool", () => {
    const poolDocs = () => Pools.collection.find({ userId: USER }).toArray();
    const pooled = (phraseId: string, daysAgo = 1) => ({ phraseId, pooled_at: new Date(Date.now() - daysAgo * DAY), encountered: false });

    async function oldPhrases(count: number) {
      const ids: string[] = [];
      for (let i = 0; i < count; i++) ids.push(String((await Phrases.create({ refId: USER, phrase: `p${i}` }))._id));
      return ids;
    }

    it("an old Pool is found for English and adopted", async () => {
      const ids = await oldPhrases(3);
      await Pools.collection.insertOne({ userId: USER, items: ids.map((id) => pooled(id)) });

      expect(await PoolService.getCount(USER, "en")).toBe(3);
      expect(await PoolService.list(USER, "en")).toHaveLength(3);
      const docs = await poolDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].language).toBe("en");
    });

    it("adding to an old account's English Pool uses the old Pool, not a new one", async () => {
      const [a, b] = await oldPhrases(2);
      await Pools.collection.insertOne({ userId: USER, items: [pooled(a)] });
      await PoolService.add(USER, b, "en");
      const docs = await poolDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].items.map((i: any) => i.phraseId).sort()).toEqual([a, b].sort());
    });

    it("an old Pool and an empty en copy are merged into one", async () => {
      const ids = await oldPhrases(2);
      const { insertedId } = await Pools.collection.insertOne({ userId: USER, items: ids.map((id) => pooled(id)) });
      await Pools.collection.insertOne({ userId: USER, language: "en", items: [] });

      expect(await PoolService.getCount(USER, "en")).toBe(2);
      const docs = await poolDocs();
      expect(docs).toHaveLength(1);
      expect(String(docs[0]._id)).toBe(String(insertedId));
    });

    it("removing with a language takes the phrase out of every English copy", async () => {
      const [a] = await oldPhrases(1);
      await Pools.collection.insertOne({ userId: USER, items: [pooled(a)] });
      await PoolService.remove(USER, a, "en");
      expect(await PoolService.getCount(USER, "en")).toBe(0);
    });

    it("parallel adds on an old account leave one Pool with every phrase", async () => {
      const ids = await oldPhrases(6);
      await Pools.collection.insertOne({ userId: USER, items: [pooled(ids[0])] });
      await Promise.all(ids.slice(1).map((id) => PoolService.add(USER, id, "en")));
      const docs = await poolDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].items).toHaveLength(6);
    });

    it("parallel adds for a new learner leave one Pool", async () => {
      const ids = await oldPhrases(6);
      await Promise.all(ids.map((id) => PoolService.add(USER, id, "en")));
      await PoolService.getCount(USER, "en"); // merges a copy a race left
      const docs = await poolDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].items).toHaveLength(6);
    });
  });

  describe("board", () => {
    const boardRows = () => Board.collection.find({ userId: USER }).toArray();

    it("an old review row is shown for English and refreshed in place", async () => {
      await Board.collection.insertOne({ userId: USER, type: "leitner_review", toastType: "singleton", state: "toasted", persistent: true, meta: { dueCount: 9, isActive: true }, lastUpdated: new Date(Date.now() - DAY) });

      const board = await call(boardFns, "get-board", { userId: USER, language: "en" });
      expect(board.activities.map((a: any) => a.meta.dueCount)).toEqual([9]);

      await BoardService.refreshActivity(USER, "leitner_review", { dueCount: 8, isActive: true }, false, "singleton", undefined, true, "en");
      const rows = await boardRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ language: "en", meta: { dueCount: 8 } });
    });

    it("an old row and an en copy show once and are merged on the next refresh", async () => {
      await Board.collection.insertOne({ userId: USER, type: "leitner_review", toastType: "singleton", state: "toasted", persistent: true, meta: { dueCount: 9, isActive: true }, lastUpdated: new Date(Date.now() - DAY) });
      await Board.collection.insertOne({ userId: USER, language: "en", type: "leitner_review", toastType: "singleton", state: "toasted", persistent: true, meta: { dueCount: 0, isActive: true }, lastUpdated: new Date() });

      const board = await call(boardFns, "get-board", { userId: USER, language: "en" });
      expect(board.activities).toHaveLength(1);

      await BoardService.refreshActivity(USER, "leitner_review", { dueCount: 9, isActive: true }, false, "singleton", undefined, true, "en");
      const rows = await boardRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ language: "en", meta: { dueCount: 9 } });
    });

    it("consume sets every English copy idle", async () => {
      await Board.collection.insertOne({ userId: USER, type: "leitner_review", toastType: "singleton", state: "toasted", persistent: false, meta: {} });
      await Board.collection.insertOne({ userId: USER, language: "en", type: "leitner_review", toastType: "singleton", state: "toasted", persistent: false, meta: {} });
      await call(boardFns, "consume-activity", { userId: USER, type: "leitner_review", language: "en" });
      expect((await boardRows()).map((r: any) => r.state)).toEqual(["idle", "idle"]);
    });

    it("refreshing a singleton never folds in or deletes rows of other refIds", async () => {
      await Board.collection.insertOne({ userId: USER, type: "x", toastType: "unique", refId: "a", state: "toasted", persistent: false, meta: { n: 0 } });
      await Board.collection.insertOne({ userId: USER, type: "x", toastType: "unique", refId: "b", state: "toasted", persistent: false, meta: { n: 0 } });
      await BoardService.refreshActivity(USER, "x", { n: 1 }, true, "singleton", undefined, false, "en");
      const rows = await boardRows();
      expect(rows.filter((r: any) => r.refId).map((r: any) => [r.refId, r.meta.n]).sort()).toEqual([["a", 0], ["b", 0]]);
    });

    it("parallel refreshes on an old account leave one row", async () => {
      await Board.collection.insertOne({ userId: USER, type: "leitner_review", toastType: "singleton", state: "idle", persistent: true, meta: { dueCount: 1 } });
      await Promise.all(Array.from({ length: 6 }, (_, i) =>
        BoardService.refreshActivity(USER, "leitner_review", { dueCount: i, isActive: true }, true, "singleton", undefined, true, "en")
      ));
      expect(await boardRows()).toHaveLength(1);
    });
  });
});

describe("migration (yarn migrate:multilingual) merges the bug's leftovers", () => {
  const USER = new Types.ObjectId().toString();
  const raw = (name: string) => db.connection.db!.collection(physicalName(name));
  const quiet = { log: () => undefined, apply: true };

  beforeEach(async () => {
    await raw(LEITNER_SYSTEM_COLLECTION).deleteMany({});
    await raw(POOL_COLLECTION).deleteMany({});
  });

  it("an old Leitner document and an empty en copy become one en document with the cards", async () => {
    const card = { phraseId: "p1", boxLevel: 2, nextReviewDate: new Date(), lastAttemptDate: new Date() };
    const { insertedId } = await raw(LEITNER_SYSTEM_COLLECTION).insertOne({ userId: USER, settings: {}, items: [card] });
    await raw(LEITNER_SYSTEM_COLLECTION).insertOne({ userId: USER, language: "en", settings: {}, items: [] });

    await backfillLeitner(db.connection.db, quiet);
    const docs = await raw(LEITNER_SYSTEM_COLLECTION).find({ userId: USER }).toArray();
    expect(docs).toHaveLength(1);
    expect(String(docs[0]._id)).toBe(String(insertedId));
    expect(docs[0]).toMatchObject({ language: "en", items: [expect.objectContaining({ phraseId: "p1" })] });
  });

  it("an old Pool and an empty en copy become one en Pool", async () => {
    await raw(POOL_COLLECTION).insertOne({ userId: USER, items: [{ phraseId: "p1", pooled_at: new Date() }] });
    await raw(POOL_COLLECTION).insertOne({ userId: USER, language: "en", items: [] });

    await backfillPools(db.connection.db, quiet);
    const docs = await raw(POOL_COLLECTION).find({ userId: USER }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ language: "en", items: [expect.objectContaining({ phraseId: "p1" })] });
  });
});
