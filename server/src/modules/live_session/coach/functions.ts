/**
 * The Coach prompt on the server (B-19, B-20, Q3, Q10).
 *
 * - `get-coach-instructions { language, explanationLanguage, phraseIds, mode }` →
 *   `{ instructions, voiceName, language, explanationLanguage, explanationSwitchedToEnglish, level }`.
 *   The client passes `instructions` and `voiceName` to `create-text-session` or
 *   `request-gemini-live-session-ephemeral-token`, which can also build it themselves
 *   from the same fields. Clients that still send raw `instructions` keep working.
 * - `flag-coach-explanation { sessionId, turnIndex, on }` → `{ on }`: "This explanation
 *   looks wrong". When many learners flag one (learning, explanation) pair, that pair's
 *   explanations switch to English.
 *
 * Its own folder so the live_session files stay small; modular-rest loads every
 * `functions.ts` under `modules/`.
 */
import { defineFunction } from "@modular-rest/server";
import { buildCoachSession, flagCoachExplanation } from "./service";

function requireUser(userId: unknown): string {
  if (typeof userId !== "string" || !userId) throw new Error("userId is required");
  return userId;
}

const getCoachInstructions = defineFunction({
  name: "get-coach-instructions",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; language?: string; explanationLanguage?: string; phraseIds?: string[]; mode?: "voice" | "text"; voice?: string }) => {
    const userId = requireUser(args?.userId);
    const session = await buildCoachSession(userId, args);
    return {
      instructions: session.instructions,
      voiceName: session.voiceName,
      language: session.language,
      explanationLanguage: session.explanationLanguage,
      explanationSwitchedToEnglish: session.explanationSwitchedToEnglish,
      level: session.level,
    };
  },
});

const flagCoachExplanationFn = defineFunction({
  name: "flag-coach-explanation",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; sessionId: string; turnIndex: number; on?: boolean; language?: string; explanationLanguage?: string }) => {
    const userId = requireUser(args?.userId);
    return flagCoachExplanation(userId, args);
  },
});

module.exports.functions = [getCoachInstructions, flagCoachExplanationFn];
