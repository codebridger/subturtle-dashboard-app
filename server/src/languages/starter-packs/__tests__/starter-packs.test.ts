/**
 * Validates every authored starter pack (C-01) against starter-pack.schema.json and the
 * rules the schema cannot express: unique ids and texts, the same concept keys in every
 * pack, cloze `form` present in `text`, right-to-left translations in Arabic script.
 */
import fs from "fs";
import path from "path";

const PACK_DIR = path.join(__dirname, "..");
const LANGUAGES = ["en", "es", "de", "fr", "it", "sv", "lt"] as const;
const OWN_LANGUAGES = ["fa", "ar", "es", "vi", "en", "tr"] as const;
const ARABIC_SCRIPT = /[؀-ۿ]/;
const LATIN_LETTER = /[A-Za-z]/;

interface PackItem {
  id: string;
  text: string;
  lemma?: string;
  form?: string;
  translations: Record<string, string>;
  band: number;
  group: string;
  note?: string;
}

interface Pack {
  language: string;
  version: number;
  groups: { id: string; name: string }[];
  items: PackItem[];
}

const schema = JSON.parse(fs.readFileSync(path.join(PACK_DIR, "starter-pack.schema.json"), "utf8"));
const itemSchema = schema.$defs.item;

function loadPack(language: string): Pack {
  return JSON.parse(fs.readFileSync(path.join(PACK_DIR, `${language}.json`), "utf8"));
}

const WORD_CHAR = /[\p{L}\p{M}]/u;

/**
 * True when `form` occurs exactly once in `text` as a whole word, and that is also the first
 * case-insensitive substring match — the spot the frontend cloze builder (useClozeBlanks) blanks.
 */
function hasSingleClozeSpot(text: string, form: string): boolean {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWords = [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}\\p{M}])`, "gu"))];
  const first = text.toLowerCase().indexOf(form.toLowerCase());
  return wholeWords.length === 1 && wholeWords[0].index === first && !WORD_CHAR.test(text[first + form.length] ?? "");
}

/** The <group>-<nn> part of an id, shared by the same concept across packs. */
function conceptKey(id: string): string {
  return id.slice(id.indexOf("-") + 1);
}

describe("starter packs", () => {
  const packs = Object.fromEntries(LANGUAGES.map((language) => [language, loadPack(language)])) as Record<string, Pack>;

  it("cover the same concepts in every language", () => {
    const reference = packs.en.items.map((item) => conceptKey(item.id)).sort();
    for (const language of LANGUAGES) {
      expect(packs[language].items.map((item) => conceptKey(item.id)).sort()).toEqual(reference);
    }
  });

  describe.each(LANGUAGES)("%s", (language) => {
    const pack = packs[language];
    const expectedTranslations = OWN_LANGUAGES.filter((own) => own !== language).sort();
    const groupIds = pack.groups.map((group) => group.id);

    it("has the top-level shape", () => {
      expect(Object.keys(pack).filter((key) => key !== "$schema").sort()).toEqual([...schema.required].sort());
      expect(pack.language).toBe(language);
      expect(Number.isInteger(pack.version) && pack.version >= 1).toBe(true);
    });

    it("has 150 to 200 items", () => {
      expect(pack.items.length).toBeGreaterThanOrEqual(schema.properties.items.minItems);
      expect(pack.items.length).toBeLessThanOrEqual(schema.properties.items.maxItems);
    });

    it("lists about ten groups, each used and each id unique", () => {
      expect(new Set(groupIds).size).toBe(groupIds.length);
      expect(groupIds.length).toBeGreaterThanOrEqual(8);
      expect(groupIds.length).toBeLessThanOrEqual(12);
      for (const group of pack.groups) {
        expect(group.name.trim()).not.toBe("");
        expect(pack.items.some((item) => item.group === group.id)).toBe(true);
      }
    });

    it("has unique ids and unique texts", () => {
      const ids = pack.items.map((item) => item.id);
      const texts = pack.items.map((item) => item.text.trim().toLowerCase());
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
      expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    });

    it("uses every band", () => {
      expect([...new Set(pack.items.map((item) => item.band))].sort()).toEqual([1, 2, 3]);
    });

    it.each(pack.items.map((item) => [item.id, item] as const))("%s is valid", (_id, item) => {
      const allowedKeys = Object.keys(itemSchema.properties);
      expect(Object.keys(item).filter((key) => !allowedKeys.includes(key))).toEqual([]);
      for (const key of itemSchema.required) expect(item).toHaveProperty(key);

      expect(item.id).toMatch(new RegExp(itemSchema.properties.id.pattern));
      expect(item.id.startsWith(`${language}-${item.group}-`)).toBe(true);
      expect(groupIds).toContain(item.group);
      expect(itemSchema.properties.band.enum).toContain(item.band);

      expect(item.text).toBe(item.text.trim());
      expect(item.text).not.toBe("");
      if (item.note !== undefined) expect(item.note.trim()).not.toBe("");

      // Cloze target: both or neither, and the form must be blankable at exactly one spot.
      expect(item.lemma === undefined).toBe(item.form === undefined);
      if (item.form !== undefined) {
        expect(item.lemma!.trim()).not.toBe("");
        expect(hasSingleClozeSpot(item.text, item.form)).toBe(true);
      }

      expect(Object.keys(item.translations).sort()).toEqual(expectedTranslations);
      for (const [own, translation] of Object.entries(item.translations)) {
        expect(translation).toBe(translation.trim());
        expect(translation).not.toBe("");
        if (own === "fa" || own === "ar") {
          expect(translation).toMatch(ARABIC_SCRIPT);
          expect(translation).not.toMatch(LATIN_LETTER);
        }
      }
    });
  });
});
