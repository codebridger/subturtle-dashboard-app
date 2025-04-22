import { defineFunction } from "@modular-rest/server";
import { LanguageLearningData, TranslateWithContextParams } from "./types";
import { openRouter, OPENROUTER_MODELS } from "../../utils/openrouter";
import { LanguageLearningDataSchema } from "./schema";

/**
 * Function to translate a phrase with its context
 * Uses OpenRouter to generate linguistic data in the required schema format
 */
const translateWithContext = defineFunction({
  name: "translateWithContext",
  permissionTypes: ["anonymous_access"],
  callback: async (
    params: TranslateWithContextParams
  ): Promise<LanguageLearningData> => {
    // Extract parameters
    const {
      phrase,
      context,
      sourceLanguage = "en",
      targetLanguage = "fa",
    } = params;

    // Create prompt for OpenRouter
    const systemPrompt = `You are a language learning AI that analyzes and translates text.
    Take the marked phrase from the context and provide a detailed analysis following the provided JSON schema structure.
    Ensure your response follows the schema exactly and contains all required fields.`;

    const userPrompt = `
    Analyze and translate this marked phrase within its context:
    
    Marked phrase: "${phrase}"
    Context: "${context}"
    Source language: ${sourceLanguage}
    Target language: ${targetLanguage}`;

    try {
      // Use the Zod schema directly with the new method
      const result =
        await openRouter.createStructuredOutputWithZod<LanguageLearningData>(
          {
            model: OPENROUTER_MODELS.TRANSLATION, // Use a model that supports structured outputs
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
            max_tokens: 2000,
          },
          LanguageLearningDataSchema, // Pass the Zod schema directly
          "language_learning_data",
          true // Strict mode enabled
        );

      // Result is already validated by Zod
      return result;
    } catch (error: unknown) {
      console.error("Translation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to translate text: ${errorMessage}`);
    }
  },
});

export const functions = [translateWithContext];
