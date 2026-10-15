/**
 * The cue a fill-the-gap (cloze) review card shows, and the answers it accepts (contract
 * section 3, B-10 and B-18). The checker and the cue rules live in `languages/cloze.ts`
 * (`clozeCueOf`); this adapter uses it when it is present and otherwise builds the same shape
 * from the phrase's primary chunk, so review items always carry `cue` and `acceptedAnswers`.
 */
export interface ClozeCue {
  cue: { lemma: string; form: string };
  acceptedAnswers: string[];
  expected: string;
}

type CueReader = (phrase: any) => ClozeCue | null;

function primaryChunk(phrase: any): any | null {
  const chunks: any[] = Array.isArray(phrase?.chunks) ? phrase.chunks : [];
  if (chunks.length === 0) return null;
  return chunks.reduce((a, b) => ((b?.confidence ?? 0) > (a?.confidence ?? 0) ? b : a));
}

/** The cue from the primary chunk: its lemma and form when known, else its text. */
export function chunkCueOf(phrase: any): ClozeCue | null {
  const chunk = primaryChunk(phrase);
  const text = typeof chunk?.text === "string" ? chunk.text.trim() : "";
  if (!text) return null;
  const lemma = typeof chunk.lemma === "string" && chunk.lemma.trim() ? chunk.lemma.trim() : text;
  const form = typeof chunk.form === "string" && chunk.form.trim() ? chunk.form.trim() : text;
  const listed: string[] = Array.isArray(chunk.acceptedAnswers)
    ? chunk.acceptedAnswers.filter((answer: unknown) => typeof answer === "string" && answer.trim()).map((answer: string) => answer.trim())
    : [];
  const acceptedAnswers = listed.includes(form) ? listed : [form, ...listed];
  return { cue: { lemma, form }, acceptedAnswers, expected: form };
}

let reader: CueReader | undefined;

function loadReader(): CueReader {
  if (reader) return reader;
  try {
    // The shared cloze rules (B-18), when this server has them.
    const shared = require("../../languages/cloze");
    reader = typeof shared?.clozeCueOf === "function" ? shared.clozeCueOf : chunkCueOf;
  } catch {
    reader = chunkCueOf;
  }
  return reader!;
}

/** `{ cue, acceptedAnswers }` for a review item, or nulls when the phrase has no chunk. */
export function clozeFields(phrase: any): { cue: ClozeCue["cue"] | null; acceptedAnswers: string[] } {
  let found: ClozeCue | null = null;
  try {
    found = phrase ? loadReader()(phrase) : null;
  } catch (error) {
    console.error("[cloze] cue failed; using the chunk text", error);
    found = chunkCueOf(phrase);
  }
  return { cue: found?.cue ?? null, acceptedAnswers: found?.acceptedAnswers ?? [] };
}
