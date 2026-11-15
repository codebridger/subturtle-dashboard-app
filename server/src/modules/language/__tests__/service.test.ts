/**
 * The language module against a real in-memory MongoDB, with the real profile, language
 * profile, phrase and bundle schemas, so the plan-limit conditional update, the status
 * claims and the unique indexes are the real thing. Leitner settings, the Pool and the
 * free-tier counter are mocked.
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

const mockIsFreemium = jest.fn<(...args: any[]) => Promise<boolean>>();
const mockUpdateFreemium = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../subscription/service", () => ({
  isUserOnFreemium: (...args: any[]) => mockIsFreemium(...args),
  updateFreemiumAllocation: (...args: any[]) => mockUpdateFreemium(...args),
}));

const mockPoolAdd = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../pool/service", () => ({ PoolService: { add: (...args: any[]) => mockPoolAdd(...args) } }));
const mockDueCount = jest.fn<(...args: any[]) => Promise<number>>();
const mockEnsureInitialized = jest.fn<(...args: any[]) => Promise<string>>();
jest.mock("../../leitner_box/service", () => ({
  LeitnerService: {
    getSettings: async () => ({ autoEntry: true }),
    ensureInitialized: (...args: any[]) => mockEnsureInitialized(...args),
    getDueCount: (...args: any[]) => mockDueCount(...args),
    resyncSchedule: async () => undefined,
  },
}));

jest.mock("mixpanel", () => require("../../../utils/test-support/mixpanel-capture").mixpanelMock);

import { anonymousAuthStub, failMixpanel, flushEvents, resetMixpanel, sent, sentNamed } from "../../../utils/test-support/mixpanel-capture";
import {
  BUNDLE_COLLECTION,
  FREE_CREDIT_COLLECTION,
  LANGUAGE_INTEREST_COLLECTION,
  LANGUAGE_PROFILE_COLLECTION,
  PHRASE_COLLECTION,
  PROFILE_COLLECTION,
  SUBSCRIPTION_COLLECTION,
} from "../../../config";
import { LanguageService, onLanguageAdded, REMOVE_GRACE_DAYS } from "../service";
import { parseTierMetadata } from "../../subscription/entitlements";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;

let mongo: MongoMemoryServer;
let connection: Connection;
let Profiles: Model<any>;
let LanguageProfiles: Model<any>;
let Interests: Model<any>;
let Phrases: Model<any>;
let Bundles: Model<any>;
let Subscriptions: Model<any>;

const newId = () => new mongoose.Types.ObjectId().toString();
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  const [languageProfile, languageInterest] = require("../db");
  const [phrase, bundle] = require("../../phrase_bundle/db");
  Profiles = connection.model(PROFILE_COLLECTION, require("../../profile/db")[0].schema);
  LanguageProfiles = connection.model(LANGUAGE_PROFILE_COLLECTION, languageProfile.schema);
  Interests = connection.model(LANGUAGE_INTEREST_COLLECTION, languageInterest.schema);
  Phrases = connection.model(PHRASE_COLLECTION, phrase.schema);
  Bundles = connection.model(BUNDLE_COLLECTION, bundle.schema);
  Subscriptions = connection.model(SUBSCRIPTION_COLLECTION, new Schema({}, { strict: false }));
  const FreeCredits = connection.model(FREE_CREDIT_COLLECTION, new Schema({}, { strict: false }));
  Object.assign(mockModels, {
    [PROFILE_COLLECTION]: Profiles,
    [LANGUAGE_PROFILE_COLLECTION]: LanguageProfiles,
    [LANGUAGE_INTEREST_COLLECTION]: Interests,
    [PHRASE_COLLECTION]: Phrases,
    [BUNDLE_COLLECTION]: Bundles,
    [SUBSCRIPTION_COLLECTION]: Subscriptions,
    [FREE_CREDIT_COLLECTION]: FreeCredits,
    auth: anonymousAuthStub as any,
  });
  await Promise.all([LanguageProfiles.init(), Interests.init(), Bundles.init()]);
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mockModels).map((model) => model.deleteMany?.({})));
  jest.clearAllMocks();
  resetMixpanel();
  mockIsFreemium.mockResolvedValue(true);
  mockUpdateFreemium.mockResolvedValue(undefined);
  mockPoolAdd.mockResolvedValue(undefined);
  mockDueCount.mockResolvedValue(0);
  mockEnsureInitialized.mockResolvedValue("en");
  delete process.env.LANGUAGES_ENABLED;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

/** A new account: the sign-up trigger marks it `needs_language`. */
async function newAccount(): Promise<string> {
  const userId = newId();
  await Profiles.create({ refId: userId, name: "New", onboardingState: "needs_language" });
  return userId;
}

/** An account from before multilingual: no language fields at all. */
async function legacyAccount(own = "Persian"): Promise<string> {
  const userId = newId();
  await Profiles.create({ refId: userId, name: "Old" });
  await Phrases.create([
    { refId: userId, phrase: "Likewise", translation: "x", translation_language: own },
    { refId: userId, phrase: "Eventually", translation: "y", translation_language: own },
  ]);
  return userId;
}

async function subscribe(userId: string, tier: string, maxLearningLanguages?: number) {
  await Subscriptions.create({
    user_id: new mongoose.Types.ObjectId(userId),
    status: "active",
    end_date: new Date(Date.now() + 30 * DAY),
    tier,
    entitlements: { tierId: tier, ...(maxLearningLanguages ? { maxLearningLanguages } : {}) },
  });
}

async function expectError(promise: Promise<unknown>, code: string, details?: Record<string, unknown>) {
  const error: any = await promise.then(
    () => null,
    (e) => e
  );
  expect(error).not.toBeNull();
  expect(error.message.startsWith(code)).toBe(true);
  if (details) expect(JSON.parse(error.message.slice(code.length + 1))).toEqual(details);
}

describe("old clients and accounts from before multilingual", () => {
  it("an existing account studies English, onboarding done, own language guessed once", async () => {
    const userId = await legacyAccount("Persian");
    const state = await LanguageService.getState(userId);

    expect(state).toMatchObject({
      learningLanguage: "en",
      translationLanguage: "fa",
      onboardingState: "done",
      plan: "starter",
      maxLanguages: 1,
      pending: [],
    });
    expect(state.languages).toHaveLength(1);
    expect(state.languages[0]).toMatchObject({ code: "en", status: "active", startLevel: "A1", phraseCount: 2, explanationLanguage: "fa" });

    await LanguageService.getState(userId);
    expect(await LanguageProfiles.countDocuments({ userId })).toBe(1);
    const profile = await Profiles.findOne({ refId: userId }).lean<any>();
    expect(profile.learningLanguages).toEqual(["en"]);
    expect(profile.name).toBe("Old");
  });

  it("reports each language's due cards from its Leitner document", async () => {
    const userId = await legacyAccount();
    mockDueCount.mockImplementation(async (_user: any, language: any) => (language === "en" ? 4 : 0));
    const state = await LanguageService.getState(userId);
    expect(state.languages[0].dueCount).toBe(4);
    expect(mockDueCount).toHaveBeenCalledWith(userId, "en");
  });

  it("a profile that never existed is treated as an existing English learner", async () => {
    const userId = newId();
    const state = await LanguageService.getState(userId);
    expect(state.learningLanguage).toBe("en");
    expect(await Profiles.countDocuments({ refId: userId })).toBe(1);
  });
});

describe("first run (B-07)", () => {
  it("a new account has no language until it adds one", async () => {
    const userId = await newAccount();
    const state = await LanguageService.getState(userId);
    expect(state).toMatchObject({ learningLanguage: null, languages: [], onboardingState: "needs_language" });
  });

  it("adding a language finishes first run, makes it active and offers its starter pack at A1", async () => {
    const userId = await newAccount();
    await LanguageService.setTranslationLanguage(userId, "Persian");
    const { state } = await LanguageService.addLanguage(userId, { language: "German", goals: ["Travel"] });

    expect(state).toMatchObject({ learningLanguage: "de", onboardingState: "done", translationLanguage: "fa" });
    expect(mockEnsureInitialized).toHaveBeenCalledWith(userId, "de");
    expect(state.languages[0]).toMatchObject({
      code: "de",
      status: "active",
      startLevel: "A1",
      startLevelSource: "default",
      explanationLanguage: "fa",
      starterPack: { state: "offered", heard: 0, total: 0 },
    });
  });

  it("a test result above A1 gets no starter pack offer", async () => {
    const userId = await newAccount();
    const { state } = await LanguageService.addLanguage(userId, { language: "de", startLevel: "B1", startLevelSource: "test" });
    expect(state.languages[0]).toMatchObject({ startLevel: "B1", startLevelSource: "test", starterPack: { state: "none" } });
  });

  it("runs the onLanguageAdded hooks", async () => {
    const seen: any[] = [];
    onLanguageAdded((event) => {
      seen.push({ language: event.language, restored: event.restored });
    });
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "es" });
    expect(seen).toContainEqual({ language: "es", restored: false });
  });
});

describe("add-language checks", () => {
  it("refuses a language not in the register, or switched off", async () => {
    const userId = await newAccount();
    await expectError(LanguageService.addLanguage(userId, { language: "ja" }), "not_available", { language: "ja" });
    process.env.LANGUAGES_ENABLED = "de";
    await expectError(LanguageService.addLanguage(userId, { language: "fr" }), "not_available");
  });

  it("refuses Portuguese (coming later), even when LANGUAGES_ENABLED names it", async () => {
    const userId = await newAccount();
    await expectError(LanguageService.addLanguage(userId, { language: "Portuguese" }), "not_available", { language: "pt" });
    process.env.LANGUAGES_ENABLED = "pt,de";
    await expectError(LanguageService.addLanguage(userId, { language: "pt" }), "not_available", { language: "pt" });
    expect(await LanguageProfiles.countDocuments({ userId })).toBe(0);
    expect((await Profiles.findOne({ refId: userId }).lean<any>()).learningLanguages ?? []).toEqual([]);
  });

  it("refuses a bad level, source or goals", async () => {
    const userId = await newAccount();
    await expectError(LanguageService.addLanguage(userId, { language: "de", startLevel: "C2" }), "invalid_argument");
    await expectError(LanguageService.addLanguage(userId, { language: "de", startLevelSource: "guess" }), "invalid_argument");
    await expectError(LanguageService.addLanguage(userId, { language: "de", goals: "travel" }), "invalid_argument");
  });

  it("adding an active language again just makes it active", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    await LanguageService.addLanguage(userId, { language: "de" });
    await LanguageService.addLanguage(userId, { language: "fr" });
    const { state } = await LanguageService.addLanguage(userId, { language: "de" });
    expect(state.learningLanguage).toBe("de");
    expect(state.languages).toHaveLength(2);
  });
});

describe("plan limit (B-33)", () => {
  it("Starter studies one language; a second returns upgrade_needed", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    await expectError(LanguageService.addLanguage(userId, { language: "fr" }), "upgrade_needed", { plan: "starter", maxLanguages: 1 });
  });

  it("an existing English learner on Starter cannot swap", async () => {
    const userId = await legacyAccount();
    await expectError(LanguageService.addLanguage(userId, { language: "de" }), "upgrade_needed", { plan: "starter", maxLanguages: 1 });
  });

  it("Starter cannot swap: a removed language holds its slot, but adding it back restores it", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    await Phrases.create({ refId: userId, phrase: "Kind", translation: "child", language: "de" });
    await LanguageService.removeLanguage(userId, "de");

    await expectError(LanguageService.addLanguage(userId, { language: "es" }), "upgrade_needed", { plan: "starter", maxLanguages: 1 });
    expect(await LanguageProfiles.countDocuments({ userId, language: "es" })).toBe(0);
    expect((await Profiles.findOne({ refId: userId }).lean<any>()).learningLanguages).toEqual([]);

    const { state } = await LanguageService.addLanguage(userId, { language: "de" });
    expect(state).toMatchObject({ learningLanguage: "de", onboardingState: "done" });
    expect(state.languages).toHaveLength(1);
    expect(state.languages[0]).toMatchObject({ code: "de", status: "active", phraseCount: 1 });
  });

  it("an existing English learner on Starter cannot swap by removing English first", async () => {
    const userId = await legacyAccount();
    await LanguageService.getState(userId);
    await LanguageService.removeLanguage(userId, "en");
    await expectError(LanguageService.addLanguage(userId, { language: "de" }), "upgrade_needed", { plan: "starter", maxLanguages: 1 });
    expect((await LanguageService.addLanguage(userId, { language: "en" })).state.learningLanguage).toBe("en");
  });

  it("on Starter a removed language stops holding its slot after its 30 days", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    await LanguageService.removeLanguage(userId, "de");
    await LanguageProfiles.updateOne({ userId, language: "de" }, { $set: { purgeAt: new Date(Date.now() - DAY) } });
    expect((await LanguageService.addLanguage(userId, { language: "es" })).state.learningLanguage).toBe("es");
  });

  it("on Starter a remove racing an add of another language never lets the new one in", async () => {
    for (let round = 0; round < 5; round++) {
      const userId = await newAccount();
      await LanguageService.addLanguage(userId, { language: "de" });
      const [removed, added] = await Promise.allSettled([
        LanguageService.removeLanguage(userId, "de"),
        LanguageService.addLanguage(userId, { language: "es" }),
      ]);
      expect(removed.status).toBe("fulfilled");
      expect(added.status).toBe("rejected");
      expect((added as PromiseRejectedResult).reason.message).toMatch(/^upgrade_needed/);
      expect(await LanguageProfiles.countDocuments({ userId, language: "es", status: "active" })).toBe(0);
      expect((await LanguageService.getState(userId)).languages.filter((l) => l.status === "active")).toEqual([]);
    }
  });

  it("paid plans keep today's behaviour: a removed language frees its slot", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    for (const language of ["de", "fr", "es"]) await LanguageService.addLanguage(userId, { language });
    await LanguageService.removeLanguage(userId, "fr");
    const { state } = await LanguageService.addLanguage(userId, { language: "it" });
    expect(state.languages.filter((l) => l.status === "active").map((l) => l.code).sort()).toEqual(["de", "es", "it"]);
  });

  it("reads the limit from the subscription snapshot, else the tier's number", async () => {
    const reader = await newAccount();
    await subscribe(reader, "reader");
    expect((await LanguageService.getState(reader)).maxLanguages).toBe(3);

    const coach = await newAccount();
    await subscribe(coach, "coach");
    expect((await LanguageService.getState(coach)).maxLanguages).toBe(10);

    const custom = await newAccount();
    await subscribe(custom, "learner", 5);
    expect(await LanguageService.getState(custom)).toMatchObject({ plan: "learner", maxLanguages: 5 });
  });

  it("parallel adds at the limit: exactly one wins (Starter)", async () => {
    const userId = await newAccount();
    const results = await Promise.allSettled(["de", "fr", "es", "it", "sv", "lt"].map((language) => LanguageService.addLanguage(userId, { language })));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]) {
      expect(r.reason.message).toMatch(/^upgrade_needed/);
    }
    expect(await LanguageProfiles.countDocuments({ userId, status: "active" })).toBe(1);
    const state = await LanguageService.getState(userId);
    expect(state.languages.filter((l) => l.status === "active")).toHaveLength(1);
    expect((await Profiles.findOne({ refId: userId }).lean<any>()).learningLanguages).toHaveLength(1);
  });

  it("parallel adds at the limit: exactly three win (Reader)", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    const results = await Promise.allSettled(["en", "de", "fr", "es", "it", "sv", "lt"].map((language) => LanguageService.addLanguage(userId, { language })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const state = await LanguageService.getState(userId);
    expect(state.languages.filter((l) => l.status === "active")).toHaveLength(3);
  });

  it("a downgrade pauses the extras, keeping the active language; an upgrade brings them back", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    for (const language of ["de", "fr", "es"]) await LanguageService.addLanguage(userId, { language });
    await LanguageService.setActiveLanguage(userId, "fr");

    await Subscriptions.deleteMany({});
    let state = await LanguageService.getState(userId);
    expect(state.plan).toBe("starter");
    expect(state.learningLanguage).toBe("fr");
    expect(state.languages.filter((l) => l.status === "active").map((l) => l.code)).toEqual(["fr"]);
    expect(state.languages.filter((l) => l.status === "paused")).toHaveLength(2);
    expect((await Profiles.findOne({ refId: userId }).lean<any>()).pausedLanguages.sort()).toEqual(["de", "es"]);

    // The learner picks German instead.
    ({ state } = await LanguageService.pauseLanguages(userId, ["de"]));
    expect(state.learningLanguage).toBe("de");
    expect(state.languages.find((l) => l.code === "de")!.status).toBe("active");
    expect(state.languages.find((l) => l.code === "fr")!.status).toBe("paused");

    // A paused language cannot be made active, and adding it back needs room.
    await expectError(LanguageService.setActiveLanguage(userId, "fr"), "not_active");
    await expectError(LanguageService.addLanguage(userId, { language: "fr" }), "upgrade_needed");

    await subscribe(userId, "reader");
    state = await LanguageService.getState(userId);
    expect(state.languages.every((l) => l.status === "active")).toBe(true);
    expect(state.learningLanguage).toBe("de");
  });

  it("pause-languages keeps `keep` first, fills spare room, pauses the rest, leaves removed ones alone", async () => {
    const userId = await newAccount();
    await subscribe(userId, "coach");
    for (const language of ["de", "fr", "es", "it", "sv"]) await LanguageService.addLanguage(userId, { language });
    await LanguageService.removeLanguage(userId, "sv");
    await LanguageService.setActiveLanguage(userId, "it");

    // Down to Reader (3): the active language, then the oldest.
    await Subscriptions.deleteMany({});
    await subscribe(userId, "reader");
    let state = await LanguageService.getState(userId);
    const statusOf = (s: typeof state) => Object.fromEntries(s.languages.map((l) => [l.code, l.status]));
    expect(statusOf(state)).toEqual({ de: "active", fr: "active", es: "paused", it: "active", sv: "removed" });

    // keep shorter than the limit: kept first, then the active language, then the oldest.
    ({ state } = await LanguageService.pauseLanguages(userId, ["es"]));
    expect(statusOf(state)).toEqual({ de: "active", fr: "paused", es: "active", it: "active", sv: "removed" });
    expect(state.learningLanguage).toBe("es"); // the active language (it) was not in keep

    // keep in order with the active language in it: fr, de, then the oldest other active (es).
    await LanguageService.setActiveLanguage(userId, "de");
    ({ state } = await LanguageService.pauseLanguages(userId, ["fr", "de"]));
    expect(statusOf(state)).toEqual({ de: "active", fr: "active", es: "active", it: "paused", sv: "removed" });
    expect(state.learningLanguage).toBe("de");
    expect((await Profiles.findOne({ refId: userId }).lean<any>()).pausedLanguages).toEqual(["it"]);
  });

  it("pause-languages refuses more than the plan allows, or a language the learner lacks", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    await expectError(LanguageService.pauseLanguages(userId, ["de", "fr"]), "upgrade_needed");
    await expectError(LanguageService.pauseLanguages(userId, ["fr"]), "not_found");
    await expectError(LanguageService.pauseLanguages(userId, []), "invalid_argument");
  });

  it("parses max_learning_languages from the Stripe metadata, optional for old products", () => {
    const metadata: Record<string, string> = {
      schema_version: "1",
      tier_id: "reader",
      tier_rank: "1",
      status: "live",
      credits_granted: "5000000",
      voice_minutes_granted: "0",
      save_words_cap: "unlimited",
      text_chat_cap: "10",
      live_sessions_cap: "0",
      weekly_insights: "false",
      session_history: "false",
      duration_days: "30",
      trial_days: "0",
    };
    expect(parseTierMetadata({ id: "p", metadata }).maxLearningLanguages).toBeNull();
    expect(parseTierMetadata({ id: "p", metadata: { ...metadata, max_learning_languages: "3" } }).maxLearningLanguages).toBe(3);
    expect(() => parseTierMetadata({ id: "p", metadata: { ...metadata, max_learning_languages: "0" } })).toThrow();
  });
});

describe("remove, restore and set active (B-05)", () => {
  it("remove hides a language for 30 days and makes the next one active", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    await LanguageService.addLanguage(userId, { language: "de" });
    await LanguageService.addLanguage(userId, { language: "fr" });

    const before = Date.now();
    const { state, purgeAt } = await LanguageService.removeLanguage(userId, "fr");
    const purgeMs = new Date(purgeAt).getTime();
    expect(purgeMs).toBeGreaterThanOrEqual(before + REMOVE_GRACE_DAYS * DAY);
    expect(purgeMs).toBeLessThan(before + REMOVE_GRACE_DAYS * DAY + 60_000);

    expect(state.learningLanguage).toBe("de");
    expect(state.languages.find((l) => l.code === "fr")).toMatchObject({ status: "removed", purgeAt });
    expect((await Profiles.findOne({ refId: userId }).lean<any>()).learningLanguages).toEqual(["de"]);

    // Removing it again is harmless and keeps the date.
    expect((await LanguageService.removeLanguage(userId, "fr")).purgeAt).toBe(purgeAt);
  });

  it("removing the last language sends the learner back to first run", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    const { state } = await LanguageService.removeLanguage(userId, "de");
    expect(state).toMatchObject({ learningLanguage: null, onboardingState: "needs_language" });
  });

  it("re-adding within 30 days restores the language with its level, settings and data", async () => {
    const userId = await newAccount();
    const { state: added } = await LanguageService.addLanguage(userId, { language: "de", startLevel: "A2", startLevelSource: "test" });
    expect(added.learningLanguage).toBe("de");
    await LanguageService.updateLanguageSettings(userId, { language: "de", newPhrasesPerDay: 7 });
    await Phrases.create({ refId: userId, phrase: "Kind", translation: "child", language: "de" });

    await LanguageService.removeLanguage(userId, "de");
    const seen: boolean[] = [];
    onLanguageAdded((event) => {
      if (event.userId === userId) seen.push(event.restored);
    });
    const { state } = await LanguageService.addLanguage(userId, { language: "de" });

    expect(state.languages[0]).toMatchObject({ code: "de", status: "active", startLevel: "A2", startLevelSource: "test", phraseCount: 1 });
    expect(state.languages[0].purgeAt).toBeUndefined();
    const lp = await LanguageProfiles.findOne({ userId, language: "de" }).lean<any>();
    expect(lp.newPhrasesPerDay).toBe(7);
    expect(lp.removedAt).toBeUndefined();
    expect(seen).toEqual([true]);
  });

  it("a language being purged cannot be added back", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    await LanguageService.removeLanguage(userId, "de");
    await LanguageProfiles.updateOne({ userId, language: "de" }, { $set: { status: "purging" } });
    await expectError(LanguageService.addLanguage(userId, { language: "de" }), "purging", { language: "de" });
    expect((await LanguageService.getState(userId)).languages).toEqual([]);
  });

  it("set-active-language needs an active language", async () => {
    const userId = await newAccount();
    await expectError(LanguageService.setActiveLanguage(userId, "de"), "not_active", { language: "de" });
    await expectError(LanguageService.removeLanguage(userId, "de"), "not_found");
  });
});

describe("settings, own language and interest (B-05, B-06)", () => {
  it("updates per-language settings and validates them", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    const { state } = await LanguageService.updateLanguageSettings(userId, {
      language: "de",
      explanationLanguage: "Arabic",
      poolChunkSize: 12,
      poolAgeCutoffDays: 10,
      goals: ["Work"],
    });
    expect(state.languages[0].explanationLanguage).toBe("ar");
    const lp = await LanguageProfiles.findOne({ userId, language: "de" }).lean<any>();
    expect(lp).toMatchObject({ poolChunkSize: 12, poolAgeCutoffDays: 10, goals: ["Work"] });

    await expectError(LanguageService.updateLanguageSettings(userId, { language: "de", newPhrasesPerDay: 0 }), "invalid_argument");
    await expectError(LanguageService.updateLanguageSettings(userId, { language: "de", explanationLanguage: "Klingon" }), "not_available");
    await expectError(LanguageService.updateLanguageSettings(userId, { language: "fr", poolChunkSize: 5 }), "not_found");
  });

  it("reports each language's settings in the state, with defaults", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    await Profiles.updateOne({ refId: userId }, { $set: { poolChunkSize: 15 } }); // set before settings moved per language
    await LanguageService.addLanguage(userId, { language: "de", goals: ["Travel"] });
    await LanguageService.addLanguage(userId, { language: "fr" });
    const { state } = await LanguageService.updateLanguageSettings(userId, { language: "fr", newPhrasesPerDay: 8, poolChunkSize: 6, poolAgeCutoffDays: 3 });

    expect(state.languages.find((l) => l.code === "de")).toMatchObject({ newPhrasesPerDay: 20, poolChunkSize: 15, poolAgeCutoffDays: 7, goals: ["Travel"] });
    expect(state.languages.find((l) => l.code === "fr")).toMatchObject({ newPhrasesPerDay: 8, poolChunkSize: 6, poolAgeCutoffDays: 3, goals: [] });
  });

  it("sets the own language from any code or name in the own list", async () => {
    const userId = await newAccount();
    expect((await LanguageService.setTranslationLanguage(userId, "vi")).state.translationLanguage).toBe("vi");
    await expectError(LanguageService.setTranslationLanguage(userId, "Klingon"), "not_available");
  });

  it("Tell me: set, set again, undo, and the team count", async () => {
    const a = await newAccount();
    const b = await newAccount();
    expect(await LanguageService.setLanguageInterest(a, "Portuguese", true)).toEqual({ on: true });
    await LanguageService.setLanguageInterest(a, "pt", true);
    await LanguageService.setLanguageInterest(b, "pt", true);
    await LanguageService.setLanguageInterest(b, "ja", true);
    expect(await Interests.countDocuments({ userId: a })).toBe(1);
    expect(await LanguageService.languageInterestCounts()).toEqual([
      { language: "pt", count: 2 },
      { language: "ja", count: 1 },
    ]);
    expect(await LanguageService.setLanguageInterest(b, "pt", false)).toEqual({ on: false });
    expect(await Interests.countDocuments({ language: "pt" })).toBe(1);
    await expectError(LanguageService.setLanguageInterest(a, "Klingon", true), "invalid_argument");
  });

  it("get-language-state returns the learner's Tell me languages", async () => {
    const a = await newAccount();
    const b = await newAccount();
    expect((await LanguageService.getState(a)).interests).toEqual([]);
    await LanguageService.setLanguageInterest(a, "pt", true);
    await LanguageService.setLanguageInterest(a, "Japanese", true);
    await LanguageService.setLanguageInterest(b, "ko", true);
    expect((await LanguageService.getState(a)).interests).toEqual(["ja", "pt"]);
    await LanguageService.setLanguageInterest(a, "ja", false);
    expect((await LanguageService.getState(a)).interests).toEqual(["pt"]);
    expect((await fn("get-language-state")({ userId: b })).interests).toEqual(["ko"]);
  });
});

describe("kept phrases (B-32)", () => {
  const phrase = { phrase: " Kind ", translation: "child", translation_language: "fa", type: "normal" };

  it("keeps a phrase for a language not added, outside review and the save count", async () => {
    const userId = await legacyAccount();
    const kept = await LanguageService.keepPhrasePending(userId, { phrase, language: "German" });
    expect(new Date(kept.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY);

    const doc = await Phrases.findById(kept.phraseId).lean<any>();
    expect(doc).toMatchObject({ phrase: "Kind", language: "de", status: "pending", languageSource: "user", refId: userId });
    expect(await Bundles.countDocuments({ phrases: doc._id })).toBe(0);
    expect(mockUpdateFreemium).not.toHaveBeenCalled();

    // Keeping it again refreshes the same document.
    const again = await LanguageService.keepPhrasePending(userId, { phrase, language: "de" });
    expect(again.phraseId).toBe(kept.phraseId);

    const state = await LanguageService.getState(userId);
    expect(state.pending).toEqual([{ language: "de", count: 1, expiresAt: again.expiresAt }]);
    expect(state.languages[0].phraseCount).toBe(2);
  });

  it("adding the language moves kept phrases into its first bundle and counts them", async () => {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    mockIsFreemium.mockResolvedValue(false);
    await LanguageService.addLanguage(userId, { language: "en" });
    const a = await LanguageService.keepPhrasePending(userId, { phrase, language: "de" });
    const b = await LanguageService.keepPhrasePending(userId, { phrase: { ...phrase, phrase: "Gift" }, language: "de" });
    await LanguageService.keepPhrasePending(userId, { phrase, language: "fr" });
    // An English bundle that already has the title must not block German's.
    await Bundles.create({ refId: userId, title: "German phrases", phrases: [] });

    const { state } = await LanguageService.addLanguage(userId, { language: "de" });

    expect(state.pending).toEqual([expect.objectContaining({ language: "fr", count: 1 })]);
    expect(state.languages.find((l) => l.code === "de")!.phraseCount).toBe(2);
    const bundle = await Bundles.findOne({ refId: userId, language: "de" }).lean<any>();
    // The bundle title is unique per language (B-09), so German keeps the plain title.
    expect(bundle.title).toBe("German phrases");
    expect(bundle.phrases.map(String).sort()).toEqual([a.phraseId, b.phraseId].sort());
    const moved = await Phrases.findById(a.phraseId).lean<any>();
    expect(moved.status).toBeUndefined();
    expect(moved.pendingExpiresAt).toBeUndefined();
    expect(mockPoolAdd).toHaveBeenCalledTimes(2);
    expect(mockPoolAdd).toHaveBeenCalledWith(userId, a.phraseId, "de");
    expect(mockUpdateFreemium).not.toHaveBeenCalled(); // a paid learner
  });

  it("a free learner's moved phrases count toward the save limit", async () => {
    const userId = await newAccount();
    await LanguageService.keepPhrasePending(userId, { phrase, language: "de" });
    await LanguageService.addLanguage(userId, { language: "de" });
    expect(mockUpdateFreemium).toHaveBeenCalledWith({ userId, increment: { allowed_save_words_used: 1 } });
  });

  it("expired kept phrases do not move", async () => {
    const userId = await newAccount();
    const kept = await LanguageService.keepPhrasePending(userId, { phrase, language: "de" });
    await Phrases.updateOne({ _id: kept.phraseId }, { $set: { pendingExpiresAt: new Date(Date.now() - 1000) } });
    const { state } = await LanguageService.addLanguage(userId, { language: "de" });
    expect(state.languages[0].phraseCount).toBe(0);
    expect(state.pending).toEqual([]);
  });

  it("a phrase kept for a language the learner already studies joins it at once", async () => {
    const userId = await newAccount();
    await LanguageService.addLanguage(userId, { language: "de" });
    const kept = await LanguageService.keepPhrasePending(userId, { phrase, language: "de" });
    expect((await Phrases.findById(kept.phraseId).lean<any>()).status).toBeUndefined();
  });

  it("refuses a missing phrase or an unknown language", async () => {
    const userId = await newAccount();
    await expectError(LanguageService.keepPhrasePending(userId, { phrase: { phrase: "x" }, language: "de" }), "invalid_argument");
    await expectError(LanguageService.keepPhrasePending(userId, { phrase, language: "pt" }), "not_available");
  });
});

describe("functions", () => {
  it("exposes the contract's function names", () => {
    expect(functions.map((f) => f.name)).toEqual([
      "get-language-capabilities",
      "get-language-state",
      "add-language",
      "set-active-language",
      "remove-language",
      "pause-languages",
      "update-language-settings",
      "set-translation-language",
      "set-language-interest",
      "get-language-interest-counts",
      "keep-phrase-pending",
    ]);
    expect(functions.find((f) => f.name === "get-language-capabilities").permissionTypes).toEqual(["anonymous_access"]);
    expect(functions.find((f) => f.name === "get-language-interest-counts").permissionTypes).toEqual(["advanced_settings"]);
  });

  it("passes the caller and args through", async () => {
    const userId = await newAccount();
    const { state } = await fn("add-language")({ userId, language: "it", startLevel: "A2" });
    expect(state.languages[0]).toMatchObject({ code: "it", startLevel: "A2" });
    expect((await fn("get-language-state")({ userId })).learningLanguage).toBe("it");
    await expect(fn("get-language-state")({})).rejects.toThrow("User ID is required");
  });
});

describe("server analytics (B-28)", () => {
  const phrase = { phrase: "Kind", translation: "child", translation_language: "fa", type: "normal" };

  async function readerWith(...languages: string[]): Promise<string> {
    const userId = await newAccount();
    await subscribe(userId, "reader");
    for (const language of languages) await LanguageService.addLanguage(userId, { language });
    await flushEvents();
    resetMixpanel();
    return userId;
  }

  it("add-language sends language_added once, on the learner, with the level", async () => {
    const userId = await newAccount();
    await fn("add-language")({ userId, language: "German", startLevel: "A2", startLevelSource: "test" });
    await flushEvents();

    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("language_added");
    expect(sent[0].props).toMatchObject({ distinct_id: userId, language: "de", start_level: "A2", start_level_source: "test" });
  });

  it("add-language sends it again for a restored language, but not for one already active", async () => {
    const userId = await readerWith("de", "fr");
    await fn("add-language")({ userId, language: "de" }); // already active
    await fn("remove-language")({ userId, language: "fr" });
    await flushEvents();
    resetMixpanel();

    await fn("add-language")({ userId, language: "fr" }); // restore
    await fn("add-language")({ userId, language: "fr" }); // active again: nothing
    await flushEvents();
    expect(sent.map((e) => e.event)).toEqual(["language_added"]);
    expect(sent[0].props).toMatchObject({ language: "fr", start_level: "A1" });
  });

  it("add-language sends nothing when it fails", async () => {
    const userId = await newAccount();
    await expect(fn("add-language")({ userId, language: "Klingon" })).rejects.toThrow();
    await fn("add-language")({ userId, language: "de" }); // Starter: one language
    await flushEvents();
    resetMixpanel();
    await expect(fn("add-language")({ userId, language: "fr" })).rejects.toThrow("upgrade_needed");
    await flushEvents();
    expect(sent).toEqual([]);
  });

  it("remove-language sends language_removed once; removing it again sends nothing", async () => {
    const userId = await readerWith("de", "fr");
    await fn("remove-language")({ userId, language: "fr" });
    await fn("remove-language")({ userId, language: "fr" });
    await flushEvents();

    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("language_removed");
    expect(sent[0].props).toMatchObject({ distinct_id: userId, language: "fr" });
  });

  it("remove-language sends nothing for a language the learner never had", async () => {
    const userId = await readerWith("de");
    await expect(fn("remove-language")({ userId, language: "fr" })).rejects.toThrow("not_found");
    await flushEvents();
    expect(sent).toEqual([]);
  });

  it("set-active-language sends language_switched with from and to", async () => {
    const userId = await readerWith("de", "fr"); // fr is active
    await fn("set-active-language")({ userId, language: "de" });
    await flushEvents();

    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("language_switched");
    expect(sent[0].props).toMatchObject({ distinct_id: userId, from_language: "fr", to_language: "de" });
  });

  it("set-active-language sends nothing for the active language or one the learner lacks", async () => {
    const userId = await readerWith("de", "fr");
    await fn("set-active-language")({ userId, language: "fr" });
    await expect(fn("set-active-language")({ userId, language: "it" })).rejects.toThrow("not_active");
    await flushEvents();
    expect(sent).toEqual([]);
  });

  it("set-language-interest sends language_interest only when the answer changed", async () => {
    const userId = await newAccount();
    await fn("set-language-interest")({ userId, language: "pt", on: true });
    await fn("set-language-interest")({ userId, language: "pt", on: true }); // same: nothing
    await fn("set-language-interest")({ userId, language: "pt", on: false });
    await fn("set-language-interest")({ userId, language: "pt", on: false }); // same: nothing
    await flushEvents();

    expect(sent.map((e) => [e.event, e.props.language, e.props.on])).toEqual([
      ["language_interest", "pt", true],
      ["language_interest", "pt", false],
    ]);
    expect(sent[0].props.distinct_id).toBe(userId);
  });

  it("set-language-interest sends nothing for a bad request", async () => {
    const userId = await newAccount();
    await expect(fn("set-language-interest")({ userId, language: "Klingon", on: true })).rejects.toThrow("invalid_argument");
    await flushEvents();
    expect(sent).toEqual([]);
  });

  it("keep-phrase-pending sends phrase_kept_pending for a new kept phrase, not for a refresh", async () => {
    const userId = await legacyAccount();
    await fn("keep-phrase-pending")({ userId, phrase, language: "German" });
    await fn("keep-phrase-pending")({ userId, phrase, language: "de" }); // same text: refreshes
    await flushEvents();

    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("phrase_kept_pending");
    expect(sent[0].props).toMatchObject({ distinct_id: userId, language: "de" });
  });

  it("keep-phrase-pending sends nothing when it fails", async () => {
    const userId = await legacyAccount();
    await expect(fn("keep-phrase-pending")({ userId, phrase: { phrase: "Kind" }, language: "de" })).rejects.toThrow("invalid_argument");
    await expect(fn("keep-phrase-pending")({ userId, phrase, language: "Klingon" })).rejects.toThrow();
    await flushEvents();
    expect(sent).toEqual([]);
  });

  it("a Mixpanel error never fails the learner's call", async () => {
    const userId = await newAccount();
    failMixpanel(true);
    await expect(fn("add-language")({ userId, language: "de" })).resolves.toMatchObject({ state: { learningLanguage: "de" } });
    await expect(fn("set-language-interest")({ userId, language: "pt", on: true })).resolves.toEqual({ on: true });
    await expect(fn("keep-phrase-pending")({ userId, phrase, language: "fr" })).resolves.toMatchObject({ phraseId: expect.any(String) });
    await flushEvents();
    expect(sentNamed("language_added")).toEqual([]);
  });
});
