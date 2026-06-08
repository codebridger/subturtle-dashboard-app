import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { z } from "zod";
import { OpenRouterService } from "../openrouter";

/**
 * These tests cover the retry + Zod-validation fallback added to
 * createStructuredOutputWithZod, which exists because free/flash models
 * intermittently return truncated or schema-invalid JSON.
 */
describe("OpenRouterService.createStructuredOutputWithZod", () => {
  const schema = z.object({
    translation: z.string(),
    confidence: z.number(),
  });

  let service: OpenRouterService;

  beforeEach(() => {
    service = new OpenRouterService({ apiKey: "test-key" });
  });

  // Build a fake OpenRouter response wrapping the given content string.
  const reply = (content: string) => ({
    id: "id",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });

  const baseArgs = {
    options: {
      models: ["test/model"],
      messages: [{ role: "user" as const, content: "hi" }],
      temperature: 0,
    },
    zodSchema: schema,
    schemaName: "test",
    strict: true,
  };

  it("returns validated data on the first valid response", async () => {
    const spy = jest
      .spyOn(service, "createChatCompletion")
      .mockResolvedValue(reply(JSON.stringify({ translation: "hola", confidence: 0.9 })));

    const result = await service.createStructuredOutputWithZod(baseArgs);

    expect(result).toEqual({ translation: "hola", confidence: 0.9 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries when the first response is malformed JSON, then succeeds", async () => {
    const spy = jest
      .spyOn(service, "createChatCompletion")
      .mockResolvedValueOnce(reply('{"translation": "hola"')) // truncated JSON
      .mockResolvedValueOnce(reply(JSON.stringify({ translation: "hola", confidence: 0.8 })));

    const result = await service.createStructuredOutputWithZod(baseArgs);

    expect(result).toEqual({ translation: "hola", confidence: 0.8 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries when the response parses but fails schema validation", async () => {
    const spy = jest
      .spyOn(service, "createChatCompletion")
      // valid JSON but missing the required `confidence` field
      .mockResolvedValueOnce(reply(JSON.stringify({ translation: "hola" })))
      .mockResolvedValueOnce(reply(JSON.stringify({ translation: "hola", confidence: 0.7 })));

    const result = await service.createStructuredOutputWithZod(baseArgs);

    expect(result).toEqual({ translation: "hola", confidence: 0.7 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("raises the temperature on each retry so deterministic models resample", async () => {
    const spy = jest
      .spyOn(service, "createChatCompletion")
      .mockResolvedValueOnce(reply("not json"))
      .mockResolvedValueOnce(reply("still not json"))
      .mockResolvedValueOnce(reply(JSON.stringify({ translation: "ok", confidence: 1 })));

    await service.createStructuredOutputWithZod(baseArgs);

    expect(spy).toHaveBeenCalledTimes(3);
    expect((spy.mock.calls[0][0] as any).temperature).toBe(0);
    expect((spy.mock.calls[1][0] as any).temperature).toBeCloseTo(0.3);
    expect((spy.mock.calls[2][0] as any).temperature).toBeCloseTo(0.6);
  });

  it("throws after exhausting all attempts", async () => {
    const spy = jest
      .spyOn(service, "createChatCompletion")
      .mockResolvedValue(reply("never valid"));

    await expect(
      service.createStructuredOutputWithZod({ ...baseArgs, retries: 1 })
    ).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(2); // 1 + 1 retry
  });

  it("does not retry when retries is 0", async () => {
    const spy = jest
      .spyOn(service, "createChatCompletion")
      .mockResolvedValue(reply("bad"));

    await expect(
      service.createStructuredOutputWithZod({ ...baseArgs, retries: 0 })
    ).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
