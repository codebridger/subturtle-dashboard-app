/**
 * Types for the save-assistant module. The server holds the whole conversation;
 * the client sends only the new message (or the candidate it picked).
 */
import type { DetailedPhraseDataType } from "../translation/types";

/** Where the text the user wants to learn came from. */
export interface SaveSessionSource {
  kind: "share" | "paste" | "typed";
  app?: string;
  pageUrl?: string;
  pageTitle?: string;
}

/**
 * A phrase the assistant offered to explain. `full` is the user's whole first
 * message; the other types come from the translation's `chunks`.
 */
export interface SaveSessionCandidate {
  text: string;
  type: string;
}

export interface SavedPayload {
  phraseId: string;
  phrase: string;
  bundleId?: string;
}

/**
 * One row in the conversation.
 *  - `text`: a plain message. A user pick is stored as a user `text` message.
 *  - `translation`: `text` is the phrase, `payload` the detailed translation.
 *  - `saved`: `payload` is `{ phraseId, phrase, bundleId }`.
 */
export interface SaveSessionMessage {
  id: string;
  role: "user" | "assistant";
  kind: "text" | "translation" | "saved";
  text?: string;
  payload?: DetailedPhraseDataType | SavedPayload;
  createdAt: Date;
}

/** Estimated AI usage, summed over the session. */
export interface SaveSessionUsage {
  prompt_tokens: number;
  response_tokens: number;
  total_tokens: number;
}

export interface SaveSessionRecordType {
  _id: any;
  refId: string;
  title: string;
  source?: SaveSessionSource;
  sourceLanguage?: string;
  targetLanguage: string;
  messages: SaveSessionMessage[];
  candidates: SaveSessionCandidate[];
  savedPhraseIds: string[];
  /** Phrase texts, in step with `savedPhraseIds`, so the list needs no join. */
  savedPhrases: string[];
  savedCount: number;
  lastMessageAt: Date;
  usage: SaveSessionUsage;
  createdAt: Date;
  updatedAt: Date;
}
