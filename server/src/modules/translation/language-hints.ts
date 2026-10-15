/**
 * What a reusable chunk looks like in each learning language (work list B-15). English was
 * the only language before multilingual, so the chunk types were English ones
 * (`phrasal_verb`). The launch set (Q15: en, es, de, fr, it, sv, lt) needs its own patterns:
 * German separable verbs, reflexive verbs, the gender that goes with a noun, Swedish
 * particle verbs, Lithuanian case government, and so on.
 *
 * The prompts read `chunkHintsFor(language)`; the schema enum is `CHUNK_TYPES`.
 */
import { LangCode, toCode, toTitle } from "../../languages/helper";

/** Every chunk type the model may return. Old clients treat unknown types as "other". */
export const CHUNK_TYPES = [
  "collocation",
  "phrasal_verb", // English: "give up"
  "particle_verb", // Swedish: "tycka om", "ge upp"
  "separable_verb", // German: "fängt ... an" (anfangen)
  "reflexive_verb", // "sich freuen", "levantarse", "se souvenir", "praustis"
  "gendered_noun", // a noun learnt with its gender: "der Tisch", "la mesa", "ett hus"
  "verb_preposition", // a verb and the preposition it takes: "warten auf", "pensar en"
  "case_government", // a word and the case it needs: Lithuanian "padėti draugui" (dative)
  "idiom",
  "fixed_expression", // "il y a", "por supuesto", "hur mår du"
  "discourse_marker",
  "other",
] as const;

export type ChunkType = (typeof CHUNK_TYPES)[number];

/** One line per language: the patterns worth learning there, in plain words for the model. */
const HINTS: Record<LangCode, string> = {
  en: "English: phrasal verbs (give up, run into), collocations (make a decision), idioms, discourse markers (by the way). Contractions (don't, it's) are valid accepted answers next to the full form.",
  es: "Spanish: reflexive verbs (levantarse, acordarse de), nouns with their gender and article (la mesa, el problema), verbs with their preposition (pensar en, soñar con), ser/estar uses, fixed expressions (por supuesto, sin embargo), idioms.",
  de: "German: separable verbs (anfangen: 'fängt ... an'), reflexive verbs (sich freuen auf), nouns with their gender and article (der Tisch, die Zeit, das Kind), verbs with their preposition and case (warten auf + accusative), fixed expressions (es gibt), idioms.",
  fr: "French: reflexive verbs (se souvenir de, s'en aller), nouns with their gender and article (la table, le problème), verbs with their preposition (penser à, avoir besoin de), fixed expressions (il y a, en fait), negation (ne ... pas), idioms.",
  it: "Italian: reflexive and pronominal verbs (alzarsi, farcela, andarsene), nouns with their gender and article (la casa, il problema), verbs with their preposition (pensare a, avere bisogno di), articulated prepositions (nel, della), fixed expressions (per forza), idioms.",
  sv: "Swedish: particle verbs (tycka om, ge upp, hålla med), reflexive verbs (sätta sig, känna sig), nouns with en/ett gender (en bil, ett hus), verbs with their preposition (vänta på, tänka på), fixed expressions (hur mår du), idioms.",
  lt: "Lithuanian: case government (a verb or preposition and the case it needs: padėti draugui, dative; be cukraus, genitive), reflexive verbs (praustis, džiaugtis), nouns with their gender, verbs with their preposition (galvoti apie), fixed expressions, idioms.",
};

/** The chunk guidance for a learning language, or a general line when it has none. */
export function chunkHintsFor(language: unknown): string {
  const code = toCode(language);
  if (code && HINTS[code]) return HINTS[code];
  const name = code ? toTitle(code) : "the selection's language";
  return `${name}: the patterns a learner of ${name} needs (collocations, verbs with their preposition or particle, reflexive verbs, nouns with their gender, fixed expressions, idioms).`;
}

/** True when the register has its own chunk guidance for the language. */
export function hasChunkHints(language: unknown): boolean {
  const code = toCode(language);
  return !!code && !!HINTS[code];
}

/** The cue rules every prompt shares (lemma, form, accepted answers). */
export const CUE_RULES = `For each chunk also give the cue a fill-in-the-gap card shows:
  - "lemma": the dictionary form of the chunk in its own language (the infinitive for a verb, with "sich"/"se"/"-si" for a reflexive verb, the whole separable verb "anfangen"; a noun with its article "der Tisch", "la mesa", "ett hus"). The same as "text" when the text is already the dictionary form.
  - "form": a short label in ENGLISH for the form used in the text ("past tense, 3rd person singular", "dative plural", "present, separated"). An empty string when it is the dictionary form.
  - "acceptedAnswers": every answer that is correct for the gap in THIS sentence, the exact "text" first. Add only true variants: contractions and their full forms ("don't" / "do not"), other correct spellings. Never add a different form of the word or a synonym.`;
