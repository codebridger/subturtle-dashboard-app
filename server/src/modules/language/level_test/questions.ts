/**
 * Six fallback questions per learning language, easy first (A1 → B2), for when the model
 * cannot write the next question (B-31). The model normally writes each question and reacts
 * to the last answer; these keep a test going if one call fails. English help lines; the
 * model writes help in the learner's own language when it runs.
 */
import { LangCode } from "../../../languages/helper";

export interface FallbackQuestion {
  ai: string;
  help: string;
}

const HELP = [
  "What is your name, and where are you from?",
  "Where do you live, and what do you do (work or study)?",
  "What do you like to do in your free time?",
  "What did you do last weekend?",
  "What are your plans for next year, and why?",
  "Do you think learning languages online is better than in a class? Why?",
];

const QUESTIONS: Record<LangCode, string[]> = {
  en: [
    "Hi! What is your name, and where are you from?",
    "Where do you live now, and what do you do?",
    "What do you like to do in your free time?",
    "What did you do last weekend?",
    "What are your plans for next year, and why?",
    "Do you think learning languages online is better than in a class? Why?",
  ],
  es: [
    "¡Hola! ¿Cómo te llamas y de dónde eres?",
    "¿Dónde vives ahora y a qué te dedicas?",
    "¿Qué te gusta hacer en tu tiempo libre?",
    "¿Qué hiciste el fin de semana pasado?",
    "¿Qué planes tienes para el año que viene y por qué?",
    "¿Crees que aprender idiomas por internet es mejor que en una clase? ¿Por qué?",
  ],
  de: [
    "Hallo! Wie heißt du und woher kommst du?",
    "Wo wohnst du jetzt und was machst du beruflich?",
    "Was machst du gern in deiner Freizeit?",
    "Was hast du letztes Wochenende gemacht?",
    "Was hast du nächstes Jahr vor, und warum?",
    "Findest du, dass man Sprachen online besser lernt als im Kurs? Warum?",
  ],
  fr: [
    "Bonjour ! Comment tu t'appelles et d'où viens-tu ?",
    "Où habites-tu maintenant et qu'est-ce que tu fais dans la vie ?",
    "Qu'est-ce que tu aimes faire pendant ton temps libre ?",
    "Qu'est-ce que tu as fait le week-end dernier ?",
    "Quels sont tes projets pour l'année prochaine, et pourquoi ?",
    "Penses-tu qu'apprendre une langue en ligne est mieux qu'en cours ? Pourquoi ?",
  ],
  it: [
    "Ciao! Come ti chiami e di dove sei?",
    "Dove abiti adesso e che lavoro fai?",
    "Che cosa ti piace fare nel tempo libero?",
    "Che cosa hai fatto lo scorso fine settimana?",
    "Che progetti hai per l'anno prossimo, e perché?",
    "Secondo te, imparare le lingue online è meglio che in classe? Perché?",
  ],
  sv: [
    "Hej! Vad heter du och var kommer du ifrån?",
    "Var bor du nu och vad jobbar du med?",
    "Vad tycker du om att göra på fritiden?",
    "Vad gjorde du förra helgen?",
    "Vad har du för planer nästa år, och varför?",
    "Tycker du att det är bättre att lära sig språk på nätet än på en kurs? Varför?",
  ],
  lt: [
    "Labas! Kuo tu vardu ir iš kur tu esi?",
    "Kur tu dabar gyveni ir ką tu veiki?",
    "Ką tu mėgsti veikti laisvalaikiu?",
    "Ką tu veikei praėjusį savaitgalį?",
    "Kokie tavo planai kitiems metams ir kodėl?",
    "Ar manai, kad mokytis kalbų internetu geriau nei kursuose? Kodėl?",
  ],
};

/** The fallback question for turn `index` (1-based), or undefined for a language without a ladder. */
export function fallbackQuestion(language: LangCode, index: number): FallbackQuestion | undefined {
  const list = QUESTIONS[language];
  const i = Math.min(Math.max(index, 1), HELP.length) - 1;
  return list ? { ai: list[i], help: HELP[i] } : undefined;
}

/** True when every launch language has a full ladder (checked in tests). */
export function ladderLanguages(): LangCode[] {
  return Object.keys(QUESTIONS);
}
