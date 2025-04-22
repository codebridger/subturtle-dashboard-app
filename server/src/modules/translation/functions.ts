import { defineFunction } from "@modular-rest/server";
import { getDetailedTranslation, getSimpleTranslation } from "./service";
import { TranslateWithContextParams } from "./types";

/**
 * Function to translate a phrase with its context
 * Uses OpenRouter to generate linguistic data in the required schema format
 */
const translateWithContext = defineFunction({
  name: "translateWithContext",
  permissionTypes: ["anonymous_access"],
  callback: async (params: TranslateWithContextParams) => {
    // Extract parameters
    const {
      phrase,
      context,
      translationType = "simple",
      sourceLanguage = "en",
      targetLanguage = "fa",
    } = params;

    try {
      if (translationType === "detailed") {
        return getDetailedTranslation({
          phrase,
          context,
          sourceLanguage,
          targetLanguage,
        });
      }

      return getSimpleTranslation({
        phrase,
        context,
        sourceLanguage,
        targetLanguage,
      });
    } catch (error: unknown) {
      console.error("Translation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to translate text: ${errorMessage}`);
    }
  },
});

export const functions = [translateWithContext];
