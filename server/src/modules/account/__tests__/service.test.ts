import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Types } from "mongoose";

// Every collection is a fake that records its calls; `find` / `findOne` answers come from
// `fixtures`, keyed by "database.collection".
type Fake = { find: jest.Mock<any>; findOne: jest.Mock<any>; deleteMany: jest.Mock<any>; deleteOne: jest.Mock<any> };
const collections: Record<string, Fake> = {};
const fixtures: Record<string, { find?: any[]; findOne?: any }> = {};

function collection(database: string, name: string): Fake {
  const key = `${database}.${name}`;
  if (!collections[key]) {
    collections[key] = {
      find: jest.fn(async () => fixtures[key]?.find || []),
      findOne: jest.fn(async () => fixtures[key]?.findOne || null),
      deleteMany: jest.fn(async () => ({ deletedCount: 1 })),
      deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
    };
  }
  return collections[key];
}

const mockRemoveFile = jest.fn(async (_id: string) => true);
jest.mock("@modular-rest/server", () => ({
  getCollection: (database: string, name: string) => collection(database, name),
  fileService: { removeFile: (id: string) => mockRemoveFile(id) },
}));

const stripe = {
  subscriptions: {
    list: jest.fn<any>(),
    cancel: jest.fn(async (id: string) => ({ id, status: "canceled" })),
  },
};
const mockGetSubscriptionDetails = jest.fn<(id: string) => Promise<any>>();
const mockGetStripeAdapter = jest.fn<() => any>(() => ({ stripe, getSubscriptionDetails: mockGetSubscriptionDetails }));
jest.mock("../../gateway/adapters", () => ({
  PaymentProvider: { STRIPE: "stripe" },
  PaymentAdapterFactory: { getStripeAdapter: () => mockGetStripeAdapter() },
}));

import { deleteUserAccount, AccountDeletionError } from "../service";

const USER_ID = new Types.ObjectId().toHexString();
const USER_OID = new Types.ObjectId(USER_ID);

function listOf(subscriptions: { id: string; status: string }[]) {
  return async function* () {
    yield* subscriptions;
  };
}

function allDeleteCalls() {
  return Object.entries(collections).flatMap(([key, c]) => [
    ...c.deleteMany.mock.calls.map((args) => ({ key, filter: args[0] })),
    ...c.deleteOne.mock.calls.map((args) => ({ key, filter: args[0] })),
  ]);
}

describe("deleteUserAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(collections)) delete collections[key];
    for (const key of Object.keys(fixtures)) delete fixtures[key];
    stripe.subscriptions.list.mockImplementation(listOf([]));
  });

  it("deletes the user's documents in every collection, and only theirs", async () => {
    fixtures["cms.file"] = { find: [{ _id: "file-1" }] };

    const result = await deleteUserAccount(USER_ID);

    const byKey = Object.fromEntries(allDeleteCalls().map(({ key, filter }) => [key, filter]));
    expect(byKey).toEqual({
      "user_content.phrase": { refId: USER_ID },
      "user_content.phrase_bundle": { refId: USER_ID },
      "user_content.leitner_system": { userId: USER_ID },
      "user_content.pool": { userId: USER_ID },
      "user_content.board_activity": { userId: USER_ID },
      "user_content.language_profile": { userId: USER_ID },
      "user_content.language_interest": { userId: USER_ID },
      "user_content.review_log": { userId: USER_ID },
      "user_content.live_session": { refId: USER_ID },
      "user_content.live_session_text": { refId: USER_ID },
      "user_content.save_assistant_session": { refId: USER_ID },
      "user_content.level_test": { userId: USER_ID },
      "user_content.coach_explanation_flag": { userId: USER_ID },
      "user_content.subscription": { user_id: USER_OID },
      "user_content.usage": { user_id: USER_OID },
      "user_content.free_credit": { user_id: USER_OID },
      "user_content.fluent_waitlist": { user_id: USER_OID },
      "user_content.payment": { user_id: USER_ID },
      "user_content.payment_session": { user_id: USER_OID },
      "user_content.stripe_customer": { user_id: USER_ID },
      "cms.scheduled_job": { $or: [{ name: `leitner-review-${USER_ID}` }, { "args.userId": USER_ID }] },
      "user_content.profile": { refId: USER_ID },
      "cms.auth": { _id: USER_OID },
    });
    expect(collections["cms.file"].find).toHaveBeenCalledWith({ owner: USER_ID });
    expect(mockRemoveFile).toHaveBeenCalledWith("file-1");
    expect(result.deleted["cms.auth"]).toBe(1);
    expect(result.canceledStripeSubscriptions).toEqual([]);
  });

  it("deletes the level tests, Coach flags and save chats of the user", async () => {
    const result = await deleteUserAccount(USER_ID);

    expect(collections["user_content.level_test"].deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(collections["user_content.coach_explanation_flag"].deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(collections["user_content.save_assistant_session"].deleteMany).toHaveBeenCalledWith({ refId: USER_ID });
    expect(result.deleted["user_content.level_test"]).toBe(1);
    expect(result.deleted["user_content.coach_explanation_flag"]).toBe(1);
    expect(result.deleted["user_content.save_assistant_session"]).toBe(1);
  });

  it("is safe to run twice: a second run over already-deleted data finishes without error", async () => {
    await deleteUserAccount(USER_ID);
    for (const c of Object.values(collections)) {
      c.deleteMany.mockResolvedValue({ deletedCount: 0 });
      c.deleteOne.mockResolvedValue({ deletedCount: 0 });
    }
    const second = await deleteUserAccount(USER_ID);
    expect(second.deleted["user_content.level_test"]).toBe(0);
    expect(second.deleted["cms.auth"]).toBe(0);
  });

  it("deletes the auth document last", async () => {
    await deleteUserAccount(USER_ID);
    const order = allDeleteCalls().map(({ key }) => key);
    expect(order[order.length - 1]).toBe("cms.auth");
  });

  it("skips Stripe entirely for a user who never paid", async () => {
    await deleteUserAccount(USER_ID);
    expect(mockGetStripeAdapter).not.toHaveBeenCalled();
  });

  it("cancels live Stripe subscriptions, from our records and the customer, before deleting", async () => {
    fixtures["user_content.subscription"] = { find: [{ payment_meta_data: { provider: "stripe", stripe: { subscription_id: "sub_local" } } }] };
    fixtures["user_content.stripe_customer"] = { findOne: { user_id: USER_ID, customer_id: "cus_1" } };
    stripe.subscriptions.list.mockImplementation(
      listOf([
        { id: "sub_trial", status: "trialing" },
        { id: "sub_old", status: "canceled" },
      ])
    );
    mockGetSubscriptionDetails.mockImplementation(async (id) => ({ id, status: id === "sub_local" ? "active" : "trialing" }));

    const result = await deleteUserAccount(USER_ID);

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 100 });
    expect(stripe.subscriptions.cancel.mock.calls.map((c) => c[0]).sort()).toEqual(["sub_local", "sub_trial"]);
    expect(result.canceledStripeSubscriptions.sort()).toEqual(["sub_local", "sub_trial"]);
    expect(collections["user_content.subscription"].find).toHaveBeenCalledWith({
      user_id: USER_OID,
      "payment_meta_data.provider": "stripe",
      status: { $nin: ["canceled", "incomplete_expired"] },
    });
  });

  it("does not cancel a subscription Stripe already ended or no longer has", async () => {
    fixtures["user_content.subscription"] = {
      find: [
        { payment_meta_data: { provider: "stripe", stripe: { subscription_id: "sub_ended" } } },
        { payment_meta_data: { provider: "stripe", stripe: { subscription_id: "sub_missing" } } },
      ],
    };
    mockGetSubscriptionDetails.mockImplementation(async (id) => {
      if (id === "sub_missing") throw Object.assign(new Error("No such subscription"), { code: "resource_missing" });
      return { id, status: "canceled" };
    });

    await deleteUserAccount(USER_ID);

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(collections["cms.auth"].deleteOne).toHaveBeenCalled();
  });

  it("deletes nothing when a Stripe cancel fails", async () => {
    fixtures["user_content.stripe_customer"] = { findOne: { user_id: USER_ID, customer_id: "cus_1" } };
    stripe.subscriptions.list.mockImplementation(listOf([{ id: "sub_1", status: "active" }]));
    mockGetSubscriptionDetails.mockResolvedValue({ id: "sub_1", status: "active" });
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("Stripe is down"));

    await expect(deleteUserAccount(USER_ID)).rejects.toThrow(AccountDeletionError);
    await expect(deleteUserAccount(USER_ID)).resolves.toBeTruthy(); // a retry goes through

    // Only the retry deleted anything: every collection was hit exactly once.
    expect(collections["cms.auth"].deleteOne).toHaveBeenCalledTimes(1);
    expect(collections["user_content.phrase"].deleteMany).toHaveBeenCalledTimes(1);
  });

  it("deletes nothing when Stripe is not configured but the user has a subscription", async () => {
    fixtures["user_content.stripe_customer"] = { findOne: { user_id: USER_ID, customer_id: "cus_1" } };
    mockGetStripeAdapter.mockImplementationOnce(() => {
      throw new Error("Payment adapter for provider stripe not registered");
    });

    await expect(deleteUserAccount(USER_ID)).rejects.toThrow(/account was not deleted/);
    expect(allDeleteCalls()).toEqual([]);
  });

  it("rejects a missing or malformed user id", async () => {
    await expect(deleteUserAccount("")).rejects.toThrow("User ID is required");
    await expect(deleteUserAccount("not-an-id")).rejects.toThrow("Invalid user ID");
    expect(allDeleteCalls()).toEqual([]);
  });
});
