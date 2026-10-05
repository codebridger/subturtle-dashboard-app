import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// defineFunction returns its config so the callback is reachable.
jest.mock("@modular-rest/server", () => ({
  defineFunction: (config: any) => config,
  reply: { create: jest.fn() },
}));
jest.mock("../../subscription/service", () => ({
  clearUserSubscriptions: jest.fn(),
  clearUserFreemiumAllocations: jest.fn(),
  clearUserUsageRecords: jest.fn(),
}));

import { clearUserSubscriptions } from "../../subscription/service";

const { functions } = require("../functions");
const resetProfile = functions.find((f: any) => f.name === "clearSubscriptionAndFreemium");

describe("clearSubscriptionAndFreemium: production lock", () => {
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    delete process.env.PROFILE_RESET_ENABLED;
  });

  it("refuses in production before deleting anything", async () => {
    process.env.NODE_ENV = "production";
    await expect(resetProfile.callback({ userId: "u1" })).rejects.toThrow("disabled in production");
    expect(clearUserSubscriptions).not.toHaveBeenCalled();
  });

  it("runs in production when the environment opts in (deployed dev)", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROFILE_RESET_ENABLED = "true";
    await resetProfile.callback({ userId: "u1" });
    expect(clearUserSubscriptions).toHaveBeenCalledWith("u1");
  });

  it("runs on a local server", async () => {
    process.env.NODE_ENV = "development";
    await resetProfile.callback({ userId: "u1" });
    expect(clearUserSubscriptions).toHaveBeenCalledWith("u1");
  });
});
