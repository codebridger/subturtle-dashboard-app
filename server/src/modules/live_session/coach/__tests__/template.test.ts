/**
 * B-19 / B-20: the server Coach prompt. For English with no start level it is word for word
 * the prompt the clients build today from shared/live-practice/spec.json.
 */
import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { buildCoachInstructions, coachNotes, coachVoiceFor, phraseList } from "../template";

const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../../../shared/live-practice/spec.json"), "utf8"));

/** What frontend/utils/livePractice.ts `buildInstructions` makes. */
function clientPrompt(phrases: { phrase: string; translation: string }[], nativeLanguage: string) {
  const list = phrases
    .map((p, i) => spec.phraseLine.replace("{index}", String(i + 1)).replace("{phrase}", p.phrase).replace("{translation}", p.translation))
    .join("\n");
  return spec.instructionsTemplate.replace(/\[nativeLanguage\]/g, nativeLanguage).replace("[phrases]", list);
}

const PHRASES = [
  { phrase: "give up", translation: "تسلیم شدن" },
  { phrase: "run into", translation: "برخوردن" },
];

describe("buildCoachInstructions", () => {
  it("English with no level is today's client prompt, word for word", () => {
    expect(buildCoachInstructions({ language: "en", explanationLanguage: "fa", phrases: PHRASES, mode: "text" })).toBe(clientPrompt(PHRASES, "Persian"));
    expect(buildCoachInstructions({ language: "en", explanationLanguage: "fa", phrases: PHRASES, mode: "voice" })).toBe(clientPrompt(PHRASES, "Persian"));
  });

  it("an unknown explanation language uses the spec's fallback line", () => {
    expect(buildCoachInstructions({ language: "en", explanationLanguage: null, phrases: PHRASES, mode: "text" })).toBe(
      clientPrompt(PHRASES, spec.nativeLanguage.fallback)
    );
  });

  it("names the learning language and the own language for German", () => {
    const text = buildCoachInstructions({ language: "de", explanationLanguage: "fa", phrases: [{ phrase: "anfangen", translation: "شروع کردن" }], mode: "text" });
    expect(text).toMatch(/AI German tutor/);
    expect(text).toMatch(/TARGET practice language is German/);
    expect(text).toMatch(/native language is Persian/);
    expect(text).toMatch(/der\/die\/das/);
    expect(text).toMatch(/1\. anfangen: شروع کردن/);
    expect(text).not.toMatch(/English/);
    expect(text).not.toMatch(/\[(learningLanguage|nativeLanguage|coachNotes|phrases)\]/);
  });

  it("has notes for every new launch language, and none for English", () => {
    for (const code of ["es", "de", "fr", "it", "sv", "lt"]) expect(coachNotes({ language: code, mode: "text" })).not.toBe("");
    expect(coachNotes({ language: "en", mode: "voice" })).toBe("");
  });

  it("at A1 asks for short lines and 'say this in …'", () => {
    const text = buildCoachInstructions({ language: "es", explanationLanguage: "ar", phrases: PHRASES, mode: "text", level: "A1" });
    expect(text).toMatch(/beginner \(A1\) in Spanish/);
    expect(text).toMatch(/Say this in Spanish/);
    expect(text).toMatch(/Explain in Arabic/);
  });

  it("an English learner with a level gets the level note too", () => {
    expect(buildCoachInstructions({ language: "en", explanationLanguage: "fa", phrases: PHRASES, mode: "text", level: "B1" })).toMatch(/B1 in English/);
  });

  it("voice mode carries the accent hint for a new language", () => {
    expect(buildCoachInstructions({ language: "lt", explanationLanguage: "en", phrases: [], mode: "voice" })).toMatch(/native Lithuanian accent/);
    expect(buildCoachInstructions({ language: "lt", explanationLanguage: "en", phrases: [], mode: "text" })).not.toMatch(/accent/);
  });

  it("phrase text with $ signs is kept as it is", () => {
    expect(phraseList([{ phrase: "$& costs $1", translation: "x" }])).toBe("1. $& costs $1: x");
  });
});

describe("coachVoiceFor", () => {
  it("keeps a known requested voice and falls back to the language default", () => {
    expect(coachVoiceFor("de", "Puck")).toBe("Puck");
    expect(coachVoiceFor("de", "NotAVoice")).toBe("Kore");
    for (const code of ["en", "es", "de", "fr", "it", "sv", "lt"]) expect(coachVoiceFor(code)).toBeTruthy();
  });
});
