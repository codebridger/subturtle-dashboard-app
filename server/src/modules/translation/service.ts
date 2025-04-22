import { openRouter, OPENROUTER_MODELS } from "../../utils/openrouter";
import { LanguageLearningData, TranslateWithContextParams } from "./types";
import {
  LanguageLearningDataSchema,
  SimpleTranslation,
  SimpleTranslationSchema,
} from "./schema";

/**
 * Get a simple translation of a phrase with context
 * This provides basic translation functionality without detailed linguistic analysis
 * @param params The translation parameters
 * @returns Promise with simple translation data
 */
export async function getSimpleTranslation({
  phrase,
  context,
  sourceLanguage = "en",
  targetLanguage,
}: {
  phrase: string;
  context: string;
  sourceLanguage?: string;
  targetLanguage: string;
}) {
  const systemPrompt = `You are a professional translator. return the translation only in the target language.`;

  const userPrompt = `
  Source language: ${sourceLanguage}
  Target language: ${targetLanguage}:
  
  Phrase: "${phrase}"
  Context: "${context}"`;

  try {
    const response = await openRouter.createChatCompletion({
      models: OPENROUTER_MODELS.TRANSLATION_MODELS,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return response.choices[0].message.content;
  } catch (error: unknown) {
    console.error("Simple translation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to translate text: ${errorMessage}`);
  }
}

/**
 * Get a detailed translation of a phrase with comprehensive linguistic analysis
 * This is the main translation function that provides the full language learning data
 * @param params The translation parameters
 * @returns Promise with detailed language learning data
 */
export async function getDetailedTranslation({
  phrase,
  context,
  sourceLanguage = "en",
  targetLanguage,
}: TranslateWithContextParams): Promise<LanguageLearningData> {
  // Create prompt for OpenRouter
  const systemPrompt = `You are a language learning AI that analyzes and translates text.
  take the "phrase" and "context", and provide all descriptive filds in the mentioned target language.`;

  const userPrompt = `
  Analyze and translate this marked phrase within its context:
  
  Marked phrase: "${phrase}"
  Context: "${context}"
  Source language: ${sourceLanguage}
  Target language: ${targetLanguage}`;

  try {
    // Use the Zod schema directly with the OpenRouter service
    const result =
      await openRouter.createStructuredOutputWithZod<LanguageLearningData>({
        options: {
          models: OPENROUTER_MODELS.TRANSLATION_MODELS, // Use a model that supports structured outputs
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.2, // Low temperature for more consistent outputs
        },
        zodSchema: LanguageLearningDataSchema, // Pass the Zod schema directly
        schemaName: "language_learning_data",
        strict: true, // Strict mode enabled
      });

    // Result is already validated by Zod
    return result;
  } catch (error: unknown) {
    console.error("Detailed translation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to translate text: ${errorMessage}`);
  }
}
