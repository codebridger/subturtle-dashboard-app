/**
 * Gemini Live API live-session backend functions.
 *
 * Right now this module exposes a single function — the ephemeral-token
 * issuer. The shared `create-live-session-record` and
 * `update-live-session-record` functions remain in `../functions.ts` because
 * they are provider-aware and dispatch by the `provider` argument.
 *
 * Note: this file does NOT use modular-rest's `module.exports.functions = […]`
 * convention. The parent `live_session/functions.ts` aggregates and exports
 * the merged function list so the framework picks them up exactly once.
 */
import { defineFunction } from "@modular-rest/server";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  checkCreditAllocation,
  isUserOnFreemium,
  canStartFreemiumLiveSession,
  updateFreemiumAllocation,
} from "../../subscription/service";
import {
  GEMINI_LIVE_SESSION_MODEL,
  GEMINI_TOKEN_TTL_MS,
  GEMINI_NEW_SESSION_TTL_MS,
} from "./config";
import { AI_CREDIT_EXHAUSTED_CODE } from "../../subscription/config";
import { GeminiLiveSessionType } from "./types";

interface GeminiPracticeSetup {
  userId: string;
  instructions: string;
  voice?: string;
  tools?: any[];
  /**
   * When true, this is a reconnect leg (e.g. after `goAway` or the 15-minute
   * audio-session cap) and the request must NOT consume another freemium
   * session slot.
   */
  isResume?: boolean;
}

/**
 * Issue a single-use ephemeral token for a Gemini Live session.
 *
 * The token is constrained at issuance time (`liveConnectConstraints`) so
 * the model, response modalities, system instruction, voice, transcription,
 * resumption, and sliding-window compression are all locked server-side.
 * The browser uses the returned token with `@google/genai`'s
 * `ai.live.connect` against the v1alpha `BidiGenerateContentConstrained`
 * endpoint.
 */
export const requestGeminiEphemeralToken = defineFunction({
  name: "request-gemini-live-session-ephemeral-token",
  permissionTypes: ["user_access"],
  callback: async function (
    setup: GeminiPracticeSetup
  ): Promise<GeminiLiveSessionType> {
    const { userId, instructions, voice, tools, isResume } = setup;

    // AI features are the only thing the credit budget gates. `minCredits: 1`
    // means this blocks only at true exhaustion (the 100% hard cap) — saves
    // and Smart Review are never credit-gated and keep working.
    const { allowedToProceed } = await checkCreditAllocation({
      userId,
      minCredits: 1,
    });

    if (!allowedToProceed) {
      throw new Error(
        `${AI_CREDIT_EXHAUSTED_CODE}: AI features are paused — this month's AI budget is used up.`
      );
    }

    const isOnFreemium = await isUserOnFreemium(userId);
    if (isOnFreemium && !isResume) {
      const allowed = await canStartFreemiumLiveSession(userId);
      if (!allowed) {
        throw new Error(
          "User has reached the maximum number of allowed lived sessions"
        );
      }

      await updateFreemiumAllocation({
        userId,
        increment: {
          allowed_lived_sessions_used: 1,
        },
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured on the server");
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const now = Date.now();
      const voiceName = voice || "Kore";

      const liveConfig: any = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: instructions }] },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: {},
        contextWindowCompression: { slidingWindow: {} },
      };

      if (tools && tools.length > 0) {
        liveConfig.tools = [{ functionDeclarations: tools }];
      }

      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(now + GEMINI_TOKEN_TTL_MS).toISOString(),
          newSessionExpireTime: new Date(
            now + GEMINI_NEW_SESSION_TTL_MS
          ).toISOString(),
          liveConnectConstraints: {
            model: GEMINI_LIVE_SESSION_MODEL,
            config: liveConfig,
          },
        } as any,
      });

      const tokenValue = (token as any).name as string;
      if (!tokenValue) {
        throw new Error("Gemini did not return an ephemeral token name");
      }

      const expiresAtSec = Math.floor((now + GEMINI_TOKEN_TTL_MS) / 1000);

      const session: GeminiLiveSessionType = {
        model: GEMINI_LIVE_SESSION_MODEL,
        voice: voiceName,
        instructions,
        modalities: ["AUDIO"],
        expires_at: expiresAtSec,
        client_secret: {
          value: tokenValue,
          expires_at: expiresAtSec,
        },
      };

      return session;
    } catch (error) {
      console.error("Failed to create Gemini live session", error);
      const detail = (error as Error)?.message ?? String(error);
      throw new Error(`Failed to create Gemini live session: ${detail}`);
    }
  },
});

module.exports.functions = [];
