/**
 * The fill-in-the-gap cue of a stored phrase (B-15, B-18), shared by `check-cloze-answer`
 * and the review session (B-10), so the card the client shows and the answer the server
 * checks always come from the same chunk.
 *
 * The gap is the phrase's primary chunk (highest `confidence`, earliest on a tie: the
 * same rule as `utils/chunk.ts`). A chunk saved before B-15 has no `lemma`, `form` or
 * `acceptedAnswers`: its own text is the only accepted answer and the cue shows its text.
 */
import { checkAnswer, CheckOutput } from "./answer-check";
import { langOf } from "./helper";

export interface StoredChunk {
  text?: string;
  confidence?: number;
  lemma?: string;
  form?: string;
  acceptedAnswers?: string[];
}

export interface ClozeCue {
  /** The chunk text the gap hides, as it appears in the phrase. */
  expected: string;
  cue: { lemma: string; form: string };
  acceptedAnswers: string[];
}

/** The primary chunk: highest confidence, the earlier one on a tie. */
export function primaryChunk(chunks: ReadonlyArray<StoredChunk> | null | undefined): StoredChunk | null {
  if (!Array.isArray(chunks) || chunks.length === 0) return null;
  return chunks.reduce((a, b) => ((b?.confidence ?? 0) > (a?.confidence ?? 0) ? b : a));
}

/** The cue and accepted answers of a phrase, or null when it has no chunk to blank. */
export function clozeCueOf(phrase: { chunks?: StoredChunk[] | null } | null | undefined): ClozeCue | null {
  const chunk = primaryChunk(phrase?.chunks);
  const text = typeof chunk?.text === "string" ? chunk.text.trim() : "";
  if (!chunk || !text) return null;

  const answers = [text];
  for (const value of Array.isArray(chunk.acceptedAnswers) ? chunk.acceptedAnswers : []) {
    const answer = typeof value === "string" ? value.trim() : "";
    if (answer && !answers.some((a) => a.toLocaleLowerCase() === answer.toLocaleLowerCase())) answers.push(answer);
  }
  return {
    expected: text,
    cue: { lemma: (chunk.lemma || "").trim() || text, form: (chunk.form || "").trim() },
    acceptedAnswers: answers,
  };
}

/**
 * Check a typed answer for a stored phrase. A phrase with no chunk is checked against the
 * whole phrase text. `language` overrides the phrase's own (a phrase with none is English).
 */
export function checkClozeAnswer(
  phrase: { phrase?: string; chunks?: StoredChunk[] | null; language?: unknown },
  answer: string,
  language?: string
): CheckOutput {
  const cloze = clozeCueOf(phrase);
  const accepted = cloze ? cloze.acceptedAnswers : [String(phrase?.phrase || "").trim()].filter(Boolean);
  return checkAnswer({
    answer,
    accepted,
    lemma: cloze?.cue.lemma,
    language: language || langOf(phrase),
  });
}
