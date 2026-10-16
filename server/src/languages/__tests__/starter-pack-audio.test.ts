/**
 * B-22: the audio generator with a fake TTS and fixture packs, in a temp folder.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { generateStarterPackAudio, languageCodeOfVoice, readManifest } from "../starter-pack-audio";
import { audioTextHash, getStarterPack, StarterPack } from "../starter-pack";

const pack = (language: string, texts: string[]): StarterPack => ({
  language,
  version: 1,
  groups: [{ id: "greetings", name: "Greetings" }],
  items: texts.map((text, i) => ({ id: `${language}-greetings-0${i + 1}`, text, translations: { en: text }, band: 1, group: "greetings" })),
});

let dir: string;
let synthesize: jest.Mock<(request: any) => Promise<Buffer>>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "starter-audio-"));
  synthesize = jest.fn(async (request: any) => Buffer.from(`mp3:${request.languageCode}:${request.text}`));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const run = (packs: StarterPack[], extra: any = {}) =>
  generateStarterPackAudio({ packs, synthesize, outDir: path.join(dir, "out"), manifestPath: path.join(dir, "manifest.json"), ...extra });

describe("generateStarterPackAudio", () => {
  it("is a dry run by default: nothing is made or written", async () => {
    const [report] = await run([pack("de", ["Hallo!", "Tschüss!"])]);
    expect(report.made).toEqual(["de-greetings-01", "de-greetings-02"]);
    expect(synthesize).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, "manifest.json"))).toBe(false);
  });

  it("makes one file per item with the language's register voice and lists it", async () => {
    const [report] = await run([pack("lt", ["Labas!"])], { dryRun: false });
    expect(report.voice).toBe("lt-LT-Chirp3-HD-Kore");
    expect(synthesize).toHaveBeenCalledWith({ text: "Labas!", languageCode: "lt-LT", voiceName: "lt-LT-Chirp3-HD-Kore" });
    expect(fs.readFileSync(path.join(dir, "out/lt/lt-greetings-01.mp3"), "utf8")).toBe("mp3:lt-LT:Labas!");
    expect(readManifest(path.join(dir, "manifest.json")).languages.lt["lt-greetings-01"]).toEqual({
      file: "lt/lt-greetings-01.mp3",
      voice: "lt-LT-Chirp3-HD-Kore",
      textHash: audioTextHash("Labas!", "lt-LT-Chirp3-HD-Kore"),
    });
  });

  it("skips what is up to date and remakes a changed text", async () => {
    await run([pack("de", ["Hallo!", "Tschüss!"])], { dryRun: false });
    synthesize.mockClear();
    const [report] = await run([pack("de", ["Hallo!", "Tschau!"])], { dryRun: false });
    expect(report.skipped).toEqual(["de-greetings-01"]);
    expect(report.made).toEqual(["de-greetings-02"]);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it("keeps to the limit and reports failures without stopping", async () => {
    synthesize.mockImplementationOnce(async () => {
      throw new Error("quota");
    });
    const [report] = await run([pack("es", ["¡Hola!", "Adiós", "Gracias"])], { dryRun: false, limitPerLanguage: 2 });
    expect(report.failed).toEqual([{ id: "es-greetings-01", error: "quota" }]);
    expect(report.made).toEqual(["es-greetings-02"]);
  });

  it("refuses a language that is not in the register", async () => {
    await expect(run([pack("ja", ["こんにちは"])])).rejects.toThrow(/not a learning language/);
  });

  it("reads the voice's language code", () => {
    expect(languageCodeOfVoice("de-DE-Chirp3-HD-Kore")).toBe("de-DE");
    expect(() => languageCodeOfVoice("Kore")).toThrow();
  });

  it("every launch language has a pack the script can read", () => {
    for (const code of ["en", "es", "de", "fr", "it", "sv", "lt"]) expect(getStarterPack(code)?.items.length).toBeGreaterThanOrEqual(150);
  });
});
