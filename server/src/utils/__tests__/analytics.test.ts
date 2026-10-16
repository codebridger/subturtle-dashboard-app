/**
 * The server's Mixpanel client must say so when it is disabled in production:
 * a missing MIXPANEL_TOKEN silently dropped every server event after the
 * Firebase move.
 *
 * B-01: events go on the real person. A signed-in user is tracked on the user id; a
 * logged-out caller on its install id; never on the account all logged-out visitors share.
 */
const mockTrack = jest.fn();
jest.mock("mixpanel", () => ({ init: jest.fn(() => ({ track: mockTrack })) }));

const SHARED_ANONYMOUS_ID = "64b0000000000000000000aa";
const mockFindAnonymous = jest.fn();
jest.mock("@modular-rest/server", () => ({
  getCollection: () => ({
    findOne: (query: any) => ({
      select: () => ({ lean: () => ({ exec: () => mockFindAnonymous(query) }) }),
    }),
  }),
}));

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
  let error: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindAnonymous.mockResolvedValue({ _id: SHARED_ANONYMOUS_ID });
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it("warns once at startup in production when the token is missing, and no-ops", async () => {
    const { trackServerEvent } = loadWith({ NODE_ENV: "production", MIXPANEL_TOKEN: undefined });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/MIXPANEL_TOKEN is not set/);
    await trackServerEvent("translation_requested", { userId: "u1" });
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("stays quiet outside production", () => {
    loadWith({ NODE_ENV: "development", MIXPANEL_TOKEN: undefined });
    expect(warn).not.toHaveBeenCalled();
  });

  describe("who an event belongs to", () => {
    let analytics: ReturnType<typeof loadWith>;
    beforeEach(() => {
      analytics = loadWith({ NODE_ENV: "production", MIXPANEL_TOKEN: "tok" });
    });

    it("a signed-in user without an install id: distinct_id is the user id", async () => {
      await analytics.trackServerEvent("translation_requested", { userId: "u1" }, { target_lang: "en" });
      expect(warn).not.toHaveBeenCalled();
      expect(mockTrack).toHaveBeenCalledWith("translation_requested", { distinct_id: "u1", target_lang: "en" });
    });

    it("a signed-in user with an install id: user id plus $device_id, so Mixpanel joins them", async () => {
      await analytics.trackServerEvent("translation_requested", { userId: "u1", deviceId: "dev-1" });
      expect(mockTrack).toHaveBeenCalledWith("translation_requested", {
        distinct_id: "u1",
        $user_id: "u1",
        $device_id: "dev-1",
      });
    });

    it("a logged-out caller on the shared anonymous account goes on its install id", async () => {
      await analytics.trackServerEvent("translation_requested", { userId: SHARED_ANONYMOUS_ID, deviceId: "dev-1" }, { a: 1 });
      expect(mockTrack).toHaveBeenCalledWith("translation_requested", {
        a: 1,
        distinct_id: "$device:dev-1",
        $device_id: "dev-1",
      });
      const props = mockTrack.mock.calls[0][1];
      expect(props.$user_id).toBeUndefined();
      expect(JSON.stringify(props)).not.toContain(SHARED_ANONYMOUS_ID);
    });

    it.each([[undefined], [""], ["anonymous"]])("a caller with user id %p goes on its install id", async (userId) => {
      await analytics.trackServerEvent("translation_requested", { userId, deviceId: "dev-1" });
      expect(mockTrack).toHaveBeenCalledWith("translation_requested", { distinct_id: "$device:dev-1", $device_id: "dev-1" });
    });

    it("accepts an install id sent as a Mixpanel $device: value", async () => {
      await analytics.trackServerEvent("x", { deviceId: "$device:dev-1" });
      expect(mockTrack).toHaveBeenCalledWith("x", { distinct_id: "$device:dev-1", $device_id: "dev-1" });
    });

    it("a logged-out caller with no install id (old extension) goes on a separate fallback id, never the shared one", async () => {
      await analytics.trackServerEvent("translation_requested", { userId: SHARED_ANONYMOUS_ID });
      expect(mockTrack).toHaveBeenCalledWith("translation_requested", { distinct_id: "anonymous-unknown" });
    });

    it("properties cannot overwrite the identity", async () => {
      await analytics.trackServerEvent("x", { userId: SHARED_ANONYMOUS_ID }, { distinct_id: SHARED_ANONYMOUS_ID });
      expect(mockTrack).toHaveBeenCalledWith("x", { distinct_id: "anonymous-unknown" });
    });

    it("reads the shared anonymous account once and caches it", async () => {
      await analytics.trackServerEvent("x", { userId: "u1" });
      await analytics.trackServerEvent("x", { userId: SHARED_ANONYMOUS_ID });
      await analytics.trackServerEvent("x", { userId: "u2" });
      expect(mockFindAnonymous).toHaveBeenCalledTimes(1);
      expect(mockFindAnonymous).toHaveBeenCalledWith({ type: "anonymous" });
    });

    it("when the lookup fails, it plays safe (no user id) and tries again next time", async () => {
      mockFindAnonymous.mockRejectedValueOnce(new Error("db down"));
      await analytics.trackServerEvent("x", { userId: SHARED_ANONYMOUS_ID, deviceId: "dev-1" });
      expect(mockTrack).toHaveBeenLastCalledWith("x", { distinct_id: "$device:dev-1", $device_id: "dev-1" });

      await analytics.trackServerEvent("x", { userId: "u1" });
      expect(mockTrack).toHaveBeenLastCalledWith("x", { distinct_id: "u1" });
      expect(mockFindAnonymous).toHaveBeenCalledTimes(2);
    });

    it("never throws when Mixpanel fails", async () => {
      mockTrack.mockImplementationOnce(() => {
        throw new Error("boom");
      });
      await expect(analytics.trackServerEvent("x", { userId: "u1" })).resolves.toBeUndefined();
    });
  });
});
