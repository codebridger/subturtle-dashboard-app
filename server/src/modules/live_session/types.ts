/**
 * Shared live-session types plus barrel re-exports of provider-specific
 * types from `./openai/types` and `./gemini/types`. Frontend code only needs
 * to import from this file (via `~/types/live-session.type`) to get the
 * full type surface.
 */
import { CostCalculationResult } from "../subscription/calculator";
import type { LiveSessionType, TokenUsageType } from "./openai/types";
import type {
  GeminiLiveSessionType,
  GeminiTokenUsageType,
} from "./gemini/types";

export type { LiveSessionType, TokenUsageType, TurnDetectionType, ClientSecretType } from "./openai/types";
export type { GeminiLiveSessionType, GeminiTokenUsageType } from "./gemini/types";
export type { CoachVoice } from "./voices";

export type SessionType = "bundle-practice";
export type LiveSessionProvider = "openai" | "gemini";
export type LiveSessionMetadataType =
  | LivePracticeSessionSetupType
  | Record<string, any>;

export interface LiveSessionRecordType {
  _id: string;
  type: SessionType;
  provider?: LiveSessionProvider;
  session: LiveSessionType | GeminiLiveSessionType;
  refId: string;
  createdAt: Date;
  updatedAt: Date;
  usage: TokenUsageType | GeminiTokenUsageType;
  cost: CostCalculationResult;
  dialogs: ConversationDialogType[];
  metadata: LiveSessionMetadataType;
  /** The learning language (B-13). Missing on sessions from before multilingual: English. */
  language?: string;
  /** The language the Coach explained in. */
  explanationLanguage?: string;
}

export interface ConversationDialogType {
  id: string;
  content: string;
  speaker: "user" | "ai";
}

export interface LivePracticeSessionSetupType {
  aiCharacter: string;
  selectionMode: "selection" | "random";
  fromPhrase?: number;
  toPhrase?: number;
  totalPhrases?: number;
  /** Language the user wants explanations in (English name, e.g. "Spanish"). */
  nativeLanguage?: string;
}
