import { CostCalculationInput } from "../subscription/calculator";
import type { Chunk, DetailedPhraseDataType } from "../translation/types";
import {
  CHARS_PER_TOKEN,
  ESTIMATE_MODEL,
  TITLE_MAX_LENGTH,
} from "./config";
import type {
  SaveSessionCandidate,
  SaveSessionMessage,
  SaveSessionUsage,
} from "./types";

export function makeMessageId(role: "user" | "assistant") {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeMessage(
  fields: Omit<SaveSessionMessage, "id" | "createdAt">
): SaveSessionMessage {
  return { id: makeMessageId(fields.role), createdAt: new Date(), ...fields };
}

/** The first message, on one line and cut to the title length. */
export function makeTitle(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX_LENGTH) return oneLine;
  return oneLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd() + "…";
}

/**
 * Merge new chunks into the candidate list. Matching is case-insensitive on
 * the trimmed text, so the same phrase is never offered twice.
 */
export function mergeCandidates(
  current: SaveSessionCandidate[],
  chunks: Pick<Chunk, "text" | "type">[] = []
): SaveSessionCandidate[] {
  const merged = [...current];
  const seen = new Set(merged.map((c) => c.text.trim().toLowerCase()));
  for (const chunk of chunks) {
    const text = (chunk?.text || "").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    merged.push({ text, type: chunk.type || "other" });
  }
  return merged;
}

/** The whole message first (its translation is the one shown), then its chunks. */
export function buildCandidates(
  message: string,
  translation: DetailedPhraseDataType
): SaveSessionCandidate[] {
  return mergeCandidates(
    [{ text: message.trim(), type: "full" }],
    translation.chunks
  );
}

/** Find a candidate by text, ignoring case and outer spaces. */
export function findCandidate(
  candidates: SaveSessionCandidate[],
  pick: string
): SaveSessionCandidate | undefined {
  const key = pick.trim().toLowerCase();
  return candidates.find((c) => c.text.trim().toLowerCase() === key);
}

/** Rough token count of a string or JSON value (see config.ts). */
export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimated usage of one AI call: fixed prompt cost + input + output. */
export function estimateUsage(
  overheadTokens: number,
  input: unknown[],
  output: unknown
): SaveSessionUsage {
  const prompt =
    overheadTokens + input.reduce<number>((sum, v) => sum + estimateTokens(v), 0);
  const response = estimateTokens(output);
  return {
    prompt_tokens: prompt,
    response_tokens: response,
    total_tokens: prompt + response,
  };
}

export function costInputs(usage: SaveSessionUsage): CostCalculationInput[] {
  return [
    {
      label: "Input Text Tokens (estimated)",
      totalTokens: usage.prompt_tokens,
      usdCostPerMillion: ESTIMATE_MODEL.pricing.inputPerMillion,
    },
    {
      label: "Output Text Tokens (estimated)",
      totalTokens: usage.response_tokens,
      usdCostPerMillion: ESTIMATE_MODEL.pricing.outputPerMillion,
    },
  ];
}

/** `$inc` update that adds one call's usage to the session total. */
export function usageIncrement(usage: SaveSessionUsage) {
  return {
    "usage.prompt_tokens": usage.prompt_tokens,
    "usage.response_tokens": usage.response_tokens,
    "usage.total_tokens": usage.total_tokens,
  };
}

/** Escape user text so it is matched literally inside a RegExp. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
