/**
 * Completes the fill-in-the-gap cue on each chunk (B-15, B-18): `lemma`, `form` and
 * `acceptedAnswers`. The model is asked for all three, but a missing or messy value must
 * never break a card: the exact chunk text is always the first accepted answer, the lemma
 * falls back to the text, and the list is de-duplicated and capped.
 */

/** At most this many accepted answers per chunk. */
export const MAX_ACCEPTED_ANSWERS = 8;

/** Longest accepted answer kept; a longer one is a sentence, not a chunk variant. */
const MAX_ANSWER_LENGTH = 120;

export interface CueFields {
  text: string;
  lemma?: string;
  form?: string;
  acceptedAnswers?: string[];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** The chunk with a complete cue. Never changes `text`. */
export function completeCue<T extends CueFields>(chunk: T): T & Required<Pick<CueFields, "lemma" | "form" | "acceptedAnswers">> {
  const text = clean(chunk.text);
  const answers: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [text, ...(Array.isArray(chunk.acceptedAnswers) ? chunk.acceptedAnswers : [])]) {
    const answer = clean(candidate);
    if (!answer || answer.length > MAX_ANSWER_LENGTH) continue;
    const key = answer.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
    if (answers.length >= MAX_ACCEPTED_ANSWERS) break;
  }
  return {
    ...chunk,
    lemma: clean(chunk.lemma) || text,
    form: clean(chunk.form),
    acceptedAnswers: answers,
  };
}

/** `completeCue` for every chunk; a non-array becomes []. */
export function completeCues<T extends CueFields>(chunks: T[] | null | undefined) {
  return Array.isArray(chunks) ? chunks.map((chunk) => completeCue(chunk)) : [];
}
