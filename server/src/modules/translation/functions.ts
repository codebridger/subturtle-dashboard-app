import { defineFunction } from "@modular-rest/server";
import {
  getDetailedTranslation,
  getSimpleTranslation,
  getTranslationAdvice,
} from "./service";
import { TranslateWithContextParams, TranslationAdviceParams } from "./types";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { synthesizeSpeech } from "./tts";
import {
  trackServerEvent,
  SERVER_ANALYTICS_EVENTS,
} from "../../utils/analytics";
import { isAutoOrUnknown, toCode } from "../../languages/helper";
import { loadLearnerLanguages, readTranslationLanguage, resolveLanguage } from "./language";

/**
 * Translate a phrase with its context (B-14, B-15, B-17).
 *
 * - The own language comes from `translationLanguage`, or the old `targetLanguage`.
 * - The learning language (`language`, else the learner's active one) is sent to the
 *   prompt, so an "auto" source no longer reads "from  to Persian".
 * - Detailed mode returns the full data plus `detectedLanguage`, `resolvedLanguage` and
 *   `inProfile`. Simple mode keeps returning the bare translation string unless the caller
 *   sends `withLanguage: true`; then it returns `{ translation, detectedLanguage,
 *   resolvedLanguage, inProfile }`.
 */
const translateWithContext = defineFunction({
  name: "translateWithContext",
  permissionTypes: ["anonymous_access"],
  callback: async (params: TranslateWithContextParams) => {
    const { phrase, context, translationType = "simple" } = params;

    // "auto" (or nothing) lets the model detect the language.
    let sourceLanguage = typeof params.sourceLanguage === "string" ? params.sourceLanguage.trim() : "";
    if (isAutoOrUnknown(sourceLanguage)) sourceLanguage = "";

    const own = readTranslationLanguage(params, "translateWithContext");
    const learner = await loadLearnerLanguages(params.userId);
    const requested = toCode(params.language);
    // A `language` the learner has stands in for the active one in the resolution.
    const scope = requested && learner.languages.includes(requested) ? { ...learner, active: requested } : learner;
    const learningLanguage = requested ?? learner.active ?? undefined;

    // Server-truth usage event (docs/metrics: Backend Tracking Plan). Fired on
    // every request, before the call, so failures are counted too — the error
    // rate is word-detail-page_translation-error / translation_requested.
    trackServerEvent(
      SERVER_ANALYTICS_EVENTS.TRANSLATION_REQUESTED,
      params.userId || "anonymous",
      {
        translation_type: translationType,
        source_lang: sourceLanguage || "auto",
        target_lang: own.value,
        learning_lang: learningLanguage || "unknown",
        legacy_target_language: own.usedOldName,
      }
    );

    const languages = {
      sourceLanguage,
      translationLanguage: own.value,
      learningLanguage,
    };

    try {
      if (translationType === "detailed") {
        const result = await getDetailedTranslation({ phrase, context, ...languages });
        const detected = result?.language_info?.source || sourceLanguage;
        return { ...result, ...resolveLanguage(detected, scope) };
      }

      if (params.withLanguage === true) {
        const result = await getSimpleTranslation({ phrase, context, ...languages, withLanguage: true });
        return {
          translation: result?.translation ?? "",
          ...resolveLanguage(result?.source || sourceLanguage, scope),
        };
      }

      return await getSimpleTranslation({ phrase, context, ...languages });
    } catch (error: unknown) {
      console.error("Translation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.startsWith("Failed to translate text")) throw error;
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
      const audio = await synthesizeSpeech({ text, languageCode, voiceName, speakingRate });
      const audioContentBase64 = audio.toString("base64");
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

/**
 * Conversational advisor for the save modal's "fix this?" chat.
 * Returns either { reply } text or { chunks } updated patterns.
 */
const translationAdvice = defineFunction({
  name: "translationAdvice",
  permissionTypes: ["anonymous_access"],
  callback: async (params: TranslationAdviceParams) => {
    const { phrase, context, message } = params;

    if (!message || typeof message !== "string") {
      throw new Error("message is required");
    }

    try {
      const own = readTranslationLanguage(params, "translationAdvice");
      return await getTranslationAdvice({
        phrase,
        context,
        message,
        currentChunks: params.currentChunks,
        history: params.history,
        sourceLanguage: params.sourceLanguage,
        translationLanguage: own.value,
        learningLanguage: toCode(params.learningLanguage),
      });
    } catch (error: unknown) {
      console.error("Translation advice error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get translation advice: ${errorMessage}`);
    }
  },
});

export const functions = [
  translateWithContext,
  textToSpeech,
  listVoices,
  translationAdvice,
];
