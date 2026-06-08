/**
 * Normalise text for a forgiving "does this appear in the selection?" check:
 * lower-case, collapse any run of whitespace to a single space, and trim. This
 * lets a chunk the model capitalised differently (or that spans a line break)
 * still match, while still rejecting patterns that simply are not in the
 * selection.
 */
function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Keep only the chunks whose `text` actually appears inside the user's marked
 * selection (`phrase`).
 *
 * The detailed-translation and advice models intermittently surface reusable
 * patterns drawn from the surrounding `context` rather than the marked text
 * itself — e.g. selecting "improvements are included" yet returning "related to"
 * and "based on", which only exist in the context paragraph. Chunks must come
 * from the marked text only, so this is the deterministic guardrail that
 * enforces that contract regardless of what the model returns.
 *
 * Matching is whitespace- and case-insensitive but otherwise verbatim (no
 * punctuation stripping), matching the "appears verbatim inside the selection"
 * rule the prompts ask the model to follow.
 */
export function filterChunksToSelection<T extends { text: string }>(
  chunks: T[] | undefined | null,
  phrase: string
): T[] {
  if (!Array.isArray(chunks)) return [];

  const selection = normaliseForMatch(typeof phrase === "string" ? phrase : "");
  if (!selection) return [];

  return chunks.filter((chunk) => {
    const text =
      typeof chunk?.text === "string" ? normaliseForMatch(chunk.text) : "";
    return text.length > 0 && selection.includes(text);
  });
}
