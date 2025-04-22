// Re-export types from the schema file
export type {
  LanguageLearningData,
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
