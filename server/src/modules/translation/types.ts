// Re-export types from the schema file
export type {
  DetailedPhraseDataType,
  LinguisticData,
  Example,
  RelatedExpression,
} from "./schema";

// Function parameter types
export interface TranslateWithContextParams {
  phrase: string;
  context: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  translationType?: "simple" | "detailed";
}
