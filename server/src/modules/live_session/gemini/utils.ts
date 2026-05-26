import { CostCalculationInput } from "../../subscription/calculator";
import { GeminiTokenUsageType } from "./types";
import Decimal from "decimal.js-light";

Decimal.set({ precision: 100, rounding: Decimal.ROUND_HALF_UP });

// Markup applied on top of the published per-million rates. Set this when a
// reconciliation against actual Gemini billing shows a consistent delta
// (the OpenAI side has the same hook for the same reason). 0 means "use the
// published rates as-is".
const unknownCostPercentage = 0;

function calculatePrice(cost: number) {
  const markup = new Decimal(cost).dividedBy(100).mul(unknownCostPercentage);
  return new Decimal(cost).add(markup).toNumber();
}

// Gemini Live API pricing (paid tier, per million tokens, USD).
// Cached-token discount is not yet documented; charge cached tokens at the
// same rate as their non-cached counterparts and revisit if Google publishes
// a discount.
const gemini_prices_per_m = {
  prompt: {
    text: calculatePrice(0.75),
    audio: calculatePrice(3.0),
    image: calculatePrice(1.0),
  },
  response: {
    text: calculatePrice(4.5),
    audio: calculatePrice(12.0),
  },
};

/**
 * Build the cost-calculation input list for a Gemini Live session.
 *
 * Pricing (per million tokens):
 *  - Input text: $0.75
 *  - Input audio: $3.00
 *  - Input image/video: $1.00
 *  - Output text: $4.50 (includes thinking tokens)
 *  - Output audio: $12.00
 */
export function extractGeminiCostCalculationInput(usage: GeminiTokenUsageType) {
  const expenses: CostCalculationInput[] = [];

  const promptText = Math.max(
    0,
    (usage.prompt_tokens_details.text_tokens + (usage.tool_use_tokens || 0)) -
      usage.cached_tokens_details.text_tokens
  );
  const promptAudio = Math.max(
    0,
    usage.prompt_tokens_details.audio_tokens -
      usage.cached_tokens_details.audio_tokens
  );
  const promptImage = (usage.prompt_tokens_details.image_tokens || 0) + (usage.prompt_tokens_details.video_tokens || 0);

  expenses.push({
    label: "Input Text Tokens",
    totalTokens: promptText,
    usdCostPerMillion: gemini_prices_per_m.prompt.text,
  });

  expenses.push({
    label: "Input Audio Tokens",
    totalTokens: promptAudio,
    usdCostPerMillion: gemini_prices_per_m.prompt.audio,
  });

  if (promptImage > 0) {
    expenses.push({
      label: "Input Image/Video Tokens",
      totalTokens: promptImage,
      usdCostPerMillion: gemini_prices_per_m.prompt.image,
    });
  }

  if (usage.cached_tokens_details.text_tokens > 0) {
    expenses.push({
      label: "Cached Text Tokens",
      totalTokens: usage.cached_tokens_details.text_tokens,
      usdCostPerMillion: gemini_prices_per_m.prompt.text,
    });
  }

  if (usage.cached_tokens_details.audio_tokens > 0) {
    expenses.push({
      label: "Cached Audio Tokens",
      totalTokens: usage.cached_tokens_details.audio_tokens,
      usdCostPerMillion: gemini_prices_per_m.prompt.audio,
    });
  }

  expenses.push({
    label: "Output Text Tokens",
    totalTokens: usage.response_tokens_details.text_tokens + (usage.thoughts_tokens || 0),
    usdCostPerMillion: gemini_prices_per_m.response.text,
  });

  expenses.push({
    label: "Output Audio Tokens",
    totalTokens: usage.response_tokens_details.audio_tokens,
    usdCostPerMillion: gemini_prices_per_m.response.audio,
  });

  return expenses;
}
