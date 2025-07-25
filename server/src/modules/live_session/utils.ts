import { CostCalculationInput } from "../subscription/calculator";
import { TokenUsageType } from "./types";
import Decimal from "decimal.js-light";

// Configure Decimal for higher precision
Decimal.set({ precision: 100, rounding: Decimal.ROUND_HALF_UP });

// This is the unknown cost percentage for the live session
// Based on our calculation there is a 5.1305% unknown cost
// for the live session
const unknownCostPercentage = 0;

function calculatePrice(cost: number) {
  // use decimal to avoid floating point errors
  const unknownCost = new Decimal(cost)
    .dividedBy(100)
    .mul(unknownCostPercentage);
  return new Decimal(cost).add(unknownCost).toNumber();
}

// Price definitions per million tokens for each token type
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
 * Calculates the cost of a live session based on token usage
 *
 * This function performs precise calculations for the cost of live sessions by:
 * 1. Computing individual costs for different token types (text, audio, cached)
 * 2. Using high-precision decimal arithmetic to avoid floating-point errors
 * 3. Providing a detailed breakdown of usage and costs
 *
 * The calculated costs follow this pricing model:
 * - Input text tokens: $0.6 per million tokens
 * - Input audio tokens: $10.0 per million tokens
 * - Cached text tokens: $0.3 per million tokens
 * - Cached audio tokens: $0.3 per million tokens
 * - Output text tokens: $2.4 per million tokens
 * - Output audio tokens: $20.0 per million tokens
 *
 * @param usage - Object containing token usage details across different categories
 * @returns The total cost in USD with high precision (10 decimal places)
 */
export function extractCostCalculationInput(usage: TokenUsageType) {
  const expenses: CostCalculationInput[] = [];

  // Add input tokens (always present)
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

  // Add cached tokens if present
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

  // Add output tokens (always present)
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
