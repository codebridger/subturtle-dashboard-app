/**
 * Schema definitions for language learning data
 * Uses Zod for schema validation and type generation
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CHUNK_TYPES } from "./language-hints";

// A reusable language pattern detected inside the user's selection.
export const ChunkSchema = z.object({
  text: z
    .string()
    .describe("The exact reusable pattern as it appears in the selection."),
  type: z
    .enum(CHUNK_TYPES)
    .describe("Kind of reusable language pattern (pick the one that fits the selection's language)."),
  definition: z
    .string()
    .describe(
      "A short, self-contained explanation of THIS chunk's meaning and how it is used, written in the target language (1-2 sentences)."
    ),
  transliteration: z
    .string()
    .describe(
      "How to pronounce THIS chunk (the source-language text above), spelled out using the TARGET language's alphabet. Example with source=English, target=Persian: 'in fact' -> 'این فَکت', 'powers over' -> 'پاورز اوور'."
    ),
  confidence: z
    .number()
    .describe("Model confidence that this is a useful learnable chunk (0-1)."),
  lemma: z
    .string()
    .describe(
      "The dictionary form of the chunk in its own language: the infinitive for a verb (with its reflexive pronoun or separable prefix), a noun with its article. The same as text when text is already the dictionary form."
    ),
  form: z
    .string()
    .describe(
      "A short English label for the form used in the text, e.g. 'past tense, 3rd person singular' or 'dative plural'. Empty when it is the dictionary form."
    ),
  acceptedAnswers: z
    .array(z.string())
    .describe(
      "Every answer that is correct for a fill-in-the-gap on this chunk in this sentence, the exact text first, then only true variants (contractions and their full forms, other correct spellings). Never other forms or synonyms."
    ),
});

// Define the LinguisticData schema
const LinguisticDataSchema = z.object({
  isValid: z.boolean().describe("Whether the text is valid for translation"),
  type: z
    .string()
    .describe(
      "Classification of the text (noun, verb, idiom, phrasal verb, expression, etc.)"
    ),
  definition: z
    .string()
    .describe(
      "Comprehensive explanation of meaning in the target language, including usage examples, cultural context, and nuances specific to the target language"
    ),

  phonetic: z
    .object({
      transliteration: z
        .string()
        .describe(
          "Pronunciation of the SOURCE-language phrase (the user's exact selection), spelled out using the TARGET language's alphabet. This is NOT a transliteration of the translation. Example with source=English, target=Persian: 'box' -> 'باکس', 'in fact' -> 'این فَکت'. Return an empty string for long selections (~5 words or more)."
        ),
    })
    .describe(
      "How to pronounce the source phrase, written in the target language alphabet"
    ),
  formality_level: z
    .enum(["formal", "neutral", "informal"])
    .describe("Indication of formality level"),
});

// Define the LanguageLearningData schema
export const LanguageLearningDataSchema = z.object({
  chunks: z
    .array(ChunkSchema)
    .describe(
      "Reusable language patterns found inside the user's selection, in the selection's own language. At most one chunk per 5-8 words of selection, hard ceiling of 2. Return an empty array for selections under ~5 words."
    ),
  direction: z
    .object({
      source: z.enum(["ltr", "rtl"]),
      target: z.enum(["ltr", "rtl"]),
    })
    .describe("Text direction information for source and target languages"),

  translation: z
    .object({
      phrase: z
        .string()
        .describe("Translation of the provided phrase by context"),
      // context: z.string().describe("Translation of the context"),
    })
    .describe("Translations of the provided phrase and context"),
  language_info: z
    .object({
      source: z
        .string()
        .describe("ISO 639-1 code of the language the selection is written in (detected from the text), e.g. 'de'"),
      target: z.string().describe("ISO 639-1 code of the language of the translation, e.g. 'fa'"),
    })
    .describe("Language information"),
  linguistic_data: LinguisticDataSchema.describe(
    "Linguistic analysis data in target language"
  ),
});

// Type inference from Zod schemas
export type Chunk = z.infer<typeof ChunkSchema>;
export type LinguisticData = z.infer<typeof LinguisticDataSchema>;
export type DetailedPhraseDataType = z.infer<typeof LanguageLearningDataSchema>;

// Simple translation when the caller asks for the language too (`withLanguage`, B-14).
export const SimpleTranslationSchema = z.object({
  translation: z.string().describe("The translation of the phrase, by its context"),
  source: z
    .string()
    .describe("ISO 639-1 code of the language the phrase is written in (detected from the text), e.g. 'de'"),
});

export type SimpleTranslationType = z.infer<typeof SimpleTranslationSchema>;

// Advisor response: the model either replies with text or returns updated chunks.
export const TranslationAdviceSchema = z.object({
  reply: z
    .string()
    .optional()
    .describe(
      "A short plain-text answer to the user's question. Set this when the user asked for an explanation or advice rather than a change to the highlighted patterns."
    ),
  chunks: z
    .array(ChunkSchema)
    .optional()
    .describe(
      "Updated reusable patterns. Set this only when the user asked to change which patterns are highlighted. Same cap rules as the save flow apply."
    ),
});

export type TranslationAdviceType = z.infer<typeof TranslationAdviceSchema>;

/**
 * Get the JSON schema for language learning data
 * Converts the Zod schema to a JSON Schema for use with OpenRouter's structured output
 * @returns The complete schema object for language learning data
 */
export function getLanguageLearningSchema() {
  return zodToJsonSchema(LanguageLearningDataSchema, {
    target: "openApi3",
    $refStrategy: "none",
  });
}

/**
 * Validate language learning data against the schema
 * @param data The data to validate
 * @returns Validated and parsed data, or throws an error if invalid
 */
export function validateLanguageLearningData(
  data: any
): DetailedPhraseDataType {
  return LanguageLearningDataSchema.parse(data);
}
