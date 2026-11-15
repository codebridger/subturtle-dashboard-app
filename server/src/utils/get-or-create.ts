/**
 * Get-or-create as one upsert (ADR-006 point 3). The old pattern, find and then create,
 * let two requests at once both create a document; on Firestore there are no transactions
 * to stop that. An upsert with `$setOnInsert` changes nothing when the document exists, and
 * when two upserts race on a unique index the loser gets a duplicate-key error (11000),
 * which means the document now exists: that counts as success.
 */
export const DUPLICATE_KEY = 11000;

export function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as any)?.code ?? (error as any)?.cause?.code;
  return code === DUPLICATE_KEY;
}

interface UpsertableCollection {
  updateOne(filter: any, update: any, options?: any): any;
}

/**
 * Creates the document matching `filter` unless one exists. `fields` are the values a new
 * document gets; the filter's own equality values are written too. Undefined values are
 * left out. Returns true when this call inserted the document.
 */
export async function getOrCreate(col: UpsertableCollection, filter: Record<string, any>, fields: Record<string, any>): Promise<boolean> {
  // A field the filter pins to a plain value is already written by the upsert; naming it
  // in $setOnInsert as well is refused by some MongoDB versions, so leave it out.
  const insert: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (key in filter && !isOperatorValue(filter[key])) continue;
    insert[key] = value;
  }
  try {
    const result: any = await col.updateOne(filter, { $setOnInsert: insert }, { upsert: true });
    return Boolean(result?.upsertedCount || result?.upsertedId);
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

function isOperatorValue(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date) && Object.keys(value).some((key) => key.startsWith("$"));
}
