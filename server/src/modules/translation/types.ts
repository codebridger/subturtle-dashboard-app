// Type definitions for language learning data
export interface LanguageLearningData {
  marked_text: string;
  context: string;
  translation: {
    marked_text: string;
    context: string;
  };
  language_info: {
    source: string;
    target: string;
  };
  linguistic_data: LinguisticData;
}

export interface LinguisticData {
  type: string; // "noun", "verb", "idiom", "phrasal verb", "expression", etc.
  definition: string;
  usage_notes?: string;
  pronunciation?: string;
  formality_level?: "formal" | "neutral" | "informal";
  literal_translation?: string;
  cultural_notes?: string;
  grammar_notes?: string;
  examples: Example[];
  related_expressions?: RelatedExpression[];
}

export interface Example {
  example: string;
  translation: string;
}

export interface RelatedExpression {
  text: string;
  translation: string;
}

// Function parameter types
export interface TranslateWithContextParams {
  phrase: string;
  context: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}
