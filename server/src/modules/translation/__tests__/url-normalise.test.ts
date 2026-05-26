import { describe, it, expect } from "@jest/globals";
import { normaliseSourceUrl } from "../url-normalise";

describe("normaliseSourceUrl", () => {
  it("drops the query string (including timestamps)", () => {
    expect(
      normaliseSourceUrl("https://www.youtube.com/watch?v=abc123&t=42s")
    ).toBe("https://www.youtube.com/watch");
  });

  it("drops the fragment", () => {
    expect(normaliseSourceUrl("https://example.com/article#section-3")).toBe(
      "https://example.com/article"
    );
  });

  it("lowercases the host but keeps the path case", () => {
    expect(normaliseSourceUrl("https://EXAMPLE.com/Path/To")).toBe(
      "https://example.com/Path/To"
    );
  });

  it("removes a trailing slash but keeps the root slash", () => {
    expect(normaliseSourceUrl("https://example.com/path/")).toBe(
      "https://example.com/path"
    );
    expect(normaliseSourceUrl("https://example.com/")).toBe(
      "https://example.com/"
    );
  });

  it("is idempotent", () => {
    const once = normaliseSourceUrl(
      "https://www.youtube.com/watch?v=abc123&t=42s#comments"
    );
    expect(normaliseSourceUrl(once)).toBe(once);
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    expect(normaliseSourceUrl("not a url")).toBe("not a url");
  });

  it("returns empty string for falsy input", () => {
    expect(normaliseSourceUrl("")).toBe("");
    // @ts-expect-error testing runtime guard
    expect(normaliseSourceUrl(undefined)).toBe("");
  });
});
