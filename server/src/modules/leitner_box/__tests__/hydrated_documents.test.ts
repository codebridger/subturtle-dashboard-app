import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";

// The other Leitner tests feed plain objects. These use real Mongoose documents (no
// database needed), because what Mongoose 8 hydrates — `items` subdocuments and the
// `settings` path — is exactly what a plain-object mock hides.
jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  getCollection: jest.fn(),
}));
jest.mock("../../board/service", () => ({ BoardService: { refreshActivity: jest.fn() } }));
jest.mock("../../schedule/service", () => ({ ScheduleService: { register: jest.fn(), createJob: jest.fn() } }));

import { getCollection } from "@modular-rest/server";
import { LeitnerService } from "../service";

const LeitnerSystem = mongoose.model("leitner_system_hydration_test", require("../db")[0].schema);

describe("LeitnerService on hydrated Mongoose documents", () => {
  const userId = "user_1";
  const phraseId = "64b000000000000000000001";

  beforeEach(() => {
    // A legacy document: stored settings without `autoEntry`.
    const system = new LeitnerSystem({
      userId,
      settings: { dailyLimit: 20, totalBoxes: 5, boxIntervals: [1, 2, 4, 8, 16], boxQuotas: [20, 10, 5, 5, 5], reviewInterval: 1, reviewHour: 9 },
      items: [{ phraseId, boxLevel: 2, nextReviewDate: new Date(Date.now() - 60_000), lastAttemptDate: new Date(Date.now() - 86_400_000) }],
    });

    (getCollection as any).mockImplementation((_db: string, collection: string) => {
      if (collection === "leitner_system") return Promise.resolve({ findOne: jest.fn(async () => system), updateOne: jest.fn() });
      if (collection === "phrase") return Promise.resolve({ find: jest.fn(async () => [{ _id: phraseId, phrase: "hit the sack", chunks: [] }]) });
      if (collection === "profile") return Promise.resolve({ findOne: jest.fn(async () => null) });
      return Promise.resolve({});
    });
  });

  it("returns review items as plain objects rather than serialized subdocuments", async () => {
    const [item] = (await LeitnerService.getDueItems(userId)) as any[];

    expect(item.boxLevel).toBe(2);
    expect(item.phrase.phrase).toBe("hit the sack");
    const json = JSON.stringify(item);
    expect(json).not.toContain("$__parent");
    expect(json).not.toContain("__parentArray");
  });

  it("returns stored settings as stored, without schema defaults", async () => {
    const settings = await LeitnerService.getSettings(userId);

    expect(settings).toMatchObject({ dailyLimit: 20, totalBoxes: 5, boxQuotas: [20, 10, 5, 5, 5] });
    // Mongoose 5 kept `settings` as Mixed, so a legacy document never gained a default autoEntry.
    expect(settings).not.toHaveProperty("autoEntry");
  });
});
