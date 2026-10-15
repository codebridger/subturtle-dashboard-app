import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// defineFunction returns its config so the callback is reachable.
jest.mock("@modular-rest/server", () => ({
  defineFunction: (config: any) => config,
}));
const mockDeleteUserAccount = jest.fn(async (userId: string) => ({ userId, canceledStripeSubscriptions: [], deleted: {} }));
jest.mock("../service", () => ({ deleteUserAccount: mockDeleteUserAccount }));

const { functions } = require("../functions");
const deleteAccount = functions.find((f: any) => f.name === "delete-account");

describe("delete-account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is a user_access function", () => {
    expect(deleteAccount.permissionTypes).toEqual(["user_access"]);
  });

  it("deletes the account named by userId (pinned to the caller by the function guard)", async () => {
    await expect(deleteAccount.callback({ userId: "u1" })).resolves.toEqual({ userId: "u1", canceledStripeSubscriptions: [], deleted: {} });
    expect(mockDeleteUserAccount).toHaveBeenCalledWith("u1");
  });

  it("refuses a call without userId, which the guard would not have checked", async () => {
    await expect(deleteAccount.callback({})).rejects.toThrow("User ID is required");
    expect(mockDeleteUserAccount).not.toHaveBeenCalled();
  });
});
