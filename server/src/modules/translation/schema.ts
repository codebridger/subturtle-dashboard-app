/**
 * Schema definitions for language learning data
 * Uses Zod for schema validation and type generation
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Define the Example schema
const ExampleSchema = z.object({
  example: z.string().describe("Example sentence showing the text in use"),
  translation: z.string().describe("Translation of the example sentence"),
});

// Define the RelatedExpression schema
const RelatedExpressionSchema = z.object({
  text: z.string().describe("Related word or expression"),
  translation: z.string().describe("Translation of the related expression"),
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
    .describe("Clear explanation of meaning, contextualized to usage"),
  usage_notes: z
    .string()
    .describe("Information about how and when to use this text"),
  pronunciation: z
    .string()
    .describe("Phonetic guidance (especially for non-Latin script languages)"),
  formality_level: z
    .enum(["formal", "neutral", "informal"])
    .describe("Indication of formality level"),
  literal_translation: z
    .string()
    .describe(
      "When the literal meaning differs significantly from idiomatic usage"
    ),
  cultural_notes: z
    .string()
    .describe("Cultural context important for proper understanding"),
  grammar_notes: z
    .string()
    .describe("Additional grammatical information when relevant"),
  examples: z
    .array(ExampleSchema)
    .describe("Example sentences showing the text in use, with translations"),
  related_expressions: z
    .array(RelatedExpressionSchema)
    .describe("Similar or connected expressions with translations"),
});

// Define the LanguageLearningData schema
export const LanguageLearningDataSchema = z.object({
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
