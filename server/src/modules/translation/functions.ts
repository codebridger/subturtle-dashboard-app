import { defineFunction } from "@modular-rest/server";
import { getDetailedTranslation, getSimpleTranslation } from "./service";
import { TranslateWithContextParams } from "./types";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

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
      sourceLanguage = "",
      targetLanguage = "",
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

interface TextToSpeechParams {
  text: string;
  languageCode?: string;
  voiceName?: string;
  speakingRate?: number;
}

/**
 * Function to convert text to speech using Google Cloud TTS
 * Returns audio content in base64 format
 */
const textToSpeech = defineFunction({
  name: "textToSpeech",
  permissionTypes: ["anonymous_access"],
  callback: async (params: TextToSpeechParams) => {
    const {
      text,
      languageCode = "en-US",
      voiceName = "en-US-Standard-A",
      speakingRate = 1.0,
    } = params;

    try {
      const client = new TextToSpeechClient();

      const request = {
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate,
        },
      };

      const [response] = await client.synthesizeSpeech(request);
      return {
        audioContent: response.audioContent.toString("base64"),
      };
    } catch (error: unknown) {
      console.error("Text-to-speech error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert text to speech: ${errorMessage}`);
    }
  },
});

export const functions = [translateWithContext, textToSpeech];
