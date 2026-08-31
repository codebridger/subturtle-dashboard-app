import { describe, it, expect } from "@jest/globals";
import { pickPrimaryChunkText } from "../chunk";

describe("pickPrimaryChunkText", () => {
  it("picks the highest-confidence chunk's text", () => {
    const chunks = [
      { text: "I think", confidence: 0.42 },
      { text: "hit the sack", confidence: 0.95 },
    ];
    expect(pickPrimaryChunkText(chunks)).toBe("hit the sack");
  });

  it("tie-breaks equal confidence by the earliest chunk", () => {
    const chunks = [
      { text: "first", confidence: 0.8 },
      { text: "second", confidence: 0.8 },
    ];
    expect(pickPrimaryChunkText(chunks)).toBe("first");
  });

  it("returns null for an empty array", () => {
    expect(pickPrimaryChunkText([])).toBeNull();
  });

  it("returns null for undefined/null", () => {
    expect(pickPrimaryChunkText(undefined)).toBeNull();
    expect(pickPrimaryChunkText(null)).toBeNull();
  });

  it("returns null when the primary chunk has no text", () => {
    expect(pickPrimaryChunkText([{ confidence: 0.9 }])).toBeNull();
  });

  it("treats a missing confidence as 0 when ranking", () => {
    const chunks = [
      { text: "no-conf" },
      { text: "has-conf", confidence: 0.1 },
    ];
    expect(pickPrimaryChunkText(chunks)).toBe("has-conf");
  });
});
