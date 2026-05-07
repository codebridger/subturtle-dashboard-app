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
  client_secret: {
    value: string;
    expires_at: number;
  };
}

export interface GeminiTokenUsageType {
  total_tokens: number;
  prompt_tokens: number;
  response_tokens: number;
  prompt_tokens_details: {
    text_tokens: number;
    audio_tokens: number;
    image_tokens: number;
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
