/**
 * Unified live-session request: the single descriptor every live-session entry
 * point builds and the one /practice/live-session page consumes. A session's
 * "type" only changes where its phrases come from (`source`); voice, language,
 * instructions, UI and engine are shared. Encoded as base64 JSON in the
 * `?session=` query param.
 */

export type LiveSessionPhraseSource =
  | {
      kind: 'bundle';
      bundleId: string;
      selectionMode: 'selection' | 'random';
      fromPhrase?: number;
      toPhrase?: number;
      totalPhrases?: number;
    }
  | { kind: 'phrases'; phraseIds: string[] };

export interface LiveSessionRequest {
  /** Gemini prebuilt voice name. */
  aiCharacter: string;
  /** Explanation language (English name, e.g. "Spanish") or "auto". */
  nativeLanguage?: string;
  /** Where the 1..N phrases to review come from. */
  source: LiveSessionPhraseSource;
  /** Path the End/Recap actions navigate back to (default "/board"). */
  returnTo?: string;
}
