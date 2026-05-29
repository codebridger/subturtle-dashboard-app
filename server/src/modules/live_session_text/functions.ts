/**
 * Text-only live-session backend functions.
 *
 * The Gemini Live API is audio-out only, so a text-only conversation runs
 * through the standard `generateContent` API instead. The server holds the
 * authoritative session state (system prompt, tool declarations, the Gemini
 * `contents[]` history, cumulative usage); the client sends only
 * `{ sessionId, input }` and runs the tool *handlers* (pure UI effects).
 *
 * Two functions:
 *   - `create-text-session`: gate credits, persist a fresh session record.
 *   - `text-turn`: load the session, append the input, call Gemini, bill usage,
 *     persist, and return either the model's text or its pending function calls.
 */
import { defineFunction, getCollection } from "@modular-rest/server";
import { GoogleGenAI } from "@google/genai";
import { checkCreditAllocation, recordUsage } from "../subscription/service";
import { AI_CREDIT_EXHAUSTED_CODE } from "../subscription/config";
import { DATABASE, LIVE_SESSION_TEXT_COLLECTION } from "../../config";
import {
  ALLOWED_TEXT_MODELS,
  CACHE_REFRESH_BUFFER_MS,
  CACHE_TTL_SECONDS,
  DEFAULT_TEXT_MODEL,
  isAllowedTextModel,
} from "./config";
import {
  accumulateUsage,
  emptyUsage,
  extractTextCostCalculationInput,
  mapUsage,
} from "./utils";
import type { TextSessionRecordType, TextTurnInput } from "./types";

function makeDialogId(speaker: "user" | "ai") {
  return `${speaker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The session's tool declarations in `generateContent`/cache `tools` shape. */
function buildTools(record: TextSessionRecordType) {
  return record.toolDeclarations && record.toolDeclarations.length > 0
    ? [{ functionDeclarations: record.toolDeclarations }]
    : undefined;
}

type CacheResolution = {
  cacheName?: string;
  cacheExpireTime?: number;
  cacheDisabled: boolean;
  /** Present iff this turn should reference a cache via `cachedContent`. */
  usableName?: string;
};

/**
 * Resolve the explicit context cache for a session's static prefix (system
 * prompt + tool declarations). The prefix is identical on every turn, so we
 * cache it once and reference it by name — Gemini then bills those tokens at the
 * cache-hit rate instead of re-charging the full prefix each turn.
 *
 * Best-effort by design:
 *  - reuses a live cache until it nears its TTL, then transparently recreates it;
 *  - if creation fails (most likely the prefix is under the model's cache floor
 *    — 2,048 tokens on flash-lite, 1,024 elsewhere; see config.ts), the session
 *    is marked `cacheDisabled` and the caller inlines the prefix, exactly as
 *    before caching existed.
 *
 * Implicit caching is intentionally not relied on: it is suppressed once `tools`
 * are declared (and is unreliable on flash-lite), and the practice flow always
 * declares tools.
 */
async function ensureTextCache(
  ai: GoogleGenAI,
  record: TextSessionRecordType,
  model: string
): Promise<CacheResolution> {
  const current: CacheResolution = {
    cacheName: record.cacheName,
    cacheExpireTime: record.cacheExpireTime,
    cacheDisabled: !!record.cacheDisabled,
  };

  if (current.cacheDisabled) return current;

  const now = Date.now();
  const stillFresh =
    !!current.cacheName &&
    !!current.cacheExpireTime &&
    now < current.cacheExpireTime - CACHE_REFRESH_BUFFER_MS;
  if (stillFresh) return { ...current, usableName: current.cacheName };

  try {
    const cache = await ai.caches.create({
      model,
      config: {
        systemInstruction: record.instructions,
        tools: buildTools(record),
        ttl: `${CACHE_TTL_SECONDS}s`,
        displayName: `text-session-${record._id}`,
      },
    });
    if (!cache.name) throw new Error("cache created without a name");
    return {
      cacheName: cache.name,
      cacheExpireTime: now + CACHE_TTL_SECONDS * 1000,
      cacheDisabled: false,
      usableName: cache.name,
    };
  } catch (err: any) {
    // Caching is an optimization, not a requirement — degrade to inlining the
    // prefix and stop retrying for this session (the prefix size won't change).
    console.warn(
      `[live_session_text] context cache unavailable for ${record._id}; ` +
        `inlining the prefix. ${err?.message || err}`
    );
    return { cacheDisabled: true };
  }
}

const createTextSession = defineFunction({
  name: "create-text-session",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    instructions: string;
    toolDeclarations?: any[];
    model?: string;
    metadata?: Record<string, any>;
  }) {
    const { userId, instructions, toolDeclarations, model, metadata } = context;

    // Only models priced in config.ts are accepted — `model` is client-supplied,
    // and an unpriced one would be billed at the fallback rate.
    const chosenModel = model || DEFAULT_TEXT_MODEL;
    if (!isAllowedTextModel(chosenModel)) {
      throw new Error(
        `Unsupported text model "${chosenModel}". Allowed: ${ALLOWED_TEXT_MODELS.join(
          ", "
        )}.`
      );
    }

    // AI features are credit-gated; `minCredits: 1` blocks only at true
    // exhaustion (the 100% hard cap). Text sessions do NOT consume a freemium
    // live-session slot.
    const { allowedToProceed } = await checkCreditAllocation({
      userId,
      minCredits: 1,
    });
    if (!allowedToProceed) {
      throw new Error(
        `${AI_CREDIT_EXHAUSTED_CODE}: AI features are paused — this month's AI budget is used up.`
      );
    }

    const collection = getCollection(DATABASE, LIVE_SESSION_TEXT_COLLECTION);

    const record = await collection.create({
      refId: userId,
      instructions,
      toolDeclarations: toolDeclarations || [],
      session: { modalities: ["TEXT"], model: chosenModel },
      contents: [],
      dialogs: [],
      usage: emptyUsage(),
      metadata: metadata || {},
    });

    return { sessionId: record._id.toString(), model: chosenModel };
  },
});

const textTurn = defineFunction({
  name: "text-turn",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    sessionId: string;
    input: TextTurnInput;
  }) {
    const { userId, sessionId, input } = context;

    const collection = getCollection<TextSessionRecordType>(
      DATABASE,
      LIVE_SESSION_TEXT_COLLECTION
    );

    const record = await collection.findOne({
      _id: sessionId,
      refId: userId,
    } as any);
    if (!record) {
      throw new Error("Text session not found");
    }

    const { allowedToProceed } = await checkCreditAllocation({
      userId,
      minCredits: 1,
    });
    if (!allowedToProceed) {
      throw new Error(
        `${AI_CREDIT_EXHAUSTED_CODE}: AI features are paused — this month's AI budget is used up.`
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured on the server");
    }

    const model =
      (record.session && (record.session as any).model) || DEFAULT_TEXT_MODEL;
    const contents: any[] = Array.isArray(record.contents)
      ? [...record.contents]
      : [];
    const dialogs = Array.isArray(record.dialogs) ? [...record.dialogs] : [];

    // Append the incoming turn to the model history.
    if (input.kind === "toolResults") {
      contents.push({
        role: "user",
        parts: input.results.map((r) => ({
          functionResponse: { name: r.name, response: { output: r.output } },
        })),
      });
    } else {
      contents.push({ role: "user", parts: [{ text: input.text }] });
      if (input.kind === "user") {
        dialogs.push({
          id: makeDialogId("user"),
          content: input.text,
          speaker: "user",
        });
      }
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Cache the static prefix so its tokens bill at the cache-hit rate instead
    // of the full input rate on every turn. When a cache is in use,
    // `systemInstruction`/`tools` MUST be omitted — they live in the cache, and
    // sending both is a 400. Otherwise inline them, exactly as before.
    const cache = await ensureTextCache(ai, record, model);
    const res = await ai.models.generateContent({
      model,
      contents,
      config: cache.usableName
        ? { cachedContent: cache.usableName }
        : {
            systemInstruction: record.instructions,
            tools: buildTools(record),
          },
    });

    // Bill this turn's tokens (authoritative — the server holds the metadata).
    const usage = mapUsage(res.usageMetadata);
    await recordUsage({
      userId,
      serviceType: "live_session",
      costInputs: extractTextCostCalculationInput(usage, model),
      modelUsed: model,
    });
    const totalUsage = accumulateUsage(record.usage || emptyUsage(), usage);

    // Persist the resolved cache state alongside the turn so the next turn
    // reuses (or knows to skip) the cache.
    const cachePatch: Record<string, any> = {
      cacheDisabled: cache.cacheDisabled,
    };
    if (cache.cacheName !== undefined) cachePatch.cacheName = cache.cacheName;
    if (cache.cacheExpireTime !== undefined)
      cachePatch.cacheExpireTime = cache.cacheExpireTime;

    const functionCalls = res.functionCalls || [];

    if (functionCalls.length > 0) {
      // Persist the model's EXACT function-call turn so the next request (with
      // the client's tool results) continues coherently. We must reuse the
      // response's own parts: on Gemini 3 each functionCall part carries a
      // `thoughtSignature` that the API requires when the call is fed back in
      // history — rebuilding from `functionCalls` alone drops it and the
      // follow-up turn fails with 400 INVALID_ARGUMENT.
      const modelContent = res.candidates?.[0]?.content ?? {
        role: "model",
        parts: functionCalls.map((fc) => ({ functionCall: fc })),
      };
      contents.push(modelContent);
      await collection.updateOne({ _id: sessionId, refId: userId } as any, {
        $set: { contents, usage: totalUsage, ...cachePatch },
      });
      return { done: false, functionCalls, usage, totalUsage };
    }

    const text = res.text ?? "";
    contents.push({ role: "model", parts: [{ text }] });
    if (text.trim()) {
      dialogs.push({ id: makeDialogId("ai"), content: text, speaker: "ai" });
    }
    await collection.updateOne({ _id: sessionId, refId: userId } as any, {
      $set: { contents, dialogs, usage: totalUsage, ...cachePatch },
    });
    return { done: true, text, usage, totalUsage };
  },
});

module.exports.functions = [createTextSession, textTurn];
