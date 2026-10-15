/** Every learning language has a non-HD voice textToSpeechBase64 accepts, in its own language. */
import { describe, it, expect } from "@jest/globals";
import { getLanguageCapabilities, getLearningLanguages } from "../registry";

const EXPECTED: Record<string, string> = {
  en: "en-US-Standard-A",
  es: "es-ES-Neural2-A",
  de: "de-DE-Neural2-G",
  fr: "fr-FR-Neural2-F",
  it: "it-IT-Neural2-A",
  sv: "sv-SE-Wavenet-A",
  lt: "lt-LT-Standard-B",
};

describe("speechVoice", () => {
  it("is set for every learning language, is not HD, and speaks that language", () => {
    for (const lang of getLearningLanguages()) {
      expect(lang.speechVoice).toBe(EXPECTED[lang.code]);
      expect(lang.speechVoice).not.toMatch(/HD/);
      expect(lang.speechVoice.startsWith(`${lang.code}-`)).toBe(true);
    }
  });

  it("is in get-language-capabilities", () => {
    expect(getLanguageCapabilities().learning.find((l) => l.code === "de")?.speechVoice).toBe("de-DE-Neural2-G");
  });
});
