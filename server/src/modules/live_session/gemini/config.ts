export const GEMINI_LIVE_SESSION_MODEL = "gemini-3.1-flash-live-preview";

// Tokens stay valid for 30 minutes; the constrained connection has its own
// 15-minute audio cap and we always issue a fresh token before then.
export const GEMINI_TOKEN_TTL_MS = 30 * 60 * 1000;

// The client must open the WebSocket within this window after issuance.
export const GEMINI_NEW_SESSION_TTL_MS = 60 * 1000;
