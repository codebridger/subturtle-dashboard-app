import { OPENROUTER_MODELS } from "../../utils/openrouter-models";

/** Error code sent when the AI provider fails. Nothing is stored or billed. */
export const SAVE_ASSISTANT_UNAVAILABLE_CODE = "SAVE_ASSISTANT_UNAVAILABLE";

/** `recordUsage` service type for this module. */
export const SAVE_ASSISTANT_SERVICE_TYPE = "save_assistant";

/**
 * Per-session cap on user messages when the tier has no text-chat message cap
 * (Learner / Coach). Keeps one conversation, and its stored document, bounded.
 */
export const DEFAULT_MESSAGE_CAP = 60;

/** Set `wrapUp` this many user messages before the cap (same as `text-turn`). */
export const WRAP_UP_BUFFER = 9;

/** Session titles are the first message, cut to this length. */
export const TITLE_MAX_LENGTH = 120;

/** `listSaveSessions` page size. */
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 50;

/**
 * Usage estimate. The shared translation service does not return the
 * provider's token counts, so we estimate them: about 4 characters per token,
 * plus a fixed cost for the system prompt and the JSON schema sent with each
 * call. The rates are the primary translation model's (the first one in
 * `TRANSLATION_MODELS`). Replace this with real counts once the service
 * returns them.
 */
export const CHARS_PER_TOKEN = 4;
export const DETAILED_PROMPT_OVERHEAD_TOKENS = 1200;
export const ADVICE_PROMPT_OVERHEAD_TOKENS = 700;
export const ESTIMATE_MODEL = OPENROUTER_MODELS.GEMINI_2_5_FLASH_LITE;
