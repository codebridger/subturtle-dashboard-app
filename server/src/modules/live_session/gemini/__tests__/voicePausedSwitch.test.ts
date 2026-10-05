import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// defineFunction returns its config so the callback is reachable; mock the
// subscription service and genai so requiring the module stays light.
jest.mock("@modular-rest/server", () => ({
  defineFunction: (config: any) => config,
}));
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(),
  Modality: { AUDIO: "AUDIO" },
}));
jest.mock("../../../subscription/service", () => ({
  checkCreditAllocation: jest.fn(),
  isUserOnFreemium: jest.fn(),
  getOrCreateFreemiumAllocation: jest.fn(),
  updateFreemiumAllocation: jest.fn(),
  assertVoiceMinutesAvailable: jest.fn(),
  getVoiceSessionMaxSeconds: jest.fn(),
}));
jest.mock("../../../subscription/enforcement", () => ({
  EntitlementLimitError: class extends Error {},
}));

import {
  checkCreditAllocation,
  updateFreemiumAllocation,
} from "../../../subscription/service";
import { VOICE_PAUSED_CODE } from "../../../subscription/config";
import { requestGeminiEphemeralToken } from "../functions";

const issueToken = (args: any) =>
  (requestGeminiEphemeralToken as any).callback(args);

describe("request-gemini-live-session-ephemeral-token: VOICE_SESSIONS_PAUSED switch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VOICE_SESSIONS_PAUSED;
  });

  it("refuses a new session before touching credits or freemium slots", async () => {
    process.env.VOICE_SESSIONS_PAUSED = "true";
    await expect(
      issueToken({ userId: "u1", instructions: "hi" })
    ).rejects.toThrow(VOICE_PAUSED_CODE);
    expect(checkCreditAllocation).not.toHaveBeenCalled();
    expect(updateFreemiumAllocation).not.toHaveBeenCalled();
  });

  it("lets a resume leg through so running sessions can finish", async () => {
    process.env.VOICE_SESSIONS_PAUSED = "true";
    // Stop right after the switch: an exhausted budget proves the call got past it.
    (checkCreditAllocation as any).mockResolvedValue({ allowedToProceed: false });
    await expect(
      issueToken({ userId: "u1", instructions: "hi", isResume: true })
    ).rejects.toThrow("AI_CREDIT_EXHAUSTED");
    expect(checkCreditAllocation).toHaveBeenCalled();
  });

  it("does nothing unless the switch is exactly 'true'", async () => {
    process.env.VOICE_SESSIONS_PAUSED = "false";
    (checkCreditAllocation as any).mockResolvedValue({ allowedToProceed: false });
    await expect(
      issueToken({ userId: "u1", instructions: "hi" })
    ).rejects.toThrow("AI_CREDIT_EXHAUSTED");
  });
});
