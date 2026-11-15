/**
 * The shared fill-in-the-gap checker (work list B-18, decision Q4). One rule for every
 * client: the server checks a typed answer and returns
 *
 * - `right`: an accepted answer, or the same word in an equal spelling (German ß = ss,
 *   ä = ae; French œ = oe; an English contraction and its full form; case and outer
 *   punctuation never count);
 * - `close` ("Almost"): the right word with the wrong form (the dictionary form when the
 *   sentence needs another one, a wrong ending), a missing or wrong accent that does not
 *   change the word, or a swapped or doubled letter;
 * - `wrong`: anything else, including a missing accent that makes a different word
 *   (Spanish "si" for "sí", French "ou" for "où", German "schon" for "schön").
 *
 * "Close" keeps the card in its box (Q4); the review log stores it as `close`.
 */
import { DEFAULT_LANGUAGE, LangCode, toCode } from "./helper";

export type ReviewResult = "right" | "close" | "wrong";

export type CheckReason =
  | "exact" // an accepted answer
  | "spelling" // an equal spelling (ß/ss, ä/ae, œ/oe, contraction)
  | "accent" // a missing or wrong accent that keeps the word
  | "changes_word" // the accent is what tells two words apart
  | "form" // the right word in another form
  | "typo" // two letters swapped, or a double letter typed once (or twice)
  | "empty"
  | "wrong";

export interface CheckInput {
  answer: string;
  /** The accepted answers; the first is the one shown as the expected answer. */
  accepted: string[];
  /** The dictionary form from the cue, if any ("anfangen", "der Tisch"). */
  lemma?: string;
  /** The learning language; missing means English. */
  language?: string;
}

export interface CheckOutput {
  result: ReviewResult;
  expected: string;
  reason: CheckReason;
}

const RANK: Record<ReviewResult, number> = { right: 2, close: 1, wrong: 0 };

// Words that differ only by an accent and are different words (not two forms of one word).
// Typing the plain one for the accented one (or the other way round) is wrong, not almost.
const ACCENT_PAIRS: Record<LangCode, string[][]> = {
  es: [
    ["si", "sí"], ["el", "él"], ["tu", "tú"], ["mi", "mí"], ["te", "té"], ["se", "sé"], ["de", "dé"],
    ["mas", "más"], ["aun", "aún"], ["que", "qué"], ["como", "cómo"], ["donde", "dónde"], ["cuando", "cuándo"],
    ["quien", "quién"], ["cual", "cuál"], ["esta", "está"], ["este", "esté"], ["papa", "papá"], ["mama", "mamá"],
    ["ano", "año"], ["anos", "años"], ["pena", "peña"], ["cana", "caña"], ["sueno", "sueño"],
  ],
  fr: [
    ["a", "à"], ["ou", "où"], ["la", "là"], ["du", "dû"], ["sur", "sûr"], ["mur", "mûr"], ["des", "dès"],
    ["cote", "côte", "côté"], ["tache", "tâche"], ["jeune", "jeûne"], ["notre", "nôtre"], ["votre", "vôtre"],
    ["mais", "maïs"], ["foret", "forêt"], ["pecher", "pêcher", "pécher"],
  ],
  it: [
    ["e", "è"], ["da", "dà"], ["la", "là"], ["li", "lì"], ["si", "sì"], ["se", "sé"], ["ne", "né"], ["te", "tè"],
    ["di", "dì"], ["papa", "papà"], ["pero", "però"], ["meta", "metà"],
  ],
  de: [
    ["schon", "schön"], ["zahlen", "zählen"], ["drucken", "drücken"], ["fordern", "fördern"], ["bar", "bär"],
    ["mull", "müll"], ["lugen", "lügen"], ["lauten", "läuten"], ["fallen", "fällen"], ["schwul", "schwül"],
  ],
  sv: [
    ["har", "här"], ["for", "för"], ["far", "får"], ["fora", "föra"], ["var", "vår"], ["rad", "råd"],
    ["tag", "tåg"], ["mal", "mål"], ["las", "lås"], ["kar", "kär"], ["bar", "bär"], ["lat", "låt"],
    ["hal", "hål"], ["satt", "sätt"],
  ],
  lt: [["kasa", "kaša"]],
};

/** Every word in one pair group, lower case, by language. */
const PAIR_GROUPS: Record<LangCode, Map<string, Set<string>>> = {};
for (const [language, groups] of Object.entries(ACCENT_PAIRS)) {
  const index = new Map<string, Set<string>>();
  for (const group of groups) {
    const set = new Set(group.map((word) => word.normalize("NFC")));
    for (const word of set) index.set(word, set);
  }
  PAIR_GROUPS[language] = index;
}

// Letters with no Unicode decomposition that a learner types without the mark.
const PLAIN_LETTERS: Record<string, string> = { ø: "o", ł: "l", đ: "d", ß: "ss", æ: "ae", œ: "oe", ı: "i" };

/** Lower case, NFC, one space between words, plain apostrophes, no outer punctuation. */
export function baseNormalise(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,!?;:¡¿"()\[\]…-]+|[\s.,!?;:¡¿"()\[\]…-]+$/g, "")
    .trim();
}

/** The text without accents and marks: "está" → "esta", "schön" → "schon", "ąčę" → "ace". */
export function stripMarks(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[øłđßæœı]/g, (letter) => PLAIN_LETTERS[letter])
    .normalize("NFC");
}

// English contractions and their full forms. Ambiguous ones ('d, 's) list every reading.
const EN_CONTRACTIONS: [RegExp, string[]][] = [
  [/\bwon't\b/g, ["will not"]],
  [/\bcan't\b/g, ["cannot", "can not"]],
  [/\bshan't\b/g, ["shall not"]],
  [/\bain't\b/g, ["am not", "is not", "are not"]],
  [/\blet's\b/g, ["let us"]],
  [/\b(\w+)n't\b/g, ["$1 not"]],
  [/\b(\w+)'re\b/g, ["$1 are"]],
  [/\b(\w+)'ve\b/g, ["$1 have"]],
  [/\b(\w+)'ll\b/g, ["$1 will"]],
  [/\bi'm\b/g, ["i am"]],
  [/\b(\w+)'d\b/g, ["$1 would", "$1 had"]],
  [/\b(it|that|what|there|here|he|she|who|where|how|when|why)'s\b/g, ["$1 is", "$1 has"]],
];

/** Every spelling of an English text with its contractions written out. */
function englishVariants(text: string): string[] {
  let variants = [text.replace(/\bcan not\b/g, "cannot")];
  for (const [pattern, replacements] of EN_CONTRACTIONS) {
    const next: string[] = [];
    for (const variant of variants) {
      pattern.lastIndex = 0;
      if (!pattern.test(variant)) {
        next.push(variant);
        continue;
      }
      for (const replacement of replacements) {
        pattern.lastIndex = 0;
        next.push(variant.replace(pattern, replacement).replace(/\bcan not\b/g, "cannot"));
      }
    }
    variants = [...new Set(next)].slice(0, 16);
  }
  return variants;
}

/**
 * The spellings of a normalised text that count as the same answer in a language. German:
 * ß = ss and ä/ö/ü = ae/oe/ue. French: œ = oe, æ = ae. English: contractions written out.
 */
export function equalSpellings(text: string, language: LangCode): string[] {
  switch (language) {
    case "de":
      return [text.replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")];
    case "fr":
      return [text.replace(/œ/g, "oe").replace(/æ/g, "ae")];
    case "en":
      return englishVariants(text);
    default:
      return [text];
  }
}

function sameSpelling(answer: string, expected: string, language: LangCode): boolean {
  const left = new Set(equalSpellings(answer, language));
  return equalSpellings(expected, language).some((variant) => left.has(variant));
}

/** True when a word of the answer is the other member of an accent pair of the expected word. */
function accentMakesAnotherWord(answer: string, expected: string, language: LangCode): boolean {
  const groups = PAIR_GROUPS[language];
  if (!groups) return false;
  const answerWords = answer.split(" ");
  const expectedWords = expected.split(" ");
  if (answerWords.length !== expectedWords.length) return false;
  return answerWords.some((word, i) => {
    const target = expectedWords[i];
    if (word === target) return false;
    const group = groups.get(target);
    return !!group && group.has(word);
  });
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Two words look like forms of one word: a shared stem of at least four letters and at
 * least 60% of the shorter word, and short, different endings ("habló" / "hablaba",
 * "Kind" / "Kinder", "knyga" / "knygos"). Short words never match: "the" / "they".
 */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const x = stripMarks(a);
  const y = stripMarks(b);
  const shorter = Math.min(x.length, y.length);
  if (shorter < 4) return false;
  const prefix = commonPrefix(x, y);
  return prefix >= 4 && prefix >= Math.ceil(shorter * 0.6) && x.length - prefix <= 4 && y.length - prefix <= 4;
}

/** Every word is the same or a form of the same word, and at least one word differs. */
function sameWordsOtherForm(answer: string, expected: string): boolean {
  const a = answer.split(" ");
  const e = expected.split(" ");
  if (a.length !== e.length) return false;
  return a.every((word, i) => word === e[i] || stripMarks(word) === stripMarks(e[i]) || sameStem(word, e[i]));
}

/**
 * A slip of the keyboard on a word of five letters or more: two neighbouring letters
 * swapped ("recieve"), or a double letter typed once or twice too many ("adress").
 */
export function isTypo(answer: string, expected: string): boolean {
  if (Math.min(answer.length, expected.length) < 5) return false;
  if (answer.length === expected.length) {
    const diffs: number[] = [];
    for (let i = 0; i < answer.length; i++) if (answer[i] !== expected[i]) diffs.push(i);
    return (
      diffs.length === 2 &&
      diffs[1] === diffs[0] + 1 &&
      answer[diffs[0]] === expected[diffs[1]] &&
      answer[diffs[1]] === expected[diffs[0]]
    );
  }
  const [long, short] = answer.length > expected.length ? [answer, expected] : [expected, answer];
  if (long.length - short.length !== 1) return false;
  for (let i = 0; i < long.length; i++) {
    if (long[i] !== short[i]) {
      // The extra letter must double its neighbour ("adress" / "address").
      const doubled = long[i] === long[i - 1] || long[i] === long[i + 1];
      return doubled && long.slice(0, i) + long.slice(i + 1) === short;
    }
  }
  return false;
}

/** Check one answer against one accepted answer. */
function compare(answer: string, expected: string, language: LangCode): { result: ReviewResult; reason: CheckReason } {
  if (answer === expected) return { result: "right", reason: "exact" };
  if (sameSpelling(answer, expected, language)) return { result: "right", reason: "spelling" };

  const plainAnswer = stripMarks(answer);
  const plainExpected = stripMarks(expected);
  if (plainAnswer === plainExpected) {
    if (accentMakesAnotherWord(answer, expected, language)) return { result: "wrong", reason: "changes_word" };
    return { result: "close", reason: "accent" };
  }

  if (sameWordsOtherForm(answer, expected)) return { result: "close", reason: "form" };
  if (isTypo(answer, expected) || isTypo(plainAnswer, plainExpected)) return { result: "close", reason: "typo" };
  return { result: "wrong", reason: "wrong" };
}

/** The shared checker: right, close or wrong for a typed answer (B-18). */
export function checkAnswer(input: CheckInput): CheckOutput {
  const language = toCode(input.language) ?? DEFAULT_LANGUAGE;
  const accepted = (Array.isArray(input.accepted) ? input.accepted : [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const expected = accepted[0] ?? "";
  const answer = baseNormalise(input.answer);
  if (!answer) return { result: "wrong", expected, reason: "empty" };
  if (!accepted.length) return { result: "wrong", expected, reason: "wrong" };

  let best: { result: ReviewResult; reason: CheckReason } | null = null;
  for (const candidate of accepted) {
    const outcome = compare(answer, baseNormalise(candidate), language);
    if (!best || RANK[outcome.result] > RANK[best.result]) best = outcome;
    if (best.result === "right") break;
  }

  if (!best) best = { result: "wrong", reason: "wrong" };

  // The dictionary form when the sentence needs another form: the right word, wrong form.
  // A word the accent changes stays wrong.
  if (best.result === "wrong" && best.reason !== "changes_word" && input.lemma) {
    const lemma = baseNormalise(input.lemma);
    const lemmaIsExpected = accepted.some((candidate) => baseNormalise(candidate) === lemma);
    if (lemma && !lemmaIsExpected) {
      const outcome = compare(answer, lemma, language);
      if (outcome.result !== "wrong") best = { result: "close", reason: "form" };
    }
  }

  // A changed word stays wrong; nothing below "right" is upgraded by another candidate.
  return { result: best.result, expected, reason: best.reason };
}
