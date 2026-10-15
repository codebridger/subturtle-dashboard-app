/**
 * B-19 / Q10: get-coach-instructions and flag-coach-explanation on an in-memory MongoDB.
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

import {
  COACH_EXPLANATION_FLAG_COLLECTION,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  PHRASE_COLLECTION,
  PROFILE_COLLECTION,
} from "../../../../config";

const { functions } = require("../functions") as { functions: any[] };
const fn = (name: string) => functions.find((f) => f.name === name).callback;
const getCoachInstructions = fn("get-coach-instructions");
const flag = fn("flag-coach-explanation");
const flagDefinition = require("../db")[0];

const ALICE = new mongoose.Types.ObjectId().toString();
const BOB = new mongoose.Types.ObjectId().toString();

let mongo: MongoMemoryServer;
let connection: Connection;
let Profiles: Model<any>, Phrases: Model<any>, LanguageProfiles: Model<any>, Flags: Model<any>, TextSessions: Model<any>, VoiceSessions: Model<any>;
const loose = () => new Schema({}, { strict: false, timestamps: true });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  Profiles = connection.model(PROFILE_COLLECTION, loose());
  Phrases = connection.model(PHRASE_COLLECTION, loose());
  LanguageProfiles = connection.model("language_profile", loose());
  Flags = connection.model(COACH_EXPLANATION_FLAG_COLLECTION, flagDefinition.schema);
  TextSessions = connection.model(LIVE_SESSION_TEXT_COLLECTION, loose());
  VoiceSessions = connection.model(LIVE_SESSION_COLLECTION, loose());
  Object.assign(mockModels, {
    [PROFILE_COLLECTION]: Profiles,
    [PHRASE_COLLECTION]: Phrases,
    language_profile: LanguageProfiles,
    [COACH_EXPLANATION_FLAG_COLLECTION]: Flags,
    [LIVE_SESSION_TEXT_COLLECTION]: TextSessions,
    [LIVE_SESSION_COLLECTION]: VoiceSessions,
  });
  await Flags.init();
}, 120000);

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

let p1: string, p2: string, bobPhrase: string;
beforeEach(async () => {
  await Promise.all([Profiles, Phrases, LanguageProfiles, Flags, TextSessions, VoiceSessions].map((m) => m.deleteMany({})));
  delete process.env.COACH_FLAG_SWITCH_THRESHOLD;
  delete process.env.LANGUAGES_ENABLED;
  await Profiles.create({ refId: ALICE, learningLanguage: "de", learningLanguages: ["de"], translationLanguage: "fa" });
  await LanguageProfiles.create({ userId: ALICE, language: "de", status: "active", startLevel: "A1", explanationLanguage: "ar" });
  p1 = String((await Phrases.create({ refId: ALICE, phrase: "anfangen", translation: "بدء" }))._id);
  p2 = String((await Phrases.create({ refId: ALICE, phrase: "warten auf", translation: "انتظار" }))._id);
  bobPhrase = String((await Phrases.create({ refId: BOB, phrase: "secret", translation: "x" }))._id);
});

describe("get-coach-instructions", () => {
  it("builds the German prompt from the language profile, in the order asked, without other users' phrases", async () => {
    const out = await getCoachInstructions({ userId: ALICE, phraseIds: [p2, p1, bobPhrase, "bad"], mode: "voice" });
    expect(out.language).toBe("de");
    expect(out.explanationLanguage).toBe("ar"); // the language profile's Coach language
    expect(out.level).toBe("A1");
    expect(out.voiceName).toBe("Kore");
    expect(out.instructions).toMatch(/AI German tutor/);
    expect(out.instructions).toMatch(/native language is Arabic/);
    expect(out.instructions).toMatch(/1\. warten auf[^\n]*\n\s*2\. anfangen/);
    expect(out.instructions).not.toMatch(/secret/);
  });

  it("the request's explanation language wins; then the profile's own language", async () => {
    expect((await getCoachInstructions({ userId: ALICE, explanationLanguage: "tr", phraseIds: [p1], mode: "text" })).explanationLanguage).toBe("tr");
    await LanguageProfiles.updateOne({ userId: ALICE }, { $unset: { explanationLanguage: 1 } });
    expect((await getCoachInstructions({ userId: ALICE, phraseIds: [p1], mode: "text" })).explanationLanguage).toBe("fa");
  });

  it("a learner from before multilingual gets today's English prompt", async () => {
    await Profiles.create({ refId: BOB });
    const out = await getCoachInstructions({ userId: BOB, phraseIds: [bobPhrase], mode: "text", explanationLanguage: "es" });
    expect(out.language).toBe("en");
    expect(out.level).toBeNull();
    expect(out.instructions).toMatch(/AI English tutor/);
    expect(out.instructions).not.toMatch(/Level and language/);
  });

  it("refuses a language whose Coach is switched off", async () => {
    process.env.LANGUAGES_ENABLED = "en,es";
    await expect(getCoachInstructions({ userId: ALICE, language: "de", phraseIds: [p1], mode: "voice" })).rejects.toThrow(/^not_available/);
    await expect(getCoachInstructions({ userId: ALICE, language: "pt", phraseIds: [p1], mode: "voice" })).rejects.toThrow(/^not_available/);
  });

  it("needs a userId", async () => {
    await expect(getCoachInstructions({ phraseIds: [p1] })).rejects.toThrow(/userId/);
  });
});

describe("flag-coach-explanation", () => {
  it("stores one flag per turn with the session's language pair, and can clear it", async () => {
    const session = await TextSessions.create({ refId: ALICE, metadata: { language: "de", explanationLanguage: "ar" } });
    expect(await flag({ userId: ALICE, sessionId: String(session._id), turnIndex: 3, on: true })).toEqual({ on: true });
    expect(await flag({ userId: ALICE, sessionId: String(session._id), turnIndex: 3, on: true })).toEqual({ on: true });
    let rows = await Flags.find().lean<any[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ userId: ALICE, turnIndex: 3, language: "de", explanationLanguage: "ar", on: true }));
    await flag({ userId: ALICE, sessionId: String(session._id), turnIndex: 3, on: false });
    rows = await Flags.find().lean<any[]>();
    expect(rows[0].on).toBe(false);
  });

  it("reads an old voice session's nativeLanguage title", async () => {
    const session = await VoiceSessions.create({ refId: ALICE, metadata: { nativeLanguage: "Persian" } });
    await flag({ userId: ALICE, sessionId: String(session._id), turnIndex: 0, on: true });
    const row = await Flags.findOne().lean<any>();
    expect(row.language).toBe("en");
    expect(row.explanationLanguage).toBe("fa");
  });

  it("another user's session is not found", async () => {
    const session = await TextSessions.create({ refId: BOB });
    await expect(flag({ userId: ALICE, sessionId: String(session._id), turnIndex: 0, on: true })).rejects.toThrow(/not found/);
    await expect(flag({ userId: ALICE, sessionId: String(session._id), turnIndex: -1 })).rejects.toThrow(/turnIndex/);
  });

  it("many learners flagging one pair switch it to English", async () => {
    process.env.COACH_FLAG_SWITCH_THRESHOLD = "3";
    for (let i = 0; i < 3; i++) {
      const user = new mongoose.Types.ObjectId().toString();
      const session = await TextSessions.create({ refId: user, metadata: { language: "de", explanationLanguage: "ar" } });
      await flag({ userId: user, sessionId: String(session._id), turnIndex: 1, on: true });
      const out = await getCoachInstructions({ userId: ALICE, phraseIds: [p1], mode: "text" });
      expect(out.explanationSwitchedToEnglish).toBe(i === 2);
    }
    const out = await getCoachInstructions({ userId: ALICE, phraseIds: [p1], mode: "text" });
    expect(out.explanationLanguage).toBe("en");
    expect(out.instructions).toMatch(/native language is English/);
    // Another pair is not affected.
    expect((await getCoachInstructions({ userId: ALICE, explanationLanguage: "fa", phraseIds: [p1], mode: "text" })).explanationLanguage).toBe("fa");
  });
});
