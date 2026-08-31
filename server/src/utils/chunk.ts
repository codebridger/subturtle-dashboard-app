/**
 * Text of the "primary chunk" for the L3+ fill-in: the highest-`confidence` chunk,
 * tie-broken by earliest (the strict `>` keeps the earlier chunk on ties). Returns
 * `null` when there are no chunks so the renderer falls back to the recognition card.
 *
 * Council 005 — the single source of truth for the primary-chunk rule. Kept generic
 * over `{ text?, confidence? }` (like `translation/chunk-filter.ts`) so it doesn't bind
 * to either competing `Chunk` type (`translation/schema.ts` vs `phrase_bundle/db.ts`).
 */
export function pickPrimaryChunkText(
  chunks?: ReadonlyArray<{ text?: string; confidence?: number }> | null
): string | null {
  if (!Array.isArray(chunks) || chunks.length === 0) return null;
  const best = chunks.reduce((a, b) => ((b?.confidence ?? 0) > (a?.confidence ?? 0) ? b : a));
  return best?.text ?? null;
}
