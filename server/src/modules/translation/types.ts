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
  pageTitle?: string;
  pageUrl?: string;
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
