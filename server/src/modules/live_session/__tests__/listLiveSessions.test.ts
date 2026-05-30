import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// defineFunction returns its config so the callback is reachable; mock the heavy
// provider/service imports so requiring the module doesn't pull in genai/stripe.
jest.mock("@modular-rest/server", () => ({
  defineFunction: (config: any) => config,
  getCollection: jest.fn(),
}));
jest.mock("../openai/functions", () => ({ requestEphemeralToken: {} }));
jest.mock("../gemini/functions", () => ({ requestGeminiEphemeralToken: {} }));
jest.mock("../../subscription/service", () => ({
  recordUsage: jest.fn(),
  debitVoiceMinutes: jest.fn(),
}));
jest.mock("../../subscription/enforcement", () => ({
  assertFeatureEnabled: jest.fn(),
}));

import { getCollection } from "@modular-rest/server";
import { assertFeatureEnabled } from "../../subscription/enforcement";
import { LIVE_SESSION_COLLECTION } from "../../../config";

const { functions } = require("../functions");
const listLiveSessions = functions.find(
  (f: any) => f.name === "list-live-sessions"
);

function mockCollections(voiceDocs: any[], textDocs: any[]) {
  (getCollection as any).mockImplementation((_db: string, coll: string) => ({
    find: () => ({
      sort: () => ({
        limit: async () =>
          coll === LIVE_SESSION_COLLECTION ? voiceDocs : textDocs,
      }),
    }),
  }));
}

describe("list-live-sessions (session_history gate)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is locked for free/Reader (session_history off)", async () => {
    (assertFeatureEnabled as any).mockRejectedValue(new Error("locked"));
    await expect(
      listLiveSessions.callback({ userId: "u1" })
    ).rejects.toThrow();
  });

  it("returns voice + text merged newest-first for Learner/Coach", async () => {
    (assertFeatureEnabled as any).mockResolvedValue(undefined);
    mockCollections(
      [{ _id: "v1", createdAt: "2026-01-02T00:00:00Z" }],
      [{ _id: "t1", createdAt: "2026-01-03T00:00:00Z" }]
    );
    const res: any = await listLiveSessions.callback({ userId: "u1" });
    expect(res.items.map((s: any) => s._id)).toEqual(["t1", "v1"]); // newest first
    expect(assertFeatureEnabled).toHaveBeenCalledWith("u1", "session_history");
  });
});
