import { describe, it, expect } from "@jest/globals";
import { completeCue, completeCues, MAX_ACCEPTED_ANSWERS } from "../chunk-cue";

describe("completeCue", () => {
  it("puts the exact text first and removes duplicates", () => {
    const out = completeCue({ text: "don't", lemma: "do not", form: "", acceptedAnswers: ["do not", "Don't", " don't "] });
    expect(out.acceptedAnswers).toEqual(["don't", "do not"]);
  });

  it("fills a missing cue from the text", () => {
    const out = completeCue({ text: "der Tisch" } as any);
    expect(out).toEqual({ text: "der Tisch", lemma: "der Tisch", form: "", acceptedAnswers: ["der Tisch"] });
  });

  it("caps the list and drops sentences", () => {
    const many = Array.from({ length: 20 }, (_, i) => `v${i}`);
    expect(completeCue({ text: "x", acceptedAnswers: many }).acceptedAnswers).toHaveLength(MAX_ACCEPTED_ANSWERS);
    expect(completeCue({ text: "x", acceptedAnswers: ["y".repeat(200)] }).acceptedAnswers).toEqual(["x"]);
  });

  it("handles a missing chunk list", () => {
    expect(completeCues(undefined)).toEqual([]);
  });
});
