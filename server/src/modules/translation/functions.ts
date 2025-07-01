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
    let {
      phrase,
      context,
      translationType = "simple",
      sourceLanguage = "",
      targetLanguage = "",
    } = params;

    // normalize the source language
    if (sourceLanguage.toLowerCase() === "auto") {
      sourceLanguage = "";
    }

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
  name: "textToSpeechBase64",
  permissionTypes: ["anonymous_access"],
  callback: async (params: TextToSpeechParams) => {
    const {
      text,
      languageCode = "en-US",
      voiceName = "en-US-Standard-A",
      speakingRate = 1.0,
    } = params;

    if (voiceName.includes("HD")) {
      throw new Error("HD voices are not supported");
    }

    try {
      const client = new TextToSpeechClient({
        apiKey: process.env.GCP_API_KEY,
      });

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

      const [response] = await client.synthesizeSpeech(request as any);

      if (!response.audioContent) {
        throw new Error("No audio content returned from TTS");
      }

      // Convert the audio content to base64 from (Uint8Array|string|null)
      let audioContentBase64: string;

      if (response.audioContent instanceof Uint8Array) {
        audioContentBase64 = Buffer.from(response.audioContent).toString(
          "base64"
        );
      } else if (typeof response.audioContent === "string") {
        audioContentBase64 = Buffer.from(
          response.audioContent,
          "binary"
        ).toString("base64");
      } else {
        throw new Error("Invalid audio content format");
      }

      return `data:audio/mp3;base64,${audioContentBase64}`;
    } catch (error: unknown) {
      console.error("Text-to-speech error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert text to speech: ${errorMessage}`);
    }
  },
});

interface ListVoicesParams {
  languageCode?: string;
}

/**
 * Function to list available voices from Google Cloud TTS
 * Returns array of voice objects with their properties
 */
const listVoices = defineFunction({
  name: "listVoices",
  permissionTypes: ["anonymous_access"],
  callback: async (params: ListVoicesParams = {}) => {
    const { languageCode } = params;

    try {
      const client = new TextToSpeechClient({
        apiKey: process.env.GCP_API_KEY,
      });

      const request = languageCode ? { languageCode } : {};
      const [result] = await client.listVoices(request);

      if (!result.voices) {
        throw new Error("No voices returned from TTS service");
      }

      const voices = result.voices.map((voice) => ({
        name: voice.name,
        ssmlGender: voice.ssmlGender,
        naturalSampleRateHertz: voice.naturalSampleRateHertz,
        languageCodes: voice.languageCodes || [],
      }));

      return {
        voices,
        count: voices.length,
      };
    } catch (error: unknown) {
      console.error("List voices error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list voices: ${errorMessage}`);
    }
  },
});

export const functions = [translateWithContext, textToSpeech, listVoices];
