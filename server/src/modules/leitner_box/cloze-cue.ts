/**
 * The cue a fill-the-gap (cloze) review card shows, and the answers it accepts (contract
 * section 3, B-10). They come from the shared cloze rules (`languages/cloze.ts`, B-18), the
 * same ones `check-cloze-answer` checks against, so the card and the check always agree.
 */
import { clozeCueOf, ClozeCue } from "../../languages/cloze";

/** `{ cue, acceptedAnswers }` for a review item, or nulls when the phrase has no chunk. */
export function clozeFields(phrase: any): { cue: ClozeCue["cue"] | null; acceptedAnswers: string[] } {
  const found = phrase ? clozeCueOf(phrase) : null;
  return { cue: found?.cue ?? null, acceptedAnswers: found?.acceptedAnswers ?? [] };
}
