/**
 * Types for the text-only live-session module. The server holds the
 * authoritative session state (system prompt, tool declarations, the Gemini
 * `contents[]` history, cumulative usage); the client keeps only a display
 * transcript.
 */
import type { Content } from "@google/genai";

/** Token usage for a text turn. Text sessions only produce text tokens. */
export interface TextTokenUsageType {
  total_tokens: number;
  prompt_tokens: number;
  response_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  tool_use_tokens: number;
}

/** A human-readable transcript row shown in the UI / history. */
export interface TextDialogType {
  id: string;
  content: string;
  speaker: "user" | "ai";
}

/**
 * A single client → server turn input.
 *  - `user`: a real user message (shown in the transcript).
 *  - `system`: a system nudge (e.g. the opening welcome) — not shown.
 *  - `toolResults`: the outcome of client-side tool handlers, fed back so the
 *    model can continue the function-calling turn.
 */
export type TextTurnInput =
  | { kind: "user" | "system"; text: string }
  | {
      kind: "toolResults";
      results: { id?: string; name: string; output: any }[];
    };

export interface TextSessionRecordType {
  _id: string;
  refId: string;
  instructions: string;
  toolDeclarations: any[];
  /** `model` lives here (not a top-level path) to avoid shadowing Mongoose's `doc.model()`. */
  session: { modalities: string[]; model: string };
  /** Server-held Gemini history (the model's source of truth for the turn). */
  contents: Content[];
  dialogs: TextDialogType[];
  usage: TextTokenUsageType;
  metadata: Record<string, any>;
  /**
   * Explicit context-cache state for the static prefix (system prompt + tools).
   *  - `cacheName`: the `cachedContents/…` resource referenced via `cachedContent`.
   *  - `cacheExpireTime`: epoch ms; the turn recreates the cache before this.
   *  - `cacheDisabled`: set once creation fails (e.g. prefix under the token
   *    floor) so the session stops retrying and inlines the prefix instead.
   */
  cacheName?: string;
  cacheExpireTime?: number;
  cacheDisabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
