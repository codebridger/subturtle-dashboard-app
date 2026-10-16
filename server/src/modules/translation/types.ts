// Re-export types from the schema file
export type {
  DetailedPhraseDataType,
  LinguisticData,
  Chunk,
  TranslationAdviceType,
} from "./schema";

import type { Chunk } from "./schema";

// Function parameter types
export interface TranslateWithContextParams {
  phrase: string;
  context: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  translationType?: "simple" | "detailed";
  // Caller's user id — only used for the translation_requested analytics
  // event. Anonymous sessions may omit it.
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
  targetLanguage?: string;
}
