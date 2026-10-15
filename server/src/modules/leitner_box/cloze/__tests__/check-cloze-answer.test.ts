/**
 * B-18: `check-cloze-answer` on a real in-memory MongoDB with the real phrase schema, so
 * the cue fields are really stored and read back, and one user cannot check another's phrase.
 */
import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";
import mongoose, { Connection, Model } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const mockModels: Record<string, Model<any>> = {};
jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  defineFunction: (opts: any) => opts,
  getCollection: jest.fn((_db: string, name: string) => mockModels[name]),
}));
jest.mock("../../../phrase_bundle/triggers", () => ({ phraseBundleTriggers: [] }));

import { PHRASE_COLLECTION } from "../../../../config";

const { functions } = require("../functions") as { functions: any[] };
const check = functions.find((f) => f.name === "check-cloze-answer").callback;
const phraseDefinition = require("../../../phrase_bundle/db").find((d: any) => d.collection === PHRASE_COLLECTION);

const ALICE = new mongoose.Types.ObjectId().toString();
const BOB = new mongoose.Types.ObjectId().toString();

let mongo: MongoMemoryServer;
let connection: Connection;
let Phrases: Model<any>;
let germanId: string;
let oldId: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  Phrases = connection.model(PHRASE_COLLECTION, phraseDefinition.schema);
  mockModels[PHRASE_COLLECTION] = Phrases;
  const german = await Phrases.create({
    refId: ALICE,
    type: "linguistic",
    phrase: "Ich warte auf den Bus",
    translation: "...",
    language: "de",
    chunks: [{ text: "warte auf", type: "verb_preposition", confidence: 0.9, lemma: "warten auf", form: "present, 1st person singular", acceptedAnswers: ["warte auf"] }],
  });
  germanId = String(german._id);
  const old = await Phrases.create({ refId: ALICE, phrase: "I had to give up", translation: "...", chunks: [{ text: "give up", type: "phrasal_verb", confidence: 0.8 }] });
  oldId = String(old._id);
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

describe("check-cloze-answer", () => {
  it("stores the cue fields on the phrase", async () => {
    const doc = await Phrases.findById(germanId).lean<any>();
    expect(doc.chunks[0]).toEqual(expect.objectContaining({ lemma: "warten auf", form: "present, 1st person singular", acceptedAnswers: ["warte auf"] }));
  });

  it("right, close, wrong for a German phrase", async () => {
    expect(await check({ userId: ALICE, phraseId: germanId, answer: "Warte auf" })).toEqual({ result: "right", expected: "warte auf", reason: "exact" });
    expect((await check({ userId: ALICE, phraseId: germanId, answer: "warten auf" })).result).toBe("close");
    expect((await check({ userId: ALICE, phraseId: germanId, answer: "wartet auf" })).result).toBe("close");
    expect((await check({ userId: ALICE, phraseId: germanId, answer: "gehe zu" })).result).toBe("wrong");
  });

  it("an old English phrase with no cue fields still works", async () => {
    expect((await check({ userId: ALICE, phraseId: oldId, answer: "give up" })).result).toBe("right");
    expect((await check({ userId: ALICE, phraseId: oldId, answer: "gave in" })).result).toBe("wrong");
  });

  it("another user's phrase reads as not found", async () => {
    await expect(check({ userId: BOB, phraseId: germanId, answer: "warte auf" })).rejects.toThrow(/not found/);
  });

  it("refuses bad input", async () => {
    await expect(check({ phraseId: germanId, answer: "x" })).rejects.toThrow(/userId/);
    await expect(check({ userId: ALICE, phraseId: "nope", answer: "x" })).rejects.toThrow(/not found/);
    await expect(check({ userId: ALICE, phraseId: germanId })).rejects.toThrow(/answer/);
  });
});
