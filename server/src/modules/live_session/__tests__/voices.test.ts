import { LIVE_SESSION_VOICES, DEFAULT_LIVE_SESSION_VOICE } from "../voices";

describe("live session voices", () => {
  it("ships the eight Gemini voices", () => {
    expect(LIVE_SESSION_VOICES).toHaveLength(8);
    const names = LIVE_SESSION_VOICES.map((v) => v.name);
    ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"].forEach(
      (n) => expect(names).toContain(n)
    );
  });

  it("gives every voice the metadata both clients render", () => {
    for (const v of LIVE_SESSION_VOICES) {
      expect(typeof v.name).toBe("string");
      expect(v.label).toBeTruthy();
      expect(v.description).toBeTruthy();
      expect(v.avatarColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // avatarUrl is reserved (null for now) so clients can swap in images later.
      expect(v).toHaveProperty("avatarUrl");
    }
  });

  it("defaults to a voice that exists in the list", () => {
    expect(DEFAULT_LIVE_SESSION_VOICE).toBe("Kore");
    expect(LIVE_SESSION_VOICES.map((v) => v.name)).toContain(
      DEFAULT_LIVE_SESSION_VOICE
    );
  });
});
