import { openRouter } from "../../utils/openrouter";
import {
  DetailedPhraseDataType,
  SimpleTranslationType,
  TranslationAdviceParams,
  TranslationAdviceType,
} from "./types";
import {
  LanguageLearningDataSchema,
  SimpleTranslationSchema,
  TranslationAdviceSchema,
} from "./schema";
import { filterChunksToSelection } from "./chunk-filter";
import { completeCues } from "./chunk-cue";
import { CUE_RULES, chunkHintsFor } from "./language-hints";
import { TRANSLATION_MODELS } from "../../utils/openrouter-models";
import { isAutoOrUnknown, toCode, toTitle } from "../../languages/helper";

/**
 * The languages of one translation request.
 * - `sourceLanguage`: the language of the selection, when the client knows it. "" or "auto"
 *   means "detect it".
 * - `translationLanguage`: the learner's own language, the language of the translation and
 *   the notes. `targetLanguage` is its old name (B-17).
 * - `learningLanguage`: the learner's active learning language, a hint for detection and for
 *   which chunk patterns to look for (B-15).
 */
export interface TranslationLanguages {
  sourceLanguage?: string;
  translationLanguage?: string;
  /** @deprecated old name of `translationLanguage` (B-17). */
  targetLanguage?: string;
  learningLanguage?: string;
}

/** The English name for a prompt ("German"), or the raw value when we have no code for it. */
function promptName(value: unknown): string {
  if (isAutoOrUnknown(value)) return "";
  return toTitle(value) || String(value);
}

/**
 * How a prompt names the source language. Before B-15 an "auto" source became "" and the
 * prompt read "from  to Persian"; now the model is told to detect it, with the learning
 * language as the likely answer.
 */
export function describeSource(sourceLanguage: unknown, learningLanguage?: unknown): string {
  const source = promptName(sourceLanguage);
  if (source) return source;
  const learning = promptName(learningLanguage);
  return learning
    ? `the language the phrase is written in (detect it; the learner is studying ${learning}, so it is most likely ${learning})`
    : "the language the phrase is written in (detect it)";
}

/** The learner's own language for a prompt; English when the client sent none. */
export function describeTranslationLanguage(languages: TranslationLanguages): string {
  return promptName(languages.translationLanguage ?? languages.targetLanguage) || "English";
}

/** The language the chunk hints are for: the known source, else the learning language. */
function hintLanguage(languages: TranslationLanguages): string | undefined {
  return toCode(languages.sourceLanguage) ?? toCode(languages.learningLanguage);
}

/** The prompts for `getSimpleTranslation` (exported for tests). */
export function buildSimplePrompts(params: { phrase: string; context: string; withLanguage?: boolean } & TranslationLanguages) {
  const source = describeSource(params.sourceLanguage, params.learningLanguage);
  const target = describeTranslationLanguage(params);
  const systemPrompt = params.withLanguage
    ? `As a language learning specialist, translate the provided phrase by its context. Return the translation and the ISO 639-1 code of the language the phrase is written in.`
    : `As a language learning specialist, Translation of the provided phrase by context, return translation only`;
  const userPrompt = `
  from ${source} to ${target}:
  context: "${params.context}"
  Phrase: "${params.phrase}"
  `;
  return { systemPrompt, userPrompt };
}

/**
 * Get a simple translation of a phrase with context: the translation text only. With
 * `withLanguage`, the model also returns the detected language (B-14).
 */
export async function getSimpleTranslation(
  params: { phrase: string; context: string } & TranslationLanguages
): Promise<string | null>;
export async function getSimpleTranslation(
  params: { phrase: string; context: string; withLanguage: true } & TranslationLanguages
): Promise<SimpleTranslationType>;
export async function getSimpleTranslation(
  params: { phrase: string; context: string; withLanguage?: boolean } & TranslationLanguages
): Promise<string | null | SimpleTranslationType> {
  const { systemPrompt, userPrompt } = buildSimplePrompts(params);
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  try {
    if (params.withLanguage) {
      return await openRouter.createStructuredOutputWithZod<SimpleTranslationType>({
        options: { models: TRANSLATION_MODELS, messages, temperature: 0, max_tokens: 300 },
        zodSchema: SimpleTranslationSchema,
        schemaName: "simple_translation",
        strict: true,
      });
    }

    const response = await openRouter.createChatCompletion({
      models: TRANSLATION_MODELS,
      messages,
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

/** The prompts for `getDetailedTranslation` (exported for tests). */
export function buildDetailedPrompts(params: { phrase: string; context: string } & TranslationLanguages) {
  const source = describeSource(params.sourceLanguage, params.learningLanguage);
  const target = describeTranslationLanguage(params);
  const hints = chunkHintsFor(hintLanguage(params));

  const systemPrompt = `
  As a language learning specialist, take the "phrase" and "context", and provide all descriptive fields in ${target} (the learner's own language).
  The phrase is in ${source}. All grammar, cultural, and usage notes must be about the phrase's language.
  Don't forget to use original terms of the phrase's language in the notes when needed.
  In "language_info", "source" is the ISO 639-1 code of the language the phrase is actually written in (detect it from the text) and "target" is the code of ${target}.

  Phonetic transliteration: spell out how to pronounce the SOURCE-language "phrase" itself (read by a ${target} speaker), written using the ${target} alphabet. Do NOT transliterate the translation. For long selections (~5 words or more), return an empty string for the top-level transliteration and rely on the per-chunk transliterations instead.

  Chunks: look ONLY inside the user's selection ("phrase") and find the reusable language patterns worth learning there. The "context" is provided ONLY to disambiguate the selection's meaning — NEVER take a chunk from the context. A pattern is a valid chunk only if its exact words appear inside the selection itself, as one continuous piece of text.
  Patterns to look for: ${hints}
  Rules: at most one chunk per 5-8 words of the selection, hard ceiling of 2 chunks. Each chunk's "text" must appear verbatim inside the selection (not merely inside the context). For each chunk, also provide: "transliteration" (how to pronounce that chunk, in the ${target} alphabet) and "definition" (a short, self-contained explanation of that chunk's meaning and usage, 1-2 sentences, in ${target}).
  ${CUE_RULES}
  Return an empty "chunks" array when the selection is under ~5 words.`;

  const userPrompt = `
  Translate from ${source} to ${target}:
  Phrase: "${params.phrase}"
  Accuracy context: "${params.context}"`;

  return { systemPrompt, userPrompt };
}

/**
 * Get a detailed translation of a phrase with comprehensive linguistic analysis
 * This is the main translation function that provides the full language learning data
 * @param params The translation parameters
 * @returns Promise with detailed language learning data
 */
export async function getDetailedTranslation(
  params: { phrase: string; context: string } & TranslationLanguages
): Promise<DetailedPhraseDataType> {
  const { systemPrompt, userPrompt } = buildDetailedPrompts(params);

  try {
    // Use the Zod schema directly with the OpenRouter service
    const result =
      await openRouter.createStructuredOutputWithZod<DetailedPhraseDataType>({
        options: {
          models: TRANSLATION_MODELS,
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
          // Richer schema now includes per-chunk definition, transliteration and the
          // cue (lemma, form, accepted answers); token-heavy in target languages like
          // Persian. 700 truncated the JSON ("unterminated string"), so allow headroom.
          max_tokens: 2500,
        },
        zodSchema: LanguageLearningDataSchema, // Pass the Zod schema directly
        schemaName: "language_learning_data",
        strict: true,
      });

    // Guardrail: the model occasionally pulls chunks from the surrounding
    // context instead of the marked text. Chunks must come from the selection
    // only, so drop any whose text does not appear inside the phrase.
    result.chunks = completeCues(filterChunksToSelection(result.chunks, params.phrase));

    // Result is already validated by Zod
    return result;
  } catch (error: unknown) {
    console.error("Detailed translation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to translate text: ${errorMessage}`);
  }
}

/** The system prompt for `getTranslationAdvice` (exported for tests). */
export function buildAdvicePrompt(params: TranslationAdviceParams & TranslationLanguages): string {
  const source = describeSource(params.sourceLanguage, params.learningLanguage);
  const target = describeTranslationLanguage(params);
  return `
  You are a friendly language tutor helping the user understand a phrase they are learning.
  The selection is in ${source}; reply in ${target}.
  Selection: "${params.phrase}"
  Context: "${params.context}"
  Currently highlighted patterns (chunks): ${JSON.stringify(params.currentChunks || [])}

  Your MAIN job is to answer the user's questions about this phrase: meaning, grammar, usage, nuance, examples, differences between words, etc. Put your answer in "reply".

  Editing the highlighted patterns is a SECONDARY ability. Only return a "chunks" array when the user EXPLICITLY asks to add, remove, or change which patterns are highlighted (e.g. "highlight X", "remove that", "don't include Y"). When you do, each chunk's "text" must appear verbatim in the selection — NEVER take a chunk from the context — include its "transliteration" (pronunciation in the ${target} alphabet), and you may also add a short "reply" explaining the change.
  Patterns that count as chunks: ${chunkHintsFor(hintLanguage(params))}
  ${CUE_RULES}
  If the user is just asking a question (even one that mentions a phrase, like "what about 'on the'?"), answer it in "reply" and DO NOT change the chunks.`;
}

/**
 * Conversational advisor for the save modal's "fix this?" chat.
 * Given the user's message and the current selection/context (+ current chunks),
 * the model either replies with plain text or returns an updated chunks list.
 */
export async function getTranslationAdvice(
  params: TranslationAdviceParams & TranslationLanguages
): Promise<TranslationAdviceType> {
  const { phrase, message, history = [] } = params;
  const systemPrompt = buildAdvicePrompt(params);

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
          models: TRANSLATION_MODELS,
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: message },
          ],
          temperature: 0,
          max_tokens: 1000,
        },
        zodSchema: TranslationAdviceSchema,
        schemaName: "translation_advice",
        strict: true,
      });

    // Same guardrail as the save flow: any chunks the advisor proposes must
    // come from the marked text, not the surrounding context.
    if (result.chunks) {
      result.chunks = completeCues(filterChunksToSelection(result.chunks, phrase));
    }

    return result;
  } catch (error: unknown) {
    console.error("Translation advice error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get translation advice: ${errorMessage}`);
  }
}
