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
 * `promptTokenCount` already INCLUDES the cached tokens, so the full-rate input
 * line subtracts them and they are re-added on their own line at the discounted
 * cache-hit rate (`cachedText`). Thinking tokens are billed at the output rate.
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
      usdCostPerMillion: rate.cachedText,
    });
  }

  return expenses;
}

export type CoachUpstreamReason =
  | "upstream_quota"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "upstream_error";

/**
 * Pull the HTTP status out of a `@google/genai` failure. The SDK's `ApiError`
 * carries `.status`, but some paths only put the provider's JSON body in
 * `.message` (`{"error":{"code":402,...}}`), so fall back to parsing that.
 */
export function upstreamStatusOf(err: any): number | undefined {
  if (typeof err?.status === "number") return err.status;
  const message = String(err?.message ?? "");
  const start = message.indexOf("{");
  if (start === -1) return undefined;
  try {
    const code = JSON.parse(message.slice(start))?.error?.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map an upstream status to the stable reason sent to the client. 402 is
 * Gemini's "prepayment credits are depleted"; it is our quota, not the user's.
 */
export function classifyUpstreamStatus(
  status: number | undefined
): CoachUpstreamReason {
  if (status === 402) return "upstream_quota";
  if (status === 429) return "upstream_rate_limited";
  if (status !== undefined && status >= 500) return "upstream_unavailable";
  return "upstream_error";
}
