import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Capture inserted docs so we can assert what createPhrase persists.
const insertMany = jest.fn<any>();
const countDocuments = jest.fn<any>();
const findOne = jest.fn<any>();
const updateOne = jest.fn<any>();

jest.mock("@modular-rest/server", () => ({
  // defineFunction returns its config so the callback is reachable in tests.
  defineFunction: (config: any) => config,
  getCollection: () => ({
    insertMany,
    countDocuments,
    findOne,
    updateOne,
  }),
}));

jest.mock("../../subscription/service", () => ({
  isUserOnFreemium: jest.fn<any>().mockResolvedValue(false),
  updateFreemiumAllocation: jest.fn<any>(),
  getOrCreateFreemiumAllocation: jest
    .fn<any>()
    .mockResolvedValue({ allowed_save_words_used: 0 }),
}));

// Enforcement is covered in enforcement.test.ts; here the cap resolves to
// unlimited so the save_words gate never blocks the persistence assertions.
jest.mock("../../subscription/enforcement", () => ({
  getEffectiveCap: jest.fn<any>().mockResolvedValue(null),
  EntitlementLimitError: class EntitlementLimitError extends Error {},
}));

jest.mock("../triggers", () => ({ phraseBundleTriggers: [] }));

jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: {
    PHRASE_SAVED_FIRST_TIME: "phrase_saved_first-time",
  },
}));

const { trackServerEvent } = require("../../../utils/analytics");
const { functions } = require("../functions");
const createPhrase = functions.find((f: any) => f.name === "createPhrase");

describe("createPhrase persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    countDocuments.mockResolvedValue(0); // no bundles to verify
    findOne.mockResolvedValue(null); // phrase does not already exist
    insertMany.mockResolvedValue([{ _id: "new-phrase-id" }]);
    updateOne.mockResolvedValue({});
  });

  it("persists chunks and a normalised sourceUrl on a linguistic phrase", async () => {
    await createPhrase.callback({
      phrase: "we had to decide quickly",
      translation: "...",
      translation_language: "fa",
      bundleIds: [],
      refId: "user-1",
      type: "linguistic",
      context: "you know, we had to decide quickly because nobody else would.",
      chunks: [{ text: "had to", type: "collocation", confidence: 0.9 }],
      sourceUrl: "https://www.youtube.com/watch?v=abc123&t=42s#c",
    });

    expect(insertMany).toHaveBeenCalledTimes(1);
    const doc = (insertMany.mock.calls[0][0] as any[])[0];
    expect(doc.chunks).toEqual([
      { text: "had to", type: "collocation", confidence: 0.9 },
    ]);
    expect(doc.sourceUrl).toBe("https://www.youtube.com/watch");
  });

  it("does not set chunks/sourceUrl for a normal phrase", async () => {
    await createPhrase.callback({
      phrase: "hello",
      translation: "...",
      translation_language: "fa",
      bundleIds: [],
      refId: "user-1",
      type: "normal",
      chunks: [{ text: "x", type: "other", confidence: 1 }],
      sourceUrl: "https://example.com/page",
    });

    const doc = (insertMany.mock.calls[0][0] as any[])[0];
    expect(doc.chunks).toBeUndefined();
    expect(doc.sourceUrl).toBeUndefined();
  });

  it("fires phrase_saved_first-time on the user's first-ever save", async () => {
    // countDocuments is called first for bundle verification, then for the
    // prior-phrase count. Both zero here -> genuine first save.
    countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await createPhrase.callback({
      phrase: "we had to decide quickly",
      translation: "...",
      translation_language: "fa",
      bundleIds: [],
      refId: "user-1",
      type: "linguistic",
      language_info: { source: "en", target: "fa" },
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    });

    expect(trackServerEvent).toHaveBeenCalledWith(
      "phrase_saved_first-time",
      "user-1",
      { source_platform: "youtube", language_pair: "en-fa" }
    );
  });

  it("does NOT fire phrase_saved_first-time when the user already has phrases", async () => {
    // Bundle-verify count 0, then a non-zero prior-phrase count -> not the first save.
    countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(7);

    await createPhrase.callback({
      phrase: "hello",
      translation: "...",
      translation_language: "fa",
      bundleIds: [],
      refId: "user-1",
      type: "normal",
    });

    expect(trackServerEvent).not.toHaveBeenCalled();
  });
});
