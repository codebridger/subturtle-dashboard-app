import {
  isAutoOrUnknown,
  isKnownLanguage,
  isRtl,
  langOf,
  languageFilter,
  requestLanguage,
  toCode,
  toNativeName,
  toTitle,
} from "../helper";

describe("toCode", () => {
  it("accepts codes in any case", () => {
    expect(toCode("fa")).toBe("fa");
    expect(toCode("DE")).toBe("de");
    expect(toCode(" sv ")).toBe("sv");
  });

  it("accepts English titles, native names and aliases", () => {
    expect(toCode("Persian")).toBe("fa");
    expect(toCode("farsi")).toBe("fa");
    expect(toCode("Deutsch")).toBe("de");
    expect(toCode("Español")).toBe("es");
    expect(toCode("Chinese (Simplified)")).toBe("zh");
    expect(toCode("Portuguese (Portugal, Brazil)")).toBe("pt");
    expect(toCode("Tagalog (Filipino)")).toBe("tl");
  });

  it("fixes old frontend codes", () => {
    expect(toCode("ae")).toBe("ar");
    expect(toCode("he or iw")).toBe("he");
    expect(toCode("iw")).toBe("he");
  });

  it("folds region tags into the base language", () => {
    expect(toCode("pt-BR")).toBe("pt");
    expect(toCode("de_AT")).toBe("de");
    expect(toCode("zh-Hant-TW")).toBe("zh");
    expect(toCode("en-US")).toBe("en");
  });

  it("drops an unknown qualifier from a known title", () => {
    expect(toCode("Spanish (Mexico)")).toBe("es");
  });

  it("returns undefined for auto, unknown, empty and unknown values", () => {
    for (const value of ["auto", "AUTO", "unknown", "", "  ", undefined, null, 42, {}, "Klingon", "xx", "xx-YY"]) {
      expect(toCode(value)).toBeUndefined();
    }
  });
});

describe("isAutoOrUnknown / isKnownLanguage", () => {
  it("tells markers from languages", () => {
    expect(isAutoOrUnknown("auto")).toBe(true);
    expect(isAutoOrUnknown("unknown")).toBe(true);
    expect(isAutoOrUnknown(undefined)).toBe(true);
    expect(isAutoOrUnknown("de")).toBe(false);
    expect(isKnownLanguage("German")).toBe(true);
    expect(isKnownLanguage("Klingon")).toBe(false);
  });
});

describe("toTitle / toNativeName", () => {
  it("names a language in English and natively", () => {
    expect(toTitle("fa")).toBe("Persian");
    expect(toTitle("Deutsch")).toBe("German");
    expect(toNativeName("de")).toBe("Deutsch");
    expect(toNativeName("lt")).toBe("Lietuvių");
  });

  it("returns the input for an unknown value", () => {
    expect(toTitle("Klingon")).toBe("Klingon");
    expect(toTitle(undefined)).toBe("");
    expect(toNativeName("Klingon")).toBe("Klingon");
  });
});

describe("isRtl", () => {
  it("knows right-to-left scripts", () => {
    expect(isRtl("fa")).toBe(true);
    expect(isRtl("Arabic")).toBe(true);
    expect(isRtl("he")).toBe(true);
    expect(isRtl("de")).toBe(false);
    expect(isRtl("Klingon")).toBe(false);
  });
});

describe("langOf (stored default)", () => {
  it("is English for documents from before multilingual", () => {
    expect(langOf({})).toBe("en");
    expect(langOf(null)).toBe("en");
    expect(langOf({ language: null })).toBe("en");
    expect(langOf({ language: "unknown" })).toBe("en");
  });

  it("reads and cleans the stored language", () => {
    expect(langOf({ language: "de" })).toBe("de");
    expect(langOf({ language: "German" })).toBe("de");
  });
});

describe("requestLanguage (request default)", () => {
  it("uses the language the client sends", () => {
    expect(requestLanguage({ language: "fr" }, { learningLanguage: "de" })).toBe("fr");
  });

  it("falls back to the active language for old clients", () => {
    expect(requestLanguage({}, { learningLanguage: "de" })).toBe("de");
    expect(requestLanguage(undefined, { learningLanguage: "de" })).toBe("de");
    expect(requestLanguage({ language: "auto" }, { learningLanguage: "de" })).toBe("de");
  });

  it("falls back to English when the profile has no active language", () => {
    expect(requestLanguage({}, {})).toBe("en");
    expect(requestLanguage({}, null)).toBe("en");
  });
});

describe("languageFilter", () => {
  it("matches documents with no language for English", () => {
    expect(languageFilter("en")).toEqual({
      $and: [{ $or: [{ language: "en" }, { language: { $exists: false } }, { language: null }] }],
    });
  });

  it("matches the code only for other languages", () => {
    expect(languageFilter("de")).toEqual({ language: "de" });
    expect(languageFilter("German")).toEqual({ language: "de" });
  });
});
