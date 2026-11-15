import { describe, it, expect } from "@jest/globals";
import { checkClozeAnswer, clozeCueOf, primaryChunk } from "../cloze";

const chunk = (text: string, confidence: number, extra: any = {}) => ({ text, type: "other", confidence, ...extra });

describe("clozeCueOf", () => {
  it("uses the highest-confidence chunk, the earlier one on a tie", () => {
    expect(primaryChunk([chunk("a", 0.5), chunk("b", 0.9), chunk("c", 0.9)])?.text).toBe("b");
  });

  it("returns the cue and accepted answers, the text first", () => {
    const cue = clozeCueOf({
      chunks: [chunk("fängt ... an", 0.4), chunk("fängt an", 0.9, { lemma: "anfangen", form: "present, separated", acceptedAnswers: ["fängt an", "faengt an"] })],
    });
    expect(cue).toEqual({
      expected: "fängt an",
      cue: { lemma: "anfangen", form: "present, separated" },
      acceptedAnswers: ["fängt an", "faengt an"],
    });
  });

  it("works for a chunk saved before multilingual", () => {
    expect(clozeCueOf({ chunks: [chunk("give up", 0.8)] })).toEqual({
      expected: "give up",
      cue: { lemma: "give up", form: "" },
      acceptedAnswers: ["give up"],
    });
  });

  it("is null with no chunk", () => {
    expect(clozeCueOf({ chunks: [] })).toBeNull();
    expect(clozeCueOf(null)).toBeNull();
  });
});

describe("checkClozeAnswer", () => {
  it("checks against the cue and the phrase's language", () => {
    const phrase = { phrase: "Er fängt morgen an", language: "de", chunks: [chunk("fängt", 0.9, { lemma: "anfangen", acceptedAnswers: ["fängt"] })] };
    expect(checkClozeAnswer(phrase, "faengt")).toEqual({ result: "right", expected: "fängt", reason: "spelling" });
    expect(checkClozeAnswer(phrase, "anfangen").result).toBe("close");
    expect(checkClozeAnswer(phrase, "geht").result).toBe("wrong");
  });

  it("a phrase with no language is English, and with no chunk the whole phrase is the answer", () => {
    expect(checkClozeAnswer({ phrase: "I don't know" }, "I do not know").result).toBe("right");
  });

  it("the language argument wins over the phrase's", () => {
    const phrase = { phrase: "x", chunks: [chunk("está", 1)] };
    expect(checkClozeAnswer(phrase, "esta", "es").result).toBe("wrong");
    expect(checkClozeAnswer(phrase, "esta", "en").result).toBe("close");
  });
});
