/**
 * B-15: the prompts name the source language (no more "from  to Persian"), send the
 * learning language, and ask for each language's chunk patterns and the cue.
 */
import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../../utils/openrouter", () => ({ openRouter: {} }));

import { buildAdvicePrompt, buildDetailedPrompts, buildSimplePrompts, describeSource } from "../service";
import { CHUNK_TYPES, chunkHintsFor, hasChunkHints } from "../language-hints";
import { ChunkSchema } from "../schema";

describe("describeSource", () => {
  it("names a known source language", () => {
    expect(describeSource("de")).toBe("German");
    expect(describeSource("Spanish")).toBe("Spanish");
  });

  it("asks the model to detect an auto source, with the learning language as the hint", () => {
    expect(describeSource("", "de")).toMatch(/detect it; the learner is studying German/);
    expect(describeSource("auto")).toMatch(/detect it\)/);
  });
});

describe("prompts", () => {
  it("never reads 'from  to' for an auto source", () => {
    const simple = buildSimplePrompts({ phrase: "Ich fange an", context: "x", sourceLanguage: "", translationLanguage: "fa", learningLanguage: "de" });
    expect(simple.userPrompt).not.toMatch(/from\s+to/);
    expect(simple.userPrompt).toMatch(/to Persian/);
    expect(simple.userPrompt).toMatch(/studying German/);

    const detailed = buildDetailedPrompts({ phrase: "p", context: "c", sourceLanguage: "", translationLanguage: "fa" });
    expect(detailed.userPrompt).not.toMatch(/from\s+to/);
  });

  it("still reads the old targetLanguage name", () => {
    expect(buildSimplePrompts({ phrase: "p", context: "c", targetLanguage: "ar" }).userPrompt).toMatch(/to Arabic/);
  });

  it("asks for the learning language's chunk patterns and the cue", () => {
    const { systemPrompt } = buildDetailedPrompts({ phrase: "p", context: "c", sourceLanguage: "", translationLanguage: "fa", learningLanguage: "de" });
    expect(systemPrompt).toMatch(/separable verbs/);
    expect(systemPrompt).toMatch(/"lemma"/);
    expect(systemPrompt).toMatch(/"acceptedAnswers"/);
    expect(buildAdvicePrompt({ phrase: "p", context: "c", message: "m", translationLanguage: "fa", sourceLanguage: "lt" })).toMatch(/case government/);
  });

  it("has chunk guidance for all seven launch languages", () => {
    for (const code of ["en", "es", "de", "fr", "it", "sv", "lt"]) expect(hasChunkHints(code)).toBe(true);
    expect(chunkHintsFor("pt")).toMatch(/Portuguese/);
  });
});

describe("ChunkSchema", () => {
  it("accepts the new chunk types and the cue fields", () => {
    for (const type of CHUNK_TYPES) {
      expect(() =>
        ChunkSchema.parse({ text: "fängt an", type, definition: "d", transliteration: "t", confidence: 0.8, lemma: "anfangen", form: "present", acceptedAnswers: ["fängt an"] })
      ).not.toThrow();
    }
  });
});
