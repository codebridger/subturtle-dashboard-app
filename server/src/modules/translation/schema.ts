/**
 * Schema definitions for language learning data
 * Uses Zod for schema validation and type generation
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Define the Example schema
const ExampleSchema = z.object({
  source: z.string(),
  target: z.string(),
});

// Define the RelatedExpression schema
const RelatedExpressionSchema = z.object({
  source: z.string(),
  target: z.string(),
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
      "Clear explanation of meaning, contextualized to usage based on provided context"
    ),
  // usage_notes: z
  //   .string()
  //   .describe("Information about how and when to use this text"),
  pronunciation: z
    .string()
    .describe("Phonetic guidance (especially for non-Latin script languages)"),
  formality_level: z
    .enum(["formal", "neutral", "informal"])
    .describe("Indication of formality level"),
  // literal_translation: z
  //   .string()
  //   .describe(
  //     "When the literal meaning differs significantly from idiomatic usage"
  //   ),
  // cultural_notes: z
  //   .string()
  //   .describe(
  //     "cultural context explanation about the source language, written in target language but allowed to use source language terms"
  //   ),
  // grammar_notes: z
  //   .string()
  //   .describe(
  //     "grammar rules and usage explanation about the source language, written in target language but allowed to use source language terms"
  //   ),
  examples: z
    .array(ExampleSchema)
    .describe("Example of phrase usage in source language, with translation"),
  // related_expressions: z
  //   .array(RelatedExpressionSchema)
  //   .describe(
  //     "Similar or connected expressions in source language, with translations"
  //   ),
});

// Define the LanguageLearningData schema
export const LanguageLearningDataSchema = z.object({
  actual_phrase: z
    .string()
    .describe(
      "detected correct combination of words from the context which could have complete meaning."
    ),
  direction: z
    .object({
      source: z.enum(["ltr", "rtl"]),
      target: z.enum(["ltr", "rtl"]),
    })
    .describe("Text direction information for source and target languages"),

  translation: z
    .object({
      phrase: z.string().describe("Translation of the provided phrase"),
      context: z.string().describe("Translation of the context"),
    })
    .describe("Translations of the provided phrase and context"),
  language_info: z
    .object({
      source: z.string().describe("Source language code"),
      target: z.string().describe("Target language code"),
    })
    .describe("Language information"),
  linguistic_data: LinguisticDataSchema.describe(
    "Linguistic analysis data in target language"
  ),
});

// Type inference from Zod schemas
export type Example = z.infer<typeof ExampleSchema>;
export type RelatedExpression = z.infer<typeof RelatedExpressionSchema>;
export type LinguisticData = z.infer<typeof LinguisticDataSchema>;
export type DetailedPhraseDataType = z.infer<typeof LanguageLearningDataSchema>;

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
