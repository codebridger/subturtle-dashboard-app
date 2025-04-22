import { defineFunction } from "@modular-rest/server";
import { LanguageLearningData, TranslateWithContextParams } from "./types";
import { openRouter, OPENROUTER_MODELS } from "../../utils/openrouter";

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
    Take the marked phrase from the context and provide a detailed analysis in JSON format.
    Follow EXACTLY this structure for your response:
    {
      "marked_text": "<the marked phrase>",
      "context": "<the context provided>",
      "translation": {
        "marked_text": "<translation of the marked phrase>",
        "context": "<translation of the context>"
      },
      "language_info": {
        "source": "<source language code>",
        "target": "<target language code>"
      },
      "linguistic_data": {
        "type": "<grammatical type>",
        "definition": "<definition in context>",
        "usage_notes": "<notes on usage>",
        "pronunciation": "<pronunciation guide if relevant>",
        "formality_level": "<formal/neutral/informal>",
        "literal_translation": "<literal translation if relevant>",
        "cultural_notes": "<cultural context if relevant>",
        "grammar_notes": "<grammar notes if relevant>",
        "examples": [
          {
            "example": "<example sentence 1>",
            "translation": "<translation of example 1>"
          },
          {
            "example": "<example sentence 2>",
            "translation": "<translation of example 2>"
          }
        ],
        "related_expressions": [
          {
            "text": "<related word/phrase 1>",
            "translation": "<translation of related 1>"
          },
          {
            "text": "<related word/phrase 2>",
            "translation": "<translation of related 2>"
          }
        ]
      }
    }
    
    Ensure that your response is a valid JSON object and includes ALL required fields.
    Optional fields should be included when relevant for learning.`;

    const userPrompt = `
    Marked phrase: "${phrase}"
    Context: "${context}"
    Source language: ${sourceLanguage}
    Target language: ${targetLanguage}
    
    Provide a complete language learning analysis JSON for this phrase in context.`;

    try {
      // Use the OpenRouter service to make the API call
      const response = await openRouter.createChatCompletion({
        model: OPENROUTER_MODELS.TRANSLATION,
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
      });

      // Parse LLM response using the helper method from the service
      try {
        const content = response.choices[0].message.content;
        const result =
          openRouter.extractJsonFromResponse<LanguageLearningData>(content);

        // Validate essential fields
        // if (
        //   !result.marked_text ||
        //   !result.context ||
        //   !result.translation ||
        //   !result.language_info ||
        //   !result.linguistic_data
        // ) {
        //   throw new Error(
        //     "Invalid response structure: missing required fields"
        //   );
        // }

        return result;
      } catch (parseError) {
        console.error("Failed to parse LLM response:", parseError);
        throw new Error("Failed to parse language data from LLM response");
      }
    } catch (error: unknown) {
      console.error("Translation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to translate text: ${errorMessage}`);
    }
  },
});

export const functions = [translateWithContext];
