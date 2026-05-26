/**
 * Text-only live-session configuration. Independent from the audio Live API
 * module (`../live_session`); text turns run through the standard
 * `generateContent` API with a normal Gemini text model.
 */

// Default model when the caller does not pin one. Any Gemini text model works.
export const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";

// Markup applied on top of the published per-million rates (same hook the audio
// module exposes). 0 means "use the published rates as-is"; bump it if a
// reconciliation against actual Gemini billing shows a consistent delta.
const MARKUP_PERCENT = 0;
const withMarkup = (usd: number) => usd + (usd / 100) * MARKUP_PERCENT;

/**
 * Gemini text-model pricing (paid tier, USD per million tokens). A text session
 * only ever incurs text tokens, so we track input/output text rates only.
 * Cached input tokens are billed at the input rate (Google's cache discount is
 * not modeled yet — same conservative stance as the audio module).
 *
 * ⚠️ Confirm these against current Gemini pricing before merge — rates drift.
 */
export const TEXT_PRICES_PER_M: Record<
  string,
  { promptText: number; responseText: number }
> = {
  "gemini-3.1-flash-lite": {
    promptText: withMarkup(0.25),
    responseText: withMarkup(1.5),
  },
  "gemini-2.5-flash-lite": {
    promptText: withMarkup(0.1),
    responseText: withMarkup(0.4),
  },
  "gemini-2.5-flash": {
    promptText: withMarkup(0.3),
    responseText: withMarkup(2.5),
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
