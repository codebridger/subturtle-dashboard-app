import { CostCalculationInput } from "../subscription/calculator";
import { TEXT_PRICES_PER_M, DEFAULT_TEXT_PRICE } from "./config";
import { TextTokenUsageType } from "./types";

export function emptyUsage(): TextTokenUsageType {
  return {
    total_tokens: 0,
    prompt_tokens: 0,
    response_tokens: 0,
    cached_tokens: 0,
    thoughts_tokens: 0,
    tool_use_tokens: 0,
  };
}

/**
 * Normalize a `generateContent` response's `usageMetadata` into our lean
 * text-usage shape. The Gemini API names the output count `candidatesTokenCount`
 * (the audio Live API used `responseTokenCount`) — accept either.
 */
export function mapUsage(usageMetadata: any): TextTokenUsageType {
  const m = usageMetadata || {};
  const prompt = m.promptTokenCount || 0;
  const response = m.candidatesTokenCount || m.responseTokenCount || 0;
  const cached = m.cachedContentTokenCount || 0;
  const thoughts = m.thoughtsTokenCount || 0;
  const toolUse = m.toolUsePromptTokenCount || 0;

  return {
    prompt_tokens: prompt,
    response_tokens: response,
    cached_tokens: cached,
    thoughts_tokens: thoughts,
    tool_use_tokens: toolUse,
    total_tokens: m.totalTokenCount || prompt + response,
  };
}

/** Sum a per-turn usage into a running cumulative total (mutates `total`). */
export function accumulateUsage(
  total: TextTokenUsageType,
  delta: TextTokenUsageType
): TextTokenUsageType {
  total.total_tokens += delta.total_tokens;
  total.prompt_tokens += delta.prompt_tokens;
  total.response_tokens += delta.response_tokens;
  total.cached_tokens += delta.cached_tokens;
  total.thoughts_tokens += delta.thoughts_tokens;
  total.tool_use_tokens += delta.tool_use_tokens;
  return total;
}

/**
 * Build the cost-calculation input list for a text turn, keyed off the model.
 * Cached input is billed at the input rate; thinking tokens at the output rate.
 */
export function extractTextCostCalculationInput(
  usage: TextTokenUsageType,
  model: string
): CostCalculationInput[] {
  const rate = TEXT_PRICES_PER_M[model] || DEFAULT_TEXT_PRICE;

  const inputText = Math.max(
    0,
    usage.prompt_tokens + usage.tool_use_tokens - usage.cached_tokens
  );
  const outputText = usage.response_tokens + usage.thoughts_tokens;

  const expenses: CostCalculationInput[] = [
    {
      label: "Input Text Tokens",
      totalTokens: inputText,
      usdCostPerMillion: rate.promptText,
    },
    {
      label: "Output Text Tokens",
      totalTokens: outputText,
      usdCostPerMillion: rate.responseText,
    },
  ];

  if (usage.cached_tokens > 0) {
    expenses.push({
      label: "Cached Text Tokens",
      totalTokens: usage.cached_tokens,
      usdCostPerMillion: rate.promptText,
    });
  }

  return expenses;
}
