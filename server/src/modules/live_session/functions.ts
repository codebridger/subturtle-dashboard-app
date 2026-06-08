/**
 * Live-session module entry point.
 *
 * Provider-specific functions live under `./openai/` and `./gemini/`. This
 * file owns the two provider-agnostic functions (`create-live-session-record`
 * and `update-live-session-record`) and aggregates the full function list
 * into the `module.exports.functions` array that `@modular-rest/server`
 * picks up.
 */
import { defineFunction, getCollection } from "@modular-rest/server";
import {
  ConversationDialogType,
  GeminiTokenUsageType,
  LiveSessionMetadataType,
  LiveSessionProvider,
  LiveSessionRecordType,
  LiveSessionType,
  SessionType,
  TokenUsageType,
  GeminiLiveSessionType,
} from "./types";
import {
  DATABASE,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
} from "../../config";
import { assertFeatureEnabled } from "../subscription/enforcement";
import { extractCostCalculationInput } from "./openai/utils";
import { extractGeminiCostCalculationInput } from "./gemini/utils";
import { recordUsage, debitVoiceMinutes } from "../subscription/service";
import { LIVE_SESSION_MODEL } from "./openai/config";
import { GEMINI_LIVE_SESSION_MODEL } from "./gemini/config";
import { requestEphemeralToken } from "./openai/functions";
import { requestGeminiEphemeralToken } from "./gemini/functions";
import { LIVE_SESSION_VOICES } from "./voices";

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

      // Total-usage replaces the field; partial-usage triggers a credit
      // deduction via the subscription service.
      if (update.totalUsage) {
        await collection.updateOne(
          { _id: sessionId, refId: userId },
          {
            $set: { usage: update.totalUsage },
          }
        );
      }

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

      // Dialogs upsert by id so retransmitted chunks merge into the same row.
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

        for (const newDialog of update.dialogs) {
          const existingIndex = updatedDialogs.findIndex(
            (d) => d.id === newDialog.id
          );
          if (existingIndex >= 0) {
            updatedDialogs[existingIndex] = newDialog;
          } else {
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

/**
 * List the user's past live sessions (voice + text, merged, newest first).
 * Full session history is a Learner+ entitlement (session_history) — free/Reader
 * are locked out and get a structured EntitlementLimitError so the frontend can
 * show an upgrade prompt instead of the list. Replaces the client-side dataProvider
 * list so the gate is enforced server-side.
 */
const listLiveSessions = defineFunction({
  name: "list-live-sessions",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, page = 0, limit = 20 } = context;
    await assertFeatureEnabled(userId, "session_history");

    const window = (page + 1) * limit;
    const voiceCol = getCollection<LiveSessionRecordType>(
      DATABASE,
      LIVE_SESSION_COLLECTION
    );
    const textCol = getCollection<any>(DATABASE, LIVE_SESSION_TEXT_COLLECTION);
    const [voice, text, voiceCount, textCount] = await Promise.all([
      voiceCol.find({ refId: userId }).sort({ createdAt: -1 }).limit(window),
      textCol.find({ refId: userId }).sort({ createdAt: -1 }).limit(window),
      voiceCol.countDocuments({ refId: userId }),
      textCol.countDocuments({ refId: userId }),
    ]);
    const merged = [...(voice as any[]), ...(text as any[])].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = voiceCount + textCount;
    return {
      items: merged.slice(page * limit, window),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      hasMore: (page + 1) * limit < total,
    };
  },
});

/**
 * Debit consumed voice minutes from the user's budget when a voice session ends.
 * The client reports the elapsed audio time in seconds; the server rounds up to
 * whole minutes and decrements the active budget (subscription or freemium).
 * Returns the updated budget so the client can reflect remaining minutes. The
 * pre-session gate (request-*-ephemeral-token) blocks once this hits zero.
 */
const debitVoiceMinutesFn = defineFunction({
  name: "debit-voice-minutes",
  permissionTypes: ["user_access"],
  callback: async function (context: { userId: string; seconds: number }) {
    const { userId, seconds } = context;
    const minutes = (Number(seconds) || 0) / 60;
    return debitVoiceMinutes(userId, minutes);
  },
});

/**
 * Returns the AI-coach voice list (single source of truth in `./voices`) so the
 * dashboard and extension render an identical picker. Static data; gated on
 * `user_access` only because every caller is already authenticated.
 */
const getLiveSessionVoices = defineFunction({
  name: "get-live-session-voices",
  permissionTypes: ["user_access", "anonymous_access"],
  callback: async function () {
    return LIVE_SESSION_VOICES;
  },
});

module.exports.functions = [
  requestEphemeralToken,
  requestGeminiEphemeralToken,
  createLiveSession,
  updateLiveSession,
  debitVoiceMinutesFn,
  listLiveSessions,
  getLiveSessionVoices,
];
