/** textToSpeechBase64 picks the language's non-HD speechVoice when it can. */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockSynthesize = jest.fn<(request: any) => Promise<Buffer>>(async () => Buffer.from("mp3"));
jest.mock("../tts", () => ({ synthesizeSpeech: (request: any) => mockSynthesize(request) }));
jest.mock("@modular-rest/server", () => ({ defineFunction: (opts: any) => opts, getCollection: () => ({}) }));
jest.mock("../../../utils/analytics", () => ({ trackServerEvent: jest.fn(), SERVER_ANALYTICS_EVENTS: {} }));
jest.mock("../service", () => ({}));

const { functions, resolveSpeechVoice } = require("../functions") as { functions: any[]; resolveSpeechVoice: any };
const tts = functions.find((f) => f.name === "textToSpeechBase64").callback;

beforeEach(() => {
  mockSynthesize.mockClear();
});

describe("textToSpeechBase64", () => {
  it("keeps today's English default", async () => {
    expect(await tts({ text: "hi" })).toBe(`data:audio/mp3;base64,${Buffer.from("mp3").toString("base64")}`);
    expect(mockSynthesize).toHaveBeenCalledWith(expect.objectContaining({ languageCode: "en-US", voiceName: "en-US-Standard-A" }));
  });

  it("uses the language's speechVoice when a language is sent with no voice", async () => {
    await tts({ text: "Hallo", language: "de" });
    expect(mockSynthesize).toHaveBeenCalledWith(expect.objectContaining({ text: "Hallo", languageCode: "de-DE", voiceName: "de-DE-Neural2-G" }));
  });

  it("falls back to speechVoice instead of failing on an HD voice", async () => {
    await tts({ text: "Labas", voiceName: "lt-LT-Chirp3-HD-Kore", languageCode: "lt-LT" });
    expect(mockSynthesize).toHaveBeenCalledWith(expect.objectContaining({ languageCode: "lt-LT", voiceName: "lt-LT-Standard-B" }));
    await tts({ text: "Hej", voiceName: "en-US-Chirp3-HD-Kore", language: "sv" });
    expect(mockSynthesize).toHaveBeenLastCalledWith(expect.objectContaining({ voiceName: "sv-SE-Wavenet-A" }));
  });

  it("keeps a non-HD voice the caller names", async () => {
    await tts({ text: "x", voiceName: "es-ES-Standard-B", language: "de" });
    expect(mockSynthesize).toHaveBeenCalledWith(expect.objectContaining({ languageCode: "es-ES", voiceName: "es-ES-Standard-B" }));
  });

  it("still refuses an HD voice it cannot replace", async () => {
    await expect(tts({ text: "x", voiceName: "ja-JP-Chirp3-HD-Kore" })).rejects.toThrow(/HD voices are not supported/);
    expect(mockSynthesize).not.toHaveBeenCalled();
  });

  it("every launch language resolves to a voice", () => {
    for (const code of ["en", "es", "de", "fr", "it", "sv", "lt"]) expect(resolveSpeechVoice({ language: code }).voiceName).not.toMatch(/HD/);
  });
});
