import { TokenUsageType } from "./types";
import Decimal from "decimal.js-light";

// Configure Decimal for higher precision
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function calculateLiveSessionCost(usage: TokenUsageType) {
  const prices_per_million_tokens = {
    input_token_details: {
      text_tokens: 0.6,
      audio_tokens: 10.0,
      cached_tokens_details: {
        text_tokens: 0.3,
        audio_tokens: 0.3,
      },
    },
    output_token_details: {
      text_tokens: 2.4,
      audio_tokens: 20.0,
    },
  };

  // Use string literals for precise decimal representation
  const million = new Decimal("1000000");

  // Calculate input costs with Decimal for precision
  const inputTextCost = new Decimal(usage.input_token_details.text_tokens)
    .div(million)
    .times(
      new Decimal(
        prices_per_million_tokens.input_token_details.text_tokens.toString()
      )
    );

  const inputAudioCost = new Decimal(usage.input_token_details.audio_tokens)
    .div(million)
    .times(
      new Decimal(
        prices_per_million_tokens.input_token_details.audio_tokens.toString()
      )
    );

  const cachedTextCost = new Decimal(
    usage.input_token_details.cached_tokens_details.text_tokens
  )
    .div(million)
    .times(
      new Decimal(
        prices_per_million_tokens.input_token_details.cached_tokens_details.text_tokens.toString()
      )
    );

  const cachedAudioCost = new Decimal(
    usage.input_token_details.cached_tokens_details.audio_tokens
  )
    .div(million)
    .times(
      new Decimal(
        prices_per_million_tokens.input_token_details.cached_tokens_details.audio_tokens.toString()
      )
    );

  // Calculate output costs
  const outputTextCost = new Decimal(usage.output_token_details.text_tokens)
    .div(million)
    .times(
      new Decimal(
        prices_per_million_tokens.output_token_details.text_tokens.toString()
      )
    );

  const outputAudioCost = new Decimal(usage.output_token_details.audio_tokens)
    .div(million)
    .times(
      new Decimal(
        prices_per_million_tokens.output_token_details.audio_tokens.toString()
      )
    );

  // Sum all costs
  const totalCost = inputTextCost
    .plus(inputAudioCost)
    .plus(cachedTextCost)
    .plus(cachedAudioCost)
    .plus(outputTextCost)
    .plus(outputAudioCost);

  // Create usage cost table for logging
  const costTable = [
    ["Token Type", "Token Count", "Cost ($)"],
    [
      "Input Text",
      usage.input_token_details.text_tokens,
      Number(inputTextCost.toFixed(10)),
    ],
    [
      "Input Audio",
      usage.input_token_details.audio_tokens,
      Number(inputAudioCost.toFixed(10)),
    ],
    [
      "Cached Text",
      usage.input_token_details.cached_tokens_details.text_tokens,
      Number(cachedTextCost.toFixed(10)),
    ],
    [
      "Cached Audio",
      usage.input_token_details.cached_tokens_details.audio_tokens,
      Number(cachedAudioCost.toFixed(10)),
    ],
    [
      "Output Text",
      usage.output_token_details.text_tokens,
      Number(outputTextCost.toFixed(10)),
    ],
    [
      "Output Audio",
      usage.output_token_details.audio_tokens,
      Number(outputAudioCost.toFixed(10)),
    ],
    ["TOTAL", usage.total_tokens, Number(totalCost.toFixed(10))],
  ];

  // Log the table
  console.table(costTable);

  // Return as a number with high precision
  // For maximum accuracy when these values are persisted or displayed
  const finalTotalCost = Number(totalCost.toFixed(10));
  return finalTotalCost;
}
