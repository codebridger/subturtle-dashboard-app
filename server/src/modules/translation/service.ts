import { openRouter } from "../../utils/openrouter";
import {
  DetailedPhraseDataType,
  TranslateWithContextParams,
  TranslationAdviceParams,
  TranslationAdviceType,
} from "./types";
import {
  LanguageLearningDataSchema,
  TranslationAdviceSchema,
} from "./schema";

/**
 * Get a simple translation of a phrase with context
 * This provides basic translation functionality without detailed linguistic analysis
 * @param params The translation parameters
 * @returns Promise with simple translation data
 */
export async function getSimpleTranslation({
  phrase,
  context,
  sourceLanguage = "en",
  targetLanguage,
}: {
  phrase: string;
  context: string;
  sourceLanguage?: string;
  targetLanguage: string;
}) {
  const systemPrompt = `As a language learning specialist, Translation of the provided phrase by context, return translation only`;

  const userPrompt = `
  from ${sourceLanguage} to ${targetLanguage}:
  context: "${context}"
  Phrase: "${phrase}"
  `;

  try {
    const response = await openRouter.createChatCompletion({
      models: [
        // Accepted models
        "google/gemini-2.5-flash-lite", // 1.05M context, $0.10/M input, $0.40/M output
        "google/gemini-2.5-flash", // 1m context, $0.15/M input, $0.60/M output
        "google/gemini-flash-1.5-8b", // 1m context, $0.038/M input, $0.15/M output
        // "openai/gpt-4.1-nano", // 1m context, $0.10/M input, $0.40/M output
      ],
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    return response.choices[0].message.content;
  } catch (error: unknown) {
    console.error("Simple translation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to translate text: ${errorMessage}`);
  }
}

/**
 * Get a detailed translation of a phrase with comprehensive linguistic analysis
 * This is the main translation function that provides the full language learning data
 * @param params The translation parameters
 * @returns Promise with detailed language learning data
 */
export async function getDetailedTranslation({
  phrase,
  context,
  sourceLanguage = "en",
  targetLanguage,
  pageTitle,
  pageUrl,
}: TranslateWithContextParams): Promise<DetailedPhraseDataType> {
  // Create prompt for OpenRouter
  const systemPrompt = `
  As a language learning specialist, take the "phrase" and "context", and provide all descriptive fields in the mentioned target language.
  all grammart, cultural, and usage notes must be about the source language.
  dont forget to use original source language terms in the notes when needed.

  Phonetic transliteration: spell out how to pronounce the SOURCE-language "phrase" itself (${sourceLanguage} -> read by a ${targetLanguage} speaker), written using the ${targetLanguage} alphabet. Do NOT transliterate the translation. For long selections (~5 words or more), return an empty string for the top-level transliteration and rely on the per-chunk transliterations instead.

  Chunks: inside the user's selection ("phrase"), find the reusable language patterns worth learning (collocations, phrasal verbs, idioms, discourse markers).
  Rules: at most one chunk per 5-8 words of the selection, hard ceiling of 2 chunks. Each chunk's "text" must appear verbatim inside the selection. For each chunk, also provide its own "transliteration": how to pronounce that chunk (source language) written in the ${targetLanguage} alphabet.
  Return an empty "chunks" array when the selection is under ~5 words, or when the selection is written in a different language than the target learning language.
  ${
    pageTitle
      ? `Bundle name: also produce "suggested_bundle_name" - a short, clean name derived from the page title that generalises across multiple episodes/chapters/articles from the same source (e.g. "Stranger Things S2E5 — Netflix" -> "Stranger Things S2").`
      : `Do not set "suggested_bundle_name".`
  }`;

  const userPrompt = `
  Translate from ${sourceLanguage} to ${targetLanguage}:
  Phrase: "${phrase}"
  Accuracy context: "${context}"${
    pageTitle ? `\n  Page title: "${pageTitle}"` : ""
  }${pageUrl ? `\n  Page URL: "${pageUrl}"` : ""}`;

  try {
    // Use the Zod schema directly with the OpenRouter service
    const result =
      await openRouter.createStructuredOutputWithZod<DetailedPhraseDataType>({
        options: {
          models: [
            // Accepted models
            "google/gemini-2.5-flash-lite", // 1.05M context, $0.10/M input, $0.40/M output
            "google/gemini-2.5-flash", // 1m context, $0.15/M input, $0.60/M output
            "google/gemini-flash-1.5-8b", // 1m context, $0.038/M input, $0.15/M output
            // "openai/gpt-4.1-nano", // 1m context, $0.10/M input, $0.40/M output
          ],
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0,
          max_tokens: 700,
        },
        zodSchema: LanguageLearningDataSchema, // Pass the Zod schema directly
        schemaName: "language_learning_data",
        strict: true,
      });

    // Result is already validated by Zod
    return result;
  } catch (error: unknown) {
    console.error("Detailed translation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to translate text: ${errorMessage}`);
  }
}

/**
 * Conversational advisor for the save modal's "fix this?" chat.
 * Given the user's message and the current selection/context (+ current chunks),
 * the model either replies with plain text or returns an updated chunks list.
 */
export async function getTranslationAdvice({
  phrase,
  context,
  message,
  currentChunks = [],
  history = [],
  sourceLanguage = "en",
  targetLanguage,
}: TranslationAdviceParams): Promise<TranslationAdviceType> {
  const systemPrompt = `
  You are a friendly language tutor helping the user understand a phrase they are learning.
  The selection language is ${sourceLanguage}; reply in ${targetLanguage}.
  Selection: "${phrase}"
  Context: "${context}"
  Currently highlighted patterns (chunks): ${JSON.stringify(currentChunks)}

  Your MAIN job is to answer the user's questions about this phrase: meaning, grammar, usage, nuance, examples, differences between words, etc. Put your answer in "reply".

  Editing the highlighted patterns is a SECONDARY ability. Only return a "chunks" array when the user EXPLICITLY asks to add, remove, or change which patterns are highlighted (e.g. "highlight X", "remove that", "don't include Y"). When you do, each chunk's "text" must appear verbatim in the selection, include its "transliteration" (pronunciation in the ${targetLanguage} alphabet), and you may also add a short "reply" explaining the change.
  If the user is just asking a question (even one that mentions a phrase, like "what about 'on the'?"), answer it in "reply" and DO NOT change the chunks.`;

  // Maintain the conversation: replay prior turns so the model has context.
  const historyMessages = (history || [])
    .filter((m) => m && m.text)
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as
        | "assistant"
        | "user",
      content: m.text,
    }));

  try {
    const result =
      await openRouter.createStructuredOutputWithZod<TranslationAdviceType>({
        options: {
          models: [
            "google/gemini-2.5-flash-lite",
            "google/gemini-2.5-flash",
            "google/gemini-flash-1.5-8b",
          ],
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: message },
          ],
          temperature: 0,
          max_tokens: 400,
        },
        zodSchema: TranslationAdviceSchema,
        schemaName: "translation_advice",
        strict: true,
      });

    return result;
  } catch (error: unknown) {
    console.error("Translation advice error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get translation advice: ${errorMessage}`);
  }
}
