import { describe, it, expect } from "@jest/globals";
import { filterChunksToSelection } from "../chunk-filter";

describe("filterChunksToSelection", () => {
  it("drops chunks taken from the context, keeping only those in the marked text", () => {
    // The real-world failing case from the task: the marked text is
    // "improvements are included", yet the model also returned "related to" and
    // "based on", which appear only in the surrounding context.
    const phrase = "improvements are included";
    const chunks = [
      { text: "improvements are included", type: "other" },
      { text: "related to", type: "collocation" },
      { text: "based on", type: "collocation" },
    ];

    expect(filterChunksToSelection(chunks, phrase)).toEqual([
      { text: "improvements are included", type: "other" },
    ]);
  });

  it("keeps a chunk that appears verbatim inside a longer selection", () => {
    const phrase = "they finally decided to give up on the project";
    const chunks = [
      { text: "give up on", type: "phrasal_verb" },
      { text: "in the end", type: "discourse_marker" }, // not in the selection
    ];

    expect(filterChunksToSelection(chunks, phrase)).toEqual([
      { text: "give up on", type: "phrasal_verb" },
    ]);
  });

  it("matches case- and whitespace-insensitively", () => {
    const phrase = "In Fact, the\nresults were good";
    const chunks = [
      { text: "in fact" }, // different case
      { text: "the   results" }, // collapsed whitespace vs newline
    ];

    expect(filterChunksToSelection(chunks, phrase)).toEqual([
      { text: "in fact" },
      { text: "the   results" },
    ]);
  });

  it("drops chunks with empty or whitespace-only text", () => {
    const phrase = "a perfectly normal sentence";
    const chunks = [{ text: "" }, { text: "   " }, { text: "normal" }];

    expect(filterChunksToSelection(chunks, phrase)).toEqual([
      { text: "normal" },
    ]);
  });

  it("returns an empty array when the selection is empty", () => {
    expect(filterChunksToSelection([{ text: "anything" }], "")).toEqual([]);
  });

  it("returns an empty array for missing or non-array chunks", () => {
    expect(filterChunksToSelection(undefined, "some phrase")).toEqual([]);
    expect(filterChunksToSelection(null, "some phrase")).toEqual([]);
  });
});
