/**
 * Unified live-session request: the single descriptor every live-session entry
 * point builds and the one /practice/live-session gate consumes. Phrase
 * selection is resolved upstream (at the entry point), so the request always
 * carries a concrete list of phrase ids — the session just fetches them.
 * Encoded as base64 JSON in the `?session=` query param.
 */
export interface LiveSessionRequest {
  /** Gemini prebuilt voice name. */
  aiCharacter: string;
  /** Explanation language (English name, e.g. "Spanish") or "auto". */
  nativeLanguage?: string;
  /**
   * Conversation transport. "voice" (default) is the audio Live API; "text" is
   * the text-only `generateContent` path (separate store + server module).
   */
  mode?: 'voice' | 'text';
  /** Bundle title for the session header. Optional — single-phrase deep links omit it. */
  title?: string;
  /**
   * The already-resolved phrases to practice. The browser extension's "Practice
   * now" includes an extra `kind: 'phrases'` field here, which is harmlessly
   * ignored — we only read `phraseIds`.
   */
  source: { phraseIds: string[] };
  /** Path the End/Recap actions navigate back to (default "/board"). */
  returnTo?: string;
}
