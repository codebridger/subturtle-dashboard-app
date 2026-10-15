/**
 * Global counters stay global (work list B-24): the Starter save count and the voice
 * minutes belong to the account, not to a language. Saving in English and German draws on
 * one save count and hits one cap; voice sessions in two languages draw on one budget.
 * Runs the real subscription service on an in-memory MongoDB.
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
// A Starter cap of 3 saves; everything else in enforcement is real.
jest.mock("../enforcement", () => ({
  ...(jest.requireActual("../enforcement") as object),
  getEffectiveCap: jest.fn(async (_userId: string, feature: string) => (feature === "save_words" ? 3 : null)),
}));
jest.mock("../../../utils/analytics", () => ({ trackServerEvent: jest.fn(), SERVER_ANALYTICS_EVENTS: {} }));
jest.mock("../../phrase_bundle/triggers", () => ({ phraseBundleTriggers: [] }));
jest.mock("../../live_session/openai/functions", () => ({ requestEphemeralToken: {} }));
jest.mock("../../live_session/gemini/functions", () => ({ requestGeminiEphemeralToken: {} }));

import { FREE_CREDIT_COLLECTION, PHRASE_COLLECTION, BUNDLE_COLLECTION, PROFILE_COLLECTION, SUBSCRIPTION_COLLECTION, FREEMIUM_DEFAULT_VOICE_MINUTES } from "../../../config";
import { getVoiceBudget } from "../service";
import { EntitlementLimitError } from "../enforcement";

const subscriptionDefinitions = require("../db") as any[];
const createPhrase = (require("../../phrase_bundle/functions").functions as any[]).find((f) => f.name === "createPhrase").callback;
const removePhrase = (require("../../phrase_bundle/functions").functions as any[]).find((f) => f.name === "removePhrase").callback;
const debit = (require("../../live_session/functions").functions as any[]).find((f) => f.name === "debit-voice-minutes").callback;

const ALICE = new Types.ObjectId().toString();
let db: MemoryMongo;
let FreeCredits: Model<any>;
let Bundles: Model<any>;

beforeAll(async () => {
  db = await startMemoryMongo(mockModels);
  const schemaOf = (name: string) => subscriptionDefinitions.find((d) => d.collection === name).schema;
  FreeCredits = db.model(FREE_CREDIT_COLLECTION, schemaOf(FREE_CREDIT_COLLECTION));
  db.model(SUBSCRIPTION_COLLECTION, schemaOf(SUBSCRIPTION_COLLECTION));
  db.model(PHRASE_COLLECTION);
  Bundles = db.model(BUNDLE_COLLECTION);
  db.model(PROFILE_COLLECTION).create({ refId: ALICE, learningLanguage: "de", learningLanguages: ["en", "de"] });
}, 120000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await Promise.all([FreeCredits.deleteMany({}), mockModels[PHRASE_COLLECTION].deleteMany({}), Bundles.deleteMany({})]);
});

const used = async () => ((await FreeCredits.findOne({ user_id: new Types.ObjectId(ALICE) }).lean()) as any)?.allowed_save_words_used ?? 0;

describe("the Starter save count is per account", () => {
  it("saves in two languages count once each on one counter, and share one cap", async () => {
    const save = (phrase: string, language: string) => createPhrase({ refId: ALICE, phrase, translation: "t", bundleIds: [], language });
    await save("give up", "en");
    await save("aufgeben", "de");
    await save("Kind", "de");
    expect(await used()).toBe(3);
    expect(await FreeCredits.countDocuments({})).toBe(1);
    // The cap of 3 is reached across languages: a fourth save in either language is refused.
    await expect(save("hold on", "en")).rejects.toBeInstanceOf(EntitlementLimitError);
    await expect(save("warten", "de")).rejects.toBeInstanceOf(EntitlementLimitError);
  });

  it("removing a phrase in one language frees a save for any language", async () => {
    const bundleId = String((await Bundles.create({ refId: ALICE, title: "b", language: "de", phrases: [] }))._id);
    const de = await createPhrase({ refId: ALICE, phrase: "Kind", translation: "t", bundleIds: [bundleId], language: "de" });
    expect(await used()).toBe(1);
    await removePhrase({ refId: ALICE, phraseId: String(de._id), bundleId });
    expect(await used()).toBe(0);
  });
});

describe("voice minutes are per account", () => {
  it("sessions in two languages draw on one budget", async () => {
    await debit({ userId: ALICE, seconds: 60, language: "de" });
    const after = await debit({ userId: ALICE, seconds: 61, language: "en" });
    expect(after.used).toBe(3); // 1 + 2 minutes (rounded up)
    expect(after.total).toBe(FREEMIUM_DEFAULT_VOICE_MINUTES);
    expect((await getVoiceBudget(ALICE)).remaining).toBe(FREEMIUM_DEFAULT_VOICE_MINUTES - 3);
    expect(await FreeCredits.countDocuments({})).toBe(1);
  });
});
