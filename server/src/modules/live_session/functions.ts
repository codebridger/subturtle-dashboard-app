import { defineFunction, getCollection } from "@modular-rest/server";
import {
  ConversationDialogType,
  GeminiLiveSessionType,
  GeminiTokenUsageType,
  LiveSessionMetadataType,
  LiveSessionProvider,
  LiveSessionRecordType,
  LiveSessionType,
  SessionType,
  TokenUsageType,
} from "./types";
import { DATABASE, LIVE_SESSION_COLLECTION } from "../../config";
import {
  extractCostCalculationInput,
  extractGeminiCostCalculationInput,
} from "./utils";
import {
  checkCreditAllocation,
  recordUsage,
  isUserOnFreemium,
  getOrCreateFreemiumAllocation,
  updateFreemiumAllocation,
} from "../subscription/service";
import {
  GEMINI_LIVE_SESSION_MODEL,
  LIVE_SESSION_MODEL,
  LIVE_SESSION_TRANSCRIPTION_MODEL,
} from "./config";
import { GoogleGenAI, Modality } from "@google/genai";
const fetch = require("node-fetch");
interface PracticeSetup {
  userId: string;
  instructions?: string;
  voice?: string;
  turn_detection?: boolean;
  tools?: any[];
  tool_choice?: string;
}

interface EphemeralToken {
  token: string;
  expires_in: number;
}

const requestEphemeralToken = defineFunction({
  name: "request-live-session-ephemeral-token",
  permissionTypes: ["user_access"],
  callback: async function (setup: PracticeSetup): Promise<EphemeralToken> {
    const validSetupKeys = [
      "instructions",
      "voice",
      "turn_detection",
      "tools",
      "tool_choice",
    ] as const;

    const additionalSetup: Partial<PracticeSetup> = {};
    for (const key of validSetupKeys) {
      if (setup[key]) {
        (additionalSetup as any)[key] = setup[key];
      }
    }

    //
    // Check if user has active subscription and has enough credits
    //
    const { allowedToProceed } = await checkCreditAllocation({
      userId: setup.userId,
      minCredits: 500000,
    });

    if (!allowedToProceed) {
      throw new Error(
        "User does not have enough credit or does not have an active subscription"
      );
    }

    //
    // Check if user has enough allowed lived sessions
    //
    const isOnFreemium = await isUserOnFreemium(setup.userId);
    if (isOnFreemium) {
      const freemiumAllocation = await getOrCreateFreemiumAllocation(
        setup.userId
      );

      if (
        freemiumAllocation.allowed_lived_sessions_used >=
        freemiumAllocation.allowed_lived_sessions
      ) {
        throw new Error(
          "User has reached the maximum number of allowed lived sessions"
        );
      }

      await updateFreemiumAllocation({
        userId: setup.userId,
        increment: {
          allowed_lived_sessions_used: 1,
        },
      });
    }

    //
    // Create live session
    //

    try {
      // https://platform.openai.com/docs/guides/realtime-webrtc#creating-an-ephemeral-token
      // https://platform.openai.com/docs/api-reference/realtime-sessions/create
      const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: LIVE_SESSION_MODEL,
          temperature: 0.6,
          // input_audio_transcription: {
          //   model: LIVE_SESSION_TRANSCRIPTION_MODEL,
          // },
          ...additionalSetup,
        }),
      });

      if (r.status < 200 || r.status >= 299) {
        const body = await r.json().then((data: any) => console.error(data));
        console.error("Failed to create practice live session", body);
        throw new Error(
          `Failed to create practice live session, Openai status: ${r.status}`
        );
      }

      const ephemeralToken = (await r.json()) as EphemeralToken;
      return ephemeralToken;
    } catch (error) {
      throw new Error("Failed to create practice live session");
    }
  },
});

const createLiveSession = defineFunction({
  name: "create-live-session-record",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: String;
    session: LiveSessionType | GeminiLiveSessionType;
    type: SessionType;
    provider?: LiveSessionProvider;
    metadata?: LiveSessionMetadataType;
  }) {
    const { userId, session, type, provider, metadata } = context;
    const collection = getCollection(DATABASE, LIVE_SESSION_COLLECTION);

    try {
      const recordedSession = await collection.create({
        refId: userId,
        type,
        provider,
        session,
        metadata,
      });

      return recordedSession.toJSON();
    } catch (error) {
      throw new Error("Failed to create live session record");
    }
  },
});

const updateLiveSession = defineFunction({
  name: "update-live-session-record",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    sessionId: string;
    provider?: LiveSessionProvider;
    update: {
      partialUsage?: TokenUsageType | GeminiTokenUsageType;
      totalUsage?: TokenUsageType | GeminiTokenUsageType;
      dialogs?: ConversationDialogType[];
    };
  }) {
    const { userId, sessionId, provider, update } = context;
    const collection = getCollection<LiveSessionRecordType>(
      DATABASE,
      LIVE_SESSION_COLLECTION
    );

    try {
      if (Object.keys(update).length === 0) {
        throw new Error("one of usage or dialogs must be provided");
      }

      // Handle total usage update
      if (update.totalUsage) {
        await collection.updateOne(
          { _id: sessionId, refId: userId },
          {
            $set: { usage: update.totalUsage },
          }
        );
      }

      // Handle partial usage update
      if (update.partialUsage) {
        const isGemini = provider === "gemini";
        const costs = isGemini
          ? extractGeminiCostCalculationInput(
              update.partialUsage as GeminiTokenUsageType
            )
          : extractCostCalculationInput(
              update.partialUsage as TokenUsageType
            );
        await recordUsage({
          userId,
          serviceType: "live_session",
          costInputs: costs,
          modelUsed: isGemini ? GEMINI_LIVE_SESSION_MODEL : LIVE_SESSION_MODEL,
        });
      }

      // Handle dialogs update
      if (update.dialogs && update.dialogs.length > 0) {
        const session = await collection.findOne(
          {
            _id: sessionId,
            refId: userId,
          } as any,
          { dialogs: 1 }
        );

        if (!session) {
          throw new Error("Session not found");
        }

        const existingDialogs = session.dialogs || [];
        const updatedDialogs = [...existingDialogs];

        // For each new dialog, replace existing one with same ID or add it
        for (const newDialog of update.dialogs) {
          const existingIndex = updatedDialogs.findIndex(
            (d) => d.id === newDialog.id
          );
          if (existingIndex >= 0) {
            // Replace existing dialog with same ID
            updatedDialogs[existingIndex] = newDialog;
          } else {
            // Add new dialog
            updatedDialogs.push(newDialog);
          }
        }

        await collection.updateOne({ _id: sessionId, refId: userId } as any, {
          $set: { dialogs: updatedDialogs },
        });
      }

      return { success: true, sessionId };
    } catch (error) {
      throw new Error("Failed to update live session record: " + error);
    }
  },
});

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

// Tokens stay valid for 30 minutes; the constrained connection has its own
// 15-minute audio cap and we always issue a fresh token before then.
const GEMINI_TOKEN_TTL_MS = 30 * 60 * 1000;
// The client must open the WebSocket within this window after issuance.
const GEMINI_NEW_SESSION_TTL_MS = 60 * 1000;

/**
 * Issue a single-use ephemeral token for a Gemini Live session.
 *
 * The token is constrained at issuance time
 * (`liveConnectConstraints`) so the model, response modalities, system
 * instruction, voice, transcription, resumption, and sliding-window
 * compression are all locked server-side. The browser uses the returned token
 * with `@google/genai`'s `ai.live.connect` against the v1alpha
 * `BidiGenerateContentConstrained` endpoint.
 */
const requestGeminiEphemeralToken = defineFunction({
  name: "request-gemini-live-session-ephemeral-token",
  permissionTypes: ["user_access"],
  callback: async function (
    setup: GeminiPracticeSetup
  ): Promise<GeminiLiveSessionType> {
    const { userId, instructions, voice, tools, isResume } = setup;

    const { allowedToProceed } = await checkCreditAllocation({
      userId,
      minCredits: 500000,
    });

    if (!allowedToProceed) {
      throw new Error(
        "User does not have enough credit or does not have an active subscription"
      );
    }

    const isOnFreemium = await isUserOnFreemium(userId);
    if (isOnFreemium && !isResume) {
      const freemiumAllocation = await getOrCreateFreemiumAllocation(userId);

      if (
        freemiumAllocation.allowed_lived_sessions_used >=
        freemiumAllocation.allowed_lived_sessions
      ) {
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

module.exports.functions = [
  requestEphemeralToken,
  requestGeminiEphemeralToken,
  createLiveSession,
  updateLiveSession,
];
