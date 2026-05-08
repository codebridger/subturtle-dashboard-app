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
import { DATABASE, LIVE_SESSION_COLLECTION } from "../../config";
import { extractCostCalculationInput } from "./openai/utils";
import { extractGeminiCostCalculationInput } from "./gemini/utils";
import { recordUsage } from "../subscription/service";
import { LIVE_SESSION_MODEL } from "./openai/config";
import { GEMINI_LIVE_SESSION_MODEL } from "./gemini/config";
import { requestEphemeralToken } from "./openai/functions";
import { requestGeminiEphemeralToken } from "./gemini/functions";

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

module.exports.functions = [
  requestEphemeralToken,
  requestGeminiEphemeralToken,
  createLiveSession,
  updateLiveSession,
];
