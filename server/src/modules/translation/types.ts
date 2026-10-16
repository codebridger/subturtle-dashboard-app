// Re-export types from the schema file
export type {
  DetailedPhraseDataType,
  LinguisticData,
  Chunk,
  TranslationAdviceType,
  SimpleTranslationType,
} from "./schema";

import type { Chunk } from "./schema";

// Function parameter types
export interface TranslateWithContextParams {
  phrase: string;
  context: string;
  /** The selection's language when the client knows it; "" or "auto" lets the model detect it. */
  sourceLanguage?: string;
  /** The learner's own language: the language of the translation (B-17). */
  translationLanguage?: string;
  /** @deprecated Old name of `translationLanguage`; still read, and counted (B-17). */
  targetLanguage?: string;
  /** The learning language the request is about; missing means the learner's active one. */
  language?: string;
  translationType?: "simple" | "detailed";
  /**
   * Simple mode only: return `{ translation, detectedLanguage, resolvedLanguage, inProfile }`
   * instead of the bare translation string. Old clients leave it out and keep the string.
   */
  withLanguage?: boolean;
  // Caller's user id — used for the translation_requested analytics event and to read the
  // learner's languages (inProfile, resolvedLanguage). Anonymous sessions may omit it.
  userId?: string;
  /**
   * The client's install analytics id (the extension's `analyticsAnonymousId`, a UUID).
   * A logged-out caller's analytics events are filed on it (B-01). Old clients leave it out.
   */
  deviceId?: string;
}

export interface TranslationAdviceMessage {
  role: "user" | "assistant";
  text: string;
}

export interface TranslationAdviceParams {
  phrase: string;
  context: string;
  message: string;
  currentChunks?: Chunk[];
  history?: TranslationAdviceMessage[];
  sourceLanguage?: string;
  translationLanguage?: string;
  /** @deprecated Old name of `translationLanguage` (B-17). */
  targetLanguage?: string;
  learningLanguage?: string;
}
