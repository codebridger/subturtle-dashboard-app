import {
  getLanguageCapabilities,
  getLearningLanguage,
  getOwnLanguage,
  getOwnLanguages,
  hasFeature,
  isLearningLanguageEnabled,
} from "../registry";

const LAUNCH = ["en", "es", "de", "fr", "it", "sv", "lt"];

describe("capability register", () => {
  const saved = process.env.LANGUAGES_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.LANGUAGES_ENABLED;
    else process.env.LANGUAGES_ENABLED = saved;
  });

  it("lists the seven launch languages, all enabled by default", () => {
    delete process.env.LANGUAGES_ENABLED;
    const { learning } = getLanguageCapabilities();
    expect(learning.map((l) => l.code)).toEqual(LAUNCH);
    expect(learning.every((l) => l.enabled)).toBe(true);
  });

  it("names languages in English and natively, with a voice and no map yet", () => {
    const de = getLearningLanguage("German")!;
    expect(de).toMatchObject({ code: "de", name: "German", nativeName: "Deutsch", rtl: false });
    expect(de.ttsVoice).toMatch(/^de-DE-/);
    expect(de.features.map).toBe(false);
    expect(de.features.save).toBe(true);
  });

  it("returns undefined for a language that is not in the register", () => {
    expect(getLearningLanguage("pt")).toBeUndefined();
    expect(isLearningLanguageEnabled("pt")).toBe(false);
  });

  it("LANGUAGES_ENABLED switches on exactly the listed languages, plus English", () => {
    process.env.LANGUAGES_ENABLED = "de, Spanish ,xx";
    const enabled = getLanguageCapabilities()
      .learning.filter((l) => l.enabled)
      .map((l) => l.code);
    expect(enabled).toEqual(["en", "es", "de"]);
    expect(isLearningLanguageEnabled("fr")).toBe(false);
    expect(hasFeature("fr", "save")).toBe(false);
    expect(hasFeature("de", "save")).toBe(true);
  });

  it("an empty LANGUAGES_ENABLED means no override", () => {
    process.env.LANGUAGES_ENABLED = "";
    expect(getLanguageCapabilities().learning.every((l) => l.enabled)).toBe(true);
  });

  it("does not let callers change the register", () => {
    getLearningLanguage("de")!.features.save = false;
    expect(getLearningLanguage("de")!.features.save).toBe(true);
  });

  it("marks teacher-checked own languages", () => {
    for (const code of ["fa", "ar", "es", "vi", "en", "tr"]) {
      expect(getOwnLanguage(code)?.explanationReviewed).toBe("teacher");
    }
    expect(getOwnLanguage("de")?.explanationReviewed).toBe("ai");
    expect(getOwnLanguage("fa")).toMatchObject({ name: "Persian", nativeName: "فارسی", rtl: true });
  });

  it("lists own languages once each, sorted by English name", () => {
    const own = getOwnLanguages();
    const codes = own.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    const names = own.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(codes).toEqual(expect.arrayContaining(["fa", "ar", "he", "zh", "pt", ...LAUNCH]));
  });
});
