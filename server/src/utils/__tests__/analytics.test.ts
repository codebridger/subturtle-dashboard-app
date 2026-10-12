/**
 * The server's Mixpanel client must say so when it is disabled in production:
 * a missing MIXPANEL_TOKEN silently dropped every server event after the
 * Firebase move.
 */
const mockTrack = jest.fn();
jest.mock("mixpanel", () => ({ init: jest.fn(() => ({ track: mockTrack })) }));

function loadWith(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
  }
  let mod: typeof import("../analytics");
  jest.isolateModules(() => {
    mod = require("../analytics");
  });
  process.env = saved;
  return mod!;
}

describe("server analytics", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("warns once at startup in production when the token is missing, and no-ops", () => {
    const { trackServerEvent } = loadWith({ NODE_ENV: "production", MIXPANEL_TOKEN: undefined });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/MIXPANEL_TOKEN is not set/);
    trackServerEvent("translation_requested", "u1");
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("stays quiet outside production", () => {
    loadWith({ NODE_ENV: "development", MIXPANEL_TOKEN: undefined });
    expect(warn).not.toHaveBeenCalled();
  });

  it("tracks with the user as distinct_id when the token is set", () => {
    const { trackServerEvent } = loadWith({ NODE_ENV: "production", MIXPANEL_TOKEN: "tok" });
    trackServerEvent("translation_requested", "u1", { target_lang: "en" });
    expect(warn).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith("translation_requested", { distinct_id: "u1", target_lang: "en" });
  });
});
