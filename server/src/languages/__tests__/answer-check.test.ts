/**
 * B-18: the shared fill-in-the-gap checker, per launch language. "right", "close" (the
 * right word in another form, or a spelling slip that keeps the word) and "wrong".
 */
import { describe, it, expect } from "@jest/globals";
import { baseNormalise, checkAnswer, isTypo, sameStem, stripMarks } from "../answer-check";

type Case = [answer: string, accepted: string[] | string, expected: "right" | "close" | "wrong", lemma?: string];

function run(language: string, cases: Case[]) {
  for (const [answer, accepted, result, lemma] of cases) {
    const list = Array.isArray(accepted) ? accepted : [accepted];
    it(`${language}: "${answer}" for "${list[0]}"${lemma ? ` (lemma ${lemma})` : ""} → ${result}`, () => {
      expect(checkAnswer({ answer, accepted: list, lemma, language }).result).toBe(result);
    });
  }
}

describe("helpers", () => {
  it("normalises case, spaces, quotes and outer punctuation", () => {
    expect(baseNormalise("  ¡Hola,   Mundo!  ")).toBe("hola, mundo");
    expect(baseNormalise("l’ homme")).toBe("l'homme");
    expect(baseNormalise(undefined)).toBe("");
  });

  it("strips marks, including letters with no decomposition", () => {
    expect(stripMarks("está schön ąčęėįšųūž åäö œ ß")).toBe("esta schon aceeisuuz aao oe ss");
  });

  it("sameStem needs a real shared stem", () => {
    expect(sameStem("habló", "hablaba")).toBe(true);
    expect(sameStem("kinder", "kind")).toBe(true);
    expect(sameStem("the", "they")).toBe(false);
    expect(sameStem("comer", "comprar")).toBe(false);
    expect(sameStem("haus", "hausaufgabe")).toBe(false);
  });

  it("isTypo accepts swaps and double letters only", () => {
    expect(isTypo("recieve", "receive")).toBe(true);
    expect(isTypo("adress", "address")).toBe(true);
    expect(isTypo("addresss", "address")).toBe(true);
    expect(isTypo("tasse", "kasse")).toBe(false);
    expect(isTypo("tische", "tasche")).toBe(false);
  });
});

describe("general rules", () => {
  it("returns the first accepted answer as expected", () => {
    expect(checkAnswer({ answer: "x", accepted: ["give up", "gave up"], language: "en" })).toEqual({
      result: "wrong",
      expected: "give up",
      reason: "wrong",
    });
  });

  it("an empty answer is wrong", () => {
    expect(checkAnswer({ answer: "   ", accepted: ["a"], language: "en" }).reason).toBe("empty");
  });

  it("no accepted answers is wrong, never a crash", () => {
    expect(checkAnswer({ answer: "a", accepted: [], language: "en" }).result).toBe("wrong");
  });

  it("a missing language is English", () => {
    expect(checkAnswer({ answer: "do not", accepted: ["don't"] }).result).toBe("right");
  });

  it("any accepted answer counts", () => {
    expect(checkAnswer({ answer: "gave up", accepted: ["give up", "gave up"], language: "en" }).result).toBe("right");
  });

  it("explains why", () => {
    expect(checkAnswer({ answer: "esta", accepted: ["está"], language: "es" }).reason).toBe("changes_word");
    expect(checkAnswer({ answer: "cafe", accepted: ["café"], language: "fr" }).reason).toBe("accent");
    expect(checkAnswer({ answer: "Strasse", accepted: ["Straße"], language: "de" }).reason).toBe("spelling");
    expect(checkAnswer({ answer: "anfangen", accepted: ["fängt an"], lemma: "anfangen", language: "de" }).reason).toBe("form");
  });
});

describe("English", () => {
  run("en", [
    ["give up", "give up", "right"],
    ["Give up.", "give up", "right"],
    ["do not", "don't", "right"],
    ["don't", "do not", "right"],
    ["don’t", "don't", "right"],
    ["it is", "it's", "right"],
    ["cannot", "can't", "right"],
    ["can not", "can't", "right"],
    ["they're", "they are", "right"],
    ["give up", "gives up", "close", "give up"], // the dictionary form for "gives up"
    ["give", "giving", "wrong"],
    ["looked into", "looking into", "close"],
    ["recieve", "receive", "close"],
    ["run into", "give up", "wrong"],
    ["the", "they", "wrong"],
  ]);
});

describe("German", () => {
  run("de", [
    ["Straße", "Straße", "right"],
    ["Strasse", "Straße", "right"], // ß = ss
    ["Mädchen", "Mädchen", "right"],
    ["Maedchen", "Mädchen", "right"], // ä = ae
    ["Mueller", "Müller", "right"], // ü = ue
    ["schoen", "schön", "right"], // ö = oe
    ["madchen", "Mädchen", "close"], // missing umlaut, same word
    ["Mutter", "Mütter", "close"], // the plural: the right word in another form
    ["schon", "schön", "wrong"], // the umlaut makes another word
    ["zahlen", "zählen", "wrong"],
    ["der tisch", "der Tisch", "right"], // case does not count
    ["der Tisch", "dem Tisch", "close", "der Tisch"], // the dictionary form for another case
    ["anfangen", "fängt an", "close", "anfangen"],
    ["fängt an", "fängt an", "right"],
    ["fangt an", "fängt an", "close"],
    ["fing an", "fängt an", "wrong"], // no shared stem, not the lemma: wrong
    ["Kinder", "Kind", "close"],
    ["Hund", "Katze", "wrong"],
    ["freue mich", "freue mich", "right"],
    ["freut mich", "freue mich", "close"],
  ]);
});

describe("Spanish", () => {
  run("es", [
    ["está", "está", "right"],
    ["esta", "está", "wrong"], // "esta" (this) is another word
    ["si", "sí", "wrong"],
    ["mas", "más", "wrong"],
    ["cancion", "canción", "close"], // missing accent, same word
    ["arbol", "árbol", "close"],
    ["anos", "años", "wrong"], // ñ makes another word
    ["manana", "mañana", "close"],
    ["hablaba", "habló", "close"], // another tense of the right verb
    ["hablo", "habló", "close"], // missing accent: another form of the same verb
    ["levantarse", "me levanto", "close", "levantarse"],
    ["me levanto", "me levanto", "right"],
    ["¿Qué?", "qué", "right"],
    ["por supuesto", "por supuesto", "right"],
    ["comer", "comprar", "wrong"],
  ]);
});

describe("French", () => {
  run("fr", [
    ["café", "café", "right"],
    ["cafe", "café", "close"],
    ["ou", "où", "wrong"],
    ["a", "à", "wrong"],
    ["la", "là", "wrong"],
    ["coeur", "cœur", "right"], // œ = oe
    ["oeuvre", "œuvre", "right"],
    ["parle", "parlé", "close"], // the participle written as the present: same verb
    ["eleve", "élève", "close"],
    ["prés", "près", "close"], // a wrong accent that keeps the word
    ["sur", "sûr", "wrong"],
    ["il y a", "il y a", "right"],
    ["l'homme", "l’homme", "right"],
    ["se souvenir", "je me souviens", "close", "se souvenir"],
    ["chien", "chat", "wrong"],
  ]);
});

describe("Italian", () => {
  run("it", [
    ["città", "città", "right"],
    ["citta", "città", "close"],
    ["perche", "perché", "close"],
    ["e", "è", "wrong"], // "and" vs "is"
    ["si", "sì", "wrong"],
    ["parlo", "parlò", "close"], // another form of the same verb
    ["andava", "andò", "wrong"], // too far apart to tell
    ["mangiavo", "mangiato", "close"],
    ["alzarsi", "mi alzo", "close", "alzarsi"],
    ["piu", "più", "close"],
    ["casa", "cane", "wrong"],
  ]);
});

describe("Swedish", () => {
  run("sv", [
    ["båt", "båt", "right"],
    ["bat", "båt", "close"],
    ["for", "för", "wrong"], // another word
    ["har", "här", "wrong"],
    ["far", "får", "wrong"],
    ["flicka", "flickan", "close"], // the definite form: the right word
    ["tycka om", "tycker om", "close", "tycka om"],
    ["tycker om", "tycker om", "right"],
    ["sjalv", "själv", "close"],
    ["ga upp", "ge upp", "wrong"],
  ]);
});

describe("Lithuanian", () => {
  run("lt", [
    ["knygą", "knygą", "right"],
    ["knyga", "knygą", "close"], // nominative for accusative: the right word, another case
    ["knygos", "knygą", "close"],
    ["aciu", "ačiū", "close"],
    ["kasa", "kaša", "wrong"],
    ["padeti draugui", "padėti draugui", "close"],
    ["dziaugtis", "džiaugiuosi", "close", "džiaugtis"],
    ["namas", "knyga", "wrong"],
  ]);
});
