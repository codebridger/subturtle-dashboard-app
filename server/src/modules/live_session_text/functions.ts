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
import { DEFAULT_TEXT_MODEL } from "./config";
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
    const chosenModel = model || DEFAULT_TEXT_MODEL;

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
    const res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: record.instructions,
        tools:
          record.toolDeclarations && record.toolDeclarations.length > 0
            ? [{ functionDeclarations: record.toolDeclarations }]
            : undefined,
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

    const functionCalls = res.functionCalls || [];

    if (functionCalls.length > 0) {
      // The model wants to call tools. Persist the pending function-call turn so
      // the next call (with the client's tool results) continues coherently.
      contents.push({
        role: "model",
        parts: functionCalls.map((fc) => ({ functionCall: fc })),
      });
      await collection.updateOne({ _id: sessionId, refId: userId } as any, {
        $set: { contents, usage: totalUsage },
      });
      return { done: false, functionCalls, usage, totalUsage };
    }

    const text = res.text ?? "";
    contents.push({ role: "model", parts: [{ text }] });
    if (text.trim()) {
      dialogs.push({ id: makeDialogId("ai"), content: text, speaker: "ai" });
    }
    await collection.updateOne({ _id: sessionId, refId: userId } as any, {
      $set: { contents, dialogs, usage: totalUsage },
    });
    return { done: true, text, usage, totalUsage };
  },
});

module.exports.functions = [createTextSession, textTurn];
