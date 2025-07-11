import { defineFunction, getCollection } from "@modular-rest/server";
import {
  ConversationDialogType,
  LiveSessionMetadataType,
  LiveSessionRecordType,
  LiveSessionType,
  SessionType,
  TokenUsageType,
} from "./types";
import { DATABASE, LIVE_SESSION_COLLECTION } from "../../config";
import { extractCostCalculationInput } from "./utils";
import {
  checkCreditAllocation,
  recordUsage,
  isUserOnFreemium,
  getOrCreateFreemiumAllocation,
  updateFreemiumAllocation,
} from "../subscription/service";
import { LIVE_SESSION_MODEL, LIVE_SESSION_TRANSCRIPTION_MODEL } from "./config";
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
    session: LiveSessionType;
    type: SessionType;
    metadata?: LiveSessionMetadataType;
  }) {
    const { userId, session, type, metadata } = context;
    const collection = getCollection(DATABASE, LIVE_SESSION_COLLECTION);

    try {
      const recordedSession = await collection.create({
        refId: userId,
        type,
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
    update: {
      partialUsage: TokenUsageType;
      totalUsage?: TokenUsageType;
      dialogs?: ConversationDialogType[];
    };
  }) {
    const { userId, sessionId, update } = context;
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
        // Report total usage to subscription service
        const costs = extractCostCalculationInput(update.partialUsage);
        await recordUsage({
          userId,
          serviceType: "live_session",
          costInputs: costs,
          modelUsed: LIVE_SESSION_MODEL,
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

module.exports.functions = [
  requestEphemeralToken,
  createLiveSession,
  updateLiveSession,
];
