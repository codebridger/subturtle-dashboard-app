/**
 * B-14 / B-17: translateWithContext reads both language names, sends the learning
 * language, and returns detectedLanguage / resolvedLanguage / inProfile. Simple mode keeps
 * its bare string unless the caller sends `withLanguage: true`.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

let mockProfile: any = null;
const mockUpdateOne = jest.fn<(...args: any[]) => Promise<any>>(async () => ({}));
jest.mock("@modular-rest/server", () => ({
  defineFunction: (opts: any) => opts,
  getCollection: () => ({
    findOne: () => ({ lean: async () => mockProfile }),
    updateOne: mockUpdateOne,
  }),
}));

const mockSimple = jest.fn<(...args: any[]) => Promise<any>>();
const mockDetailed = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../service", () => ({
  getSimpleTranslation: (...args: any[]) => mockSimple(...args),
  getDetailedTranslation: (...args: any[]) => mockDetailed(...args),
  getTranslationAdvice: jest.fn(),
}));
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: { TRANSLATION_REQUESTED: "translation_requested" },
}));

const { functions } = require("../functions") as { functions: any[] };
const translate = functions.find((f) => f.name === "translateWithContext").callback;

const USER = "64b000000000000000000001";

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { refId: USER, learningLanguage: "de", learningLanguages: ["de", "es"], translationLanguage: "fa" };
});

describe("translateWithContext", () => {
  it("simple mode returns the bare string for old clients", async () => {
    mockSimple.mockResolvedValue("ترجمه");
    const out = await translate({ phrase: "Hallo", context: "Hallo du", targetLanguage: "fa", sourceLanguage: "auto", userId: USER });
    expect(out).toBe("ترجمه");
    expect(mockSimple.mock.calls[0][0]).toEqual(
      expect.objectContaining({ sourceLanguage: "", translationLanguage: "fa", learningLanguage: "de" })
    );
    // the old name is counted
    expect(mockUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ field: "targetLanguage", surface: "translateWithContext" }),
      expect.anything(),
      { upsert: true }
    );
  });

  it("simple mode with withLanguage returns the language fields", async () => {
    mockSimple.mockResolvedValue({ translation: "سلام", source: "es" });
    const out = await translate({ phrase: "Hola", context: "Hola", translationLanguage: "fa", withLanguage: true, userId: USER });
    expect(out).toEqual({ translation: "سلام", detectedLanguage: "es", resolvedLanguage: "es", inProfile: true });
    expect(mockSimple.mock.calls[0][0]).toEqual(expect.objectContaining({ withLanguage: true }));
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("detailed mode adds the three fields and falls back to the active language", async () => {
    mockDetailed.mockResolvedValue({ chunks: [], language_info: { source: "fr", target: "fa" }, translation: { phrase: "x" } });
    const out = await translate({ phrase: "Il y a", context: "Il y a", translationLanguage: "fa", translationType: "detailed", userId: USER });
    expect(out.detectedLanguage).toBe("fr");
    expect(out.resolvedLanguage).toBe("de");
    expect(out.inProfile).toBe(false);
    expect(out.translation.phrase).toBe("x");
  });

  it("a language argument the learner has replaces the active one", async () => {
    mockDetailed.mockResolvedValue({ chunks: [], language_info: { source: "fr", target: "fa" } });
    const out = await translate({ phrase: "p", context: "c", translationLanguage: "fa", translationType: "detailed", userId: USER, language: "es" });
    expect(out.resolvedLanguage).toBe("es");
    expect(mockDetailed.mock.calls[0][0]).toEqual(expect.objectContaining({ learningLanguage: "es" }));
  });

  it("an anonymous caller gets unknown unless detection finds nothing to place", async () => {
    mockDetailed.mockResolvedValue({ chunks: [], language_info: { source: "en", target: "fa" } });
    const out = await translate({ phrase: "p", context: "c", targetLanguage: "fa", translationType: "detailed" });
    expect(out).toEqual(expect.objectContaining({ detectedLanguage: "en", resolvedLanguage: "unknown", inProfile: false }));
  });

  it("a profile from before multilingual is English", async () => {
    mockProfile = { refId: USER };
    mockDetailed.mockResolvedValue({ chunks: [], language_info: { source: "en", target: "fa" } });
    const out = await translate({ phrase: "p", context: "c", translationLanguage: "fa", translationType: "detailed", userId: USER });
    expect(out).toEqual(expect.objectContaining({ detectedLanguage: "en", resolvedLanguage: "en", inProfile: true }));
  });

  it("wraps provider errors once", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockDetailed.mockRejectedValue(new Error("Failed to translate text: boom"));
    await expect(translate({ phrase: "p", context: "c", translationType: "detailed" })).rejects.toThrow(/^Failed to translate text: boom$/);
  });
});
