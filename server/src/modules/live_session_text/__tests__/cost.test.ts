import {
  extractTextCostCalculationInput,
  mapUsage,
  accumulateUsage,
  emptyUsage,
} from "../utils";
import { TEXT_PRICES_PER_M, DEFAULT_TEXT_PRICE } from "../config";

describe("text session cost extraction", () => {
  const usage = {
    total_tokens: 130,
    prompt_tokens: 100,
    response_tokens: 20,
    cached_tokens: 30,
    thoughts_tokens: 5,
    tool_use_tokens: 10,
  };

  function byLabel(model: string) {
    const out = extractTextCostCalculationInput(usage, model);
    return Object.fromEntries(out.map((e) => [e.label, e]));
  }

  it("prices input/output/cached text at the model's rates", () => {
    const items = byLabel("gemini-2.5-flash-lite");
    const rate = TEXT_PRICES_PER_M["gemini-2.5-flash-lite"];

    // input = prompt + tool_use - cached = 100 + 10 - 30 = 80
    expect(items["Input Text Tokens"].totalTokens).toBe(80);
    expect(items["Input Text Tokens"].usdCostPerMillion).toBe(rate.promptText);

    // output = response + thoughts = 20 + 5 = 25
    expect(items["Output Text Tokens"].totalTokens).toBe(25);
    expect(items["Output Text Tokens"].usdCostPerMillion).toBe(rate.responseText);

    // cached billed at the input rate
    expect(items["Cached Text Tokens"].totalTokens).toBe(30);
    expect(items["Cached Text Tokens"].usdCostPerMillion).toBe(rate.promptText);
  });

  it("uses distinct rates per model", () => {
    const lite = byLabel("gemini-2.5-flash-lite");
    const flash = byLabel("gemini-2.5-flash");
    expect(flash["Input Text Tokens"].usdCostPerMillion).toBeGreaterThan(
      lite["Input Text Tokens"].usdCostPerMillion
    );
    expect(flash["Output Text Tokens"].usdCostPerMillion).toBe(
      TEXT_PRICES_PER_M["gemini-2.5-flash"].responseText
    );
  });

  it("falls back to the default rate for unknown models", () => {
    const items = byLabel("gemini-9-imaginary");
    expect(items["Input Text Tokens"].usdCostPerMillion).toBe(
      DEFAULT_TEXT_PRICE.promptText
    );
  });

  it("omits the cached line when there are no cached tokens", () => {
    const items = extractTextCostCalculationInput(
      { ...usage, cached_tokens: 0 },
      "gemini-2.5-flash"
    );
    expect(items.find((e) => e.label === "Cached Text Tokens")).toBeUndefined();
    // input no longer subtracts cached: 100 + 10 - 0 = 110
    expect(items.find((e) => e.label === "Input Text Tokens")!.totalTokens).toBe(
      110
    );
  });
});

describe("text session usage mapping", () => {
  it("maps generateContent usageMetadata (candidatesTokenCount)", () => {
    const u = mapUsage({
      promptTokenCount: 40,
      candidatesTokenCount: 12,
      cachedContentTokenCount: 8,
      thoughtsTokenCount: 3,
      toolUsePromptTokenCount: 2,
      totalTokenCount: 55,
    });
    expect(u.prompt_tokens).toBe(40);
    expect(u.response_tokens).toBe(12);
    expect(u.cached_tokens).toBe(8);
    expect(u.thoughts_tokens).toBe(3);
    expect(u.tool_use_tokens).toBe(2);
    expect(u.total_tokens).toBe(55);
  });

  it("falls back to responseTokenCount and a computed total", () => {
    const u = mapUsage({ promptTokenCount: 10, responseTokenCount: 7 });
    expect(u.response_tokens).toBe(7);
    expect(u.total_tokens).toBe(17);
  });

  it("accumulates running totals", () => {
    const total = emptyUsage();
    accumulateUsage(total, mapUsage({ promptTokenCount: 5, candidatesTokenCount: 3 }));
    accumulateUsage(total, mapUsage({ promptTokenCount: 2, candidatesTokenCount: 4 }));
    expect(total.prompt_tokens).toBe(7);
    expect(total.response_tokens).toBe(7);
  });
});
