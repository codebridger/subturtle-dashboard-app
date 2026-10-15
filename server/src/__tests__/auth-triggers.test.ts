/**
 * Sign-up (B-07, Q11): no English seed; the new account starts first run.
 */
import { describe, it, expect, jest } from "@jest/globals";

const mockUpdateOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockInsertMany = jest.fn<(...args: any[]) => Promise<any>>();
const mockEnsureInitialized = jest.fn<(...args: any[]) => Promise<void>>();

jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  getCollection: jest.fn((_db: string, name: string) => ({ name, updateOne: mockUpdateOne, insertMany: mockInsertMany })),
}));
jest.mock("../modules/leitner_box/service", () => ({
  LeitnerService: { ensureInitialized: (...args: any[]) => mockEnsureInitialized(...args) },
}));

import mongoose from "mongoose";
import { authTriggers } from "../triggers";

describe("sign-up trigger", () => {
  it("marks the profile needs_language and seeds no bundles or phrases", async () => {
    mockUpdateOne.mockResolvedValue({});
    mockEnsureInitialized.mockResolvedValue(undefined);
    const userId = new mongoose.Types.ObjectId();

    const trigger: any = authTriggers.find((t: any) => t.operation === "insert-one");
    await trigger.callback({ queryResult: { _id: userId } });

    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { refId: String(userId) },
      { $set: { onboardingState: "needs_language" }, $setOnInsert: { refId: String(userId) } },
      { upsert: true }
    );
    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockEnsureInitialized).toHaveBeenCalledWith(String(userId));
  });
});
