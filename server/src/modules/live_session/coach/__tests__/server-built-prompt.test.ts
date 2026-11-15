/**
 * B-19: the voice token and the text session build the prompt on the server when a
 * client sends `language` / `phraseIds` and no `instructions`; raw `instructions` from old
 * clients are used as before.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockBuild = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../service", () => ({ buildCoachSession: (...args: any[]) => mockBuild(...args) }));

const mockCreateToken = jest.fn<(...args: any[]) => Promise<any>>(async () => ({ name: "tok" }));
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({ authTokens: { create: mockCreateToken } })),
  Modality: { AUDIO: "AUDIO" },
}));
const mockCreate = jest.fn<(...args: any[]) => Promise<any>>(async () => ({ _id: "s1" }));
jest.mock("@modular-rest/server", () => ({
  defineFunction: (config: any) => config,
  // findOne: the profile and language profile reads (an account with no languages).
  getCollection: () => ({ create: mockCreate, findOne: async () => null }),
}));
jest.mock("../../../subscription/service", () => ({
  checkCreditAllocation: async () => ({ allowedToProceed: true }),
  isUserOnFreemium: async () => false,
  getOrCreateFreemiumAllocation: jest.fn(),
  updateFreemiumAllocation: jest.fn(),
  assertVoiceMinutesAvailable: async () => undefined,
  getVoiceSessionMaxSeconds: async () => 600,
  recordUsage: jest.fn(),
  assertAndConsumeTextChat: async () => undefined,
  getTextChatMessageCap: async () => null,
  refundTextChat: jest.fn(),
}));

import { requestGeminiEphemeralToken } from "../../gemini/functions";
const issueToken = (args: any) => (requestGeminiEphemeralToken as any).callback(args);
const { functions: textFunctions } = require("../../../live_session_text/functions") as { functions: any[] };
const createTextSession = textFunctions.find((f) => f.name === "create-text-session").callback;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GEMINI_API_KEY = "test";
  mockBuild.mockResolvedValue({ instructions: "SERVER PROMPT", voiceName: "Aoede" });
});

describe("voice token", () => {
  it("builds the prompt and voice on the server from language and phraseIds", async () => {
    const session = await issueToken({ userId: "u1", language: "de", explanationLanguage: "fa", phraseIds: ["a"] });
    expect(mockBuild).toHaveBeenCalledWith("u1", expect.objectContaining({ language: "de", mode: "voice" }));
    expect(session.instructions).toBe("SERVER PROMPT");
    expect(session.voice).toBe("Aoede");
    const config = (mockCreateToken.mock.calls[0][0] as any).config.liveConnectConstraints.config;
    expect(config.systemInstruction.parts[0].text).toBe("SERVER PROMPT");
  });

  it("keeps a voice the client picked", async () => {
    expect((await issueToken({ userId: "u1", language: "de", phraseIds: ["a"], voice: "Puck" })).voice).toBe("Puck");
  });

  it("uses raw instructions from old clients", async () => {
    const session = await issueToken({ userId: "u1", instructions: "OLD PROMPT" });
    expect(mockBuild).not.toHaveBeenCalled();
    expect(session.instructions).toBe("OLD PROMPT");
  });

  it("refuses a call with neither", async () => {
    await expect(issueToken({ userId: "u1" })).rejects.toThrow(/instructions are required/);
  });
});

describe("text session", () => {
  it("builds the prompt on the server", async () => {
    await createTextSession({ userId: "u1", language: "es", phraseIds: ["a"] });
    expect(mockBuild).toHaveBeenCalledWith("u1", expect.objectContaining({ mode: "text" }));
    expect((mockCreate.mock.calls[0][0] as any).instructions).toBe("SERVER PROMPT");
    // The record keeps its learning language for the per-language history (B-13).
    expect((mockCreate.mock.calls[0][0] as any).language).toBe("es");
  });

  it("uses raw instructions from old clients", async () => {
    await createTextSession({ userId: "u1", instructions: "OLD" });
    expect(mockBuild).not.toHaveBeenCalled();
    expect((mockCreate.mock.calls[0][0] as any).instructions).toBe("OLD");
    expect((mockCreate.mock.calls[0][0] as any).language).toBe("en");
  });
});
