import { CostCalculationInput } from "../../subscription/calculator";
import { TokenUsageType } from "./types";
import Decimal from "decimal.js-light";

Decimal.set({ precision: 100, rounding: Decimal.ROUND_HALF_UP });

// Markup applied on top of the published per-million rates. Set this when a
// reconciliation against actual OpenAI billing shows a consistent delta —
// historically the live-session product has billed ~5.1% above the
// published per-token rates. 0 means "use the published rates as-is".
const unknownCostPercentage = 0;

function calculatePrice(cost: number) {
  const markup = new Decimal(cost).dividedBy(100).mul(unknownCostPercentage);
  return new Decimal(cost).add(markup).toNumber();
}

// OpenAI Realtime pricing (per million tokens, USD).
const prices_per_m = {
  input_token_details: {
    text_tokens: calculatePrice(0.6),
    audio_tokens: calculatePrice(10.0),
    cached_tokens_details: {
      text_tokens: calculatePrice(0.3),
      audio_tokens: calculatePrice(0.3),
    },
  },
  output_token_details: {
    text_tokens: calculatePrice(2.4),
    audio_tokens: calculatePrice(20.0),
  },
};

/**
 * Build the cost-calculation input list for an OpenAI Realtime session from
 * its `usage` object. Cached token counts are subtracted from the
 * non-cached buckets so the caller doesn't double-count.
 *
 * Pricing (per million tokens):
 *  - Input text: $0.6
 *  - Input audio: $10.0
 *  - Cached text: $0.3
 *  - Cached audio: $0.3
 *  - Output text: $2.4
 *  - Output audio: $20.0
 */
export function extractCostCalculationInput(usage: TokenUsageType) {
  const expenses: CostCalculationInput[] = [];

  expenses.push({
    label: "Input Text Tokens",
    totalTokens:
      usage.input_token_details.text_tokens -
      usage.input_token_details.cached_tokens_details.text_tokens,
    usdCostPerMillion: prices_per_m.input_token_details.text_tokens,
  });

  expenses.push({
    label: "Input Audio Tokens",
    totalTokens:
      usage.input_token_details.audio_tokens -
      usage.input_token_details.cached_tokens_details.audio_tokens,
    usdCostPerMillion: prices_per_m.input_token_details.audio_tokens,
  });

  if (usage.input_token_details.cached_tokens_details) {
    if (usage.input_token_details.cached_tokens_details.text_tokens > 0) {
      expenses.push({
        label: "Cached Text Tokens",
        totalTokens:
          usage.input_token_details.cached_tokens_details.text_tokens,
        usdCostPerMillion:
          prices_per_m.input_token_details.cached_tokens_details.text_tokens,
      });
    }

    if (usage.input_token_details.cached_tokens_details.audio_tokens > 0) {
      expenses.push({
        label: "Cached Audio Tokens",
        totalTokens:
          usage.input_token_details.cached_tokens_details.audio_tokens,
        usdCostPerMillion:
          prices_per_m.input_token_details.cached_tokens_details.audio_tokens,
      });
    }
  }

  expenses.push({
    label: "Output Text Tokens",
    totalTokens: usage.output_token_details.text_tokens,
    usdCostPerMillion: prices_per_m.output_token_details.text_tokens,
  });

  expenses.push({
    label: "Output Audio Tokens",
    totalTokens: usage.output_token_details.audio_tokens,
    usdCostPerMillion: prices_per_m.output_token_details.audio_tokens,
  });

  return expenses;
}
