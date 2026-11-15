/**
 * B-14 / B-17: reading the own language (new and old name), the learner's languages from
 * the profile copy, and the resolution detected → active → unknown.
 */
import { describe, it, expect, jest } from "@jest/globals";

const mockUpdateOne = jest.fn<(...args: any[]) => Promise<any>>(async () => ({}));
jest.mock("@modular-rest/server", () => ({
  getCollection: () => ({ updateOne: mockUpdateOne }),
}));

import { learnerLanguagesOf, readTranslationLanguage, resolveLanguage, usageDay } from "../language";

describe("readTranslationLanguage", () => {
  it("reads translationLanguage and does not count it", () => {
    expect(readTranslationLanguage({ translationLanguage: "Persian" }, "t")).toEqual({ code: "fa", value: "fa", usedOldName: false });
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("reads the old targetLanguage and counts it for the surface and day", () => {
    expect(readTranslationLanguage({ targetLanguage: "fa" }, "translateWithContext")).toEqual({ code: "fa", value: "fa", usedOldName: true });
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { field: "targetLanguage", surface: "translateWithContext", day: usageDay() },
      expect.objectContaining({ $inc: { count: 1 } }),
      { upsert: true }
    );
  });

  it("prefers the new name when both are sent", () => {
    mockUpdateOne.mockClear();
    expect(readTranslationLanguage({ translationLanguage: "ar", targetLanguage: "fa" }, "t").code).toBe("ar");
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("keeps a value with no code as raw text, and empty as empty", () => {
    expect(readTranslationLanguage({ translationLanguage: "Klingon" }, "t")).toEqual({ code: undefined, value: "Klingon", usedOldName: false });
    expect(readTranslationLanguage({}, "t").value).toBe("");
  });
});

describe("learnerLanguagesOf", () => {
  it("reads a multilingual profile", () => {
    expect(learnerLanguagesOf({ learningLanguage: "de", learningLanguages: ["de", "es"], pausedLanguages: ["fr"], translationLanguage: "fa" })).toEqual({
      active: "de",
      languages: ["de", "es", "fr"],
      translationLanguage: "fa",
    });
  });

  it("treats a profile from before multilingual as English", () => {
    expect(learnerLanguagesOf({ name: "old" })).toEqual({ active: "en", languages: ["en"], translationLanguage: null });
  });

  it("a new account before its first language has none", () => {
    expect(learnerLanguagesOf({ onboardingState: "needs_language" })).toEqual({ active: null, languages: [], translationLanguage: null });
  });
});

describe("resolveLanguage", () => {
  const learner = { active: "de", languages: ["de", "es"], translationLanguage: "fa" };

  it("uses the detected language when the learner has it", () => {
    expect(resolveLanguage("es", learner)).toEqual({ detectedLanguage: "es", resolvedLanguage: "es", inProfile: true });
    expect(resolveLanguage("Spanish", learner).resolvedLanguage).toBe("es");
  });

  it("falls back to the active language", () => {
    expect(resolveLanguage("fr", learner)).toEqual({ detectedLanguage: "fr", resolvedLanguage: "de", inProfile: false });
  });

  it("returns unknown when nothing is known", () => {
    expect(resolveLanguage("auto", { active: null, languages: [], translationLanguage: null })).toEqual({
      detectedLanguage: "unknown",
      resolvedLanguage: "unknown",
      inProfile: false,
    });
  });
});
