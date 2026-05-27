/**
 * Text-only live-session configuration. Independent from the audio Live API
 * module (`../live_session`); text turns run through the standard
 * `generateContent` API with a normal Gemini text model.
 */

// Default model when the caller does not pin one. Must be a function-calling
// capable Gemini text model (see the requirement on TEXT_PRICES_PER_M).
export const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";

// Markup applied on top of the published per-million rates (same hook the audio
// module exposes). 0 means "use the published rates as-is"; bump it if a
// reconciliation against actual Gemini billing shows a consistent delta.
const MARKUP_PERCENT = 0;
const withMarkup = (usd: number) => usd + (usd / 100) * MARKUP_PERCENT;

/**
 * Gemini text-model pricing (paid tier, USD per million tokens). A text session
 * only ever incurs text tokens, so we track input/output/cached text rates only.
 * `cachedText` is Google's published **cache-hit** rate for each model (the
 * module uses explicit context caching to stop re-billing the static system
 * prompt at the full input rate on every turn). It is an independent published
 * number per model — currently 10% of the input rate for these 2.5+/3.x models,
 * but enter the figure from the pricing page rather than deriving it, since the
 * discount is generation-dependent (2.0-era models are 75% off, not 90%).
 * Per-token cache *storage* cost (~$1/1M/hr, sub-cent for a ~1k-token cache
 * under its TTL) is not modeled — it's noise next to the input savings.
 *
 * This map doubles as the allow-list (see ALLOWED_TEXT_MODELS), so every model
 * here MUST support function calling — the practice flow drives the
 * `activate_phrase` and `finish_practice` tools, and a model without tool use
 * would silently break it. All current entries support function calling
 * (verified May 2026):
 *   - gemini-3.1-flash-lite  (also confirmed end-to-end in a live text session)
 *   - gemini-2.5-flash       (Function calling: Supported)
 *   - gemini-2.5-flash-lite  (Function calling: Supported)
 * Before adding a model, confirm "Function calling: Supported" on its
 * ai.google.dev model page.
 *
 * ⚠️ Confirm these against current Gemini pricing before merge — rates drift.
 */
export const TEXT_PRICES_PER_M: Record<
  string,
  { promptText: number; responseText: number; cachedText: number }
> = {
  "gemini-3.1-flash-lite": {
    promptText: withMarkup(0.25),
    responseText: withMarkup(1.5),
    cachedText: withMarkup(0.025),
  },
  "gemini-2.5-flash-lite": {
    promptText: withMarkup(0.1),
    responseText: withMarkup(0.4),
    cachedText: withMarkup(0.01),
  },
  "gemini-2.5-flash": {
    promptText: withMarkup(0.3),
    responseText: withMarkup(2.5),
    cachedText: withMarkup(0.03),
  },
};

// Fallback rates for any model not listed above (defaults to the cheapest tier).
export const DEFAULT_TEXT_PRICE = TEXT_PRICES_PER_M[DEFAULT_TEXT_MODEL];

// The models a text session may use — the pricing-table keys are the single
// source of truth, so adding a priced model automatically allows it.
export const ALLOWED_TEXT_MODELS = Object.keys(TEXT_PRICES_PER_M);

/** Whether `model` is an accepted text-session model. */
export function isAllowedTextModel(model: string): boolean {
  return ALLOWED_TEXT_MODELS.includes(model);
}

// --- Explicit context caching -------------------------------------------------
//
// The static prefix (system prompt + phrase list + tool declarations) is
// identical on every turn, so we cache it once and reference it by name instead
// of re-sending — and re-billing — it each turn. See `ensureTextCache` in
// functions.ts and the readme's token-tracking section.

// How long a created cache lives. A text practice session is short, so one hour
// comfortably covers it; `CACHE_REFRESH_BUFFER_MS` triggers a transparent
// recreate if a session ever runs long enough to approach expiry.
export const CACHE_TTL_SECONDS = 60 * 60;

// Recreate the cache when it is within this window of its TTL, so a turn never
// references a cache that expires mid-request.
export const CACHE_REFRESH_BUFFER_MS = 60 * 1000;

// Gemini rejects an explicit cache below a per-model token floor with 400
// INVALID_ARGUMENT (verified May 2026 against the live API):
//   - gemini-2.5-flash-lite : 2,048 tokens
//   - gemini-2.5-flash      : 1,024 tokens
//   - gemini-3.1-flash-lite : 1,024 tokens
// A small bundle's prefix (system prompt + phrase list + tools) can fall under
// the floor — notably on the default flash-lite model — so cache creation is
// best-effort: `ensureTextCache` falls back to inlining the prefix (the original
// behaviour) and disables further attempts for that session. The fallback keys
// off the API error, not a local token count, since the cached total (prefix +
// tool schema) is what the server actually checks.
