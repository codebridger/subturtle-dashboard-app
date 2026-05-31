/**
 * Provider-specific types for the Gemini Live API integration. Shared
 * session-record/dialog types live in `../types.ts`.
 */

export interface GeminiLiveSessionType {
  model: string;
  voice: string;
  instructions: string;
  modalities: string[];
  expires_at: number;
  /**
   * Max wall-clock seconds this session may run before the client must end it.
   * Server policy = per-session cap ∧ the user's remaining voice minutes, so
   * every client (dashboard, mobile) shares one timer-duration source of truth.
   * 0 means no minutes left. Optional for backward-compat with older servers.
   */
  voice_session_max_seconds?: number;
  client_secret: {
    value: string;
    expires_at: number;
  };
}

export interface GeminiTokenUsageType {
  total_tokens: number;
  prompt_tokens: number;
  response_tokens: number;
  tool_use_tokens: number;
  thoughts_tokens: number;
  prompt_tokens_details: {
    text_tokens: number;
    audio_tokens: number;
    image_tokens: number;
    video_tokens: number;
  };
  response_tokens_details: {
    text_tokens: number;
    audio_tokens: number;
  };
  cached_tokens: number;
  cached_tokens_details: {
    text_tokens: number;
    audio_tokens: number;
  };
}
