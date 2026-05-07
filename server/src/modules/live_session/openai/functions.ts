/**
 * OpenAI Realtime live-session backend functions.
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
import {
  checkCreditAllocation,
  isUserOnFreemium,
  getOrCreateFreemiumAllocation,
  updateFreemiumAllocation,
} from "../../subscription/service";
import { LIVE_SESSION_MODEL } from "./config";
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

/**
 * Issue an ephemeral OpenAI Realtime session token.
 *
 * Docs:
 *   https://platform.openai.com/docs/guides/realtime-webrtc#creating-an-ephemeral-token
 *   https://platform.openai.com/docs/api-reference/realtime-sessions/create
 */
export const requestEphemeralToken = defineFunction({
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

    const { allowedToProceed } = await checkCreditAllocation({
      userId: setup.userId,
      minCredits: 500000,
    });

    if (!allowedToProceed) {
      throw new Error(
        "User does not have enough credit or does not have an active subscription"
      );
    }

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

    try {
      const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: LIVE_SESSION_MODEL,
          temperature: 0.6,
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
