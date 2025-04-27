import { openRouter } from "../../utils/openrouter";
import { DetailedPhraseDataType, TranslateWithContextParams } from "./types";
import { LanguageLearningDataSchema } from "./schema";

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
  const systemPrompt = `As a language learning specialist, Translation of the provided phrase by context, return translation only`;

  const userPrompt = `
  from ${sourceLanguage} to ${targetLanguage}:
  context: "${context}"
  Phrase: "${phrase}"
  `;

  try {
    const response = await openRouter.createChatCompletion({
      models: [
        // Accepted models
        "google/gemini-2.5-flash-preview", // 1m context, $0.15/M input, $0.60/M output
        "google/gemini-flash-1.5-8b", // 1m context, $0.038/M input, $0.15/M output
        "openai/gpt-4.1-nano", // 1m context, $0.10/M input, $0.40/M output
      ],
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
      temperature: 0,
      max_tokens: 200,
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
}: TranslateWithContextParams): Promise<DetailedPhraseDataType> {
  // Create prompt for OpenRouter
  const systemPrompt = `
  As a language learning specialist, take the "phrase" and "context", and provide all descriptive fields in the mentioned target language. 
  all grammart, cultural, and usage notes must be about the source language.
  dont forget to use original source language terms in the notes when needed.`;

  const userPrompt = `
  Translate from ${sourceLanguage} to ${targetLanguage}:
  Phrase: "${phrase}"
  Accuracy context: "${context}"`;

  try {
    // Use the Zod schema directly with the OpenRouter service
    const result =
      await openRouter.createStructuredOutputWithZod<DetailedPhraseDataType>({
        options: {
          models: [
            // Accepted models
            "google/gemini-2.5-flash-preview", // 1m context, $0.15/M input, $0.60/M output
            "google/gemini-flash-1.5-8b", // 1m context, $0.038/M input, $0.15/M output
            "openai/gpt-4.1-nano", // 1m context, $0.10/M input, $0.40/M output
          ],
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
          temperature: 0,
          max_tokens: 700,
          provider: {
            require_parameters: true,
          },
        },
        zodSchema: LanguageLearningDataSchema, // Pass the Zod schema directly
        schemaName: "language_learning_data",
        strict: true,
      });

    // Result is already validated by Zod
    return result;
  } catch (error: unknown) {
    console.error("Detailed translation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to translate text: ${errorMessage}`);
  }
}
