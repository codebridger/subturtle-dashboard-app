/**
 * Central registry of the OpenRouter models the server is allowed to use,
 * together with their context window and pricing. Keep model ids and pricing
 * here (not inline in services) so cost is auditable in one place.
 *
 * Pricing is USD per 1,000,000 tokens, taken from OpenRouter.
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPerMillion: number;
  /** USD per 1M output tokens */
  outputPerMillion: number;
}

export interface OpenRouterModel {
  /** OpenRouter model id passed to the API */
  id: string;
  /** Context window in tokens */
  contextWindow: number;
  pricing: ModelPricing;
}

export const OPENROUTER_MODELS = {
  GEMINI_2_5_FLASH_LITE: {
    id: "google/gemini-2.5-flash-lite",
    contextWindow: 1_050_000,
    pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  },
  GEMINI_2_5_FLASH: {
    id: "google/gemini-2.5-flash",
    contextWindow: 1_000_000,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  GEMINI_1_5_FLASH_8B: {
    id: "google/gemini-flash-1.5-8b",
    contextWindow: 1_000_000,
    pricing: { inputPerMillion: 0.038, outputPerMillion: 0.15 },
  },
} satisfies Record<string, OpenRouterModel>;

/**
 * Preferred fallback order for translation + advisor calls (cheapest capable
 * model first). OpenRouter tries each in turn if one is unavailable.
 */
export const TRANSLATION_MODELS: string[] = [
  OPENROUTER_MODELS.GEMINI_2_5_FLASH_LITE.id,
  OPENROUTER_MODELS.GEMINI_2_5_FLASH.id,
  OPENROUTER_MODELS.GEMINI_1_5_FLASH_8B.id,
];
