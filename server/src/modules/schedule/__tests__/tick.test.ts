import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockVerifyIdToken = jest.fn<(options: { idToken: string; audience: string }) => Promise<any>>();
jest.mock("googleapis", () => ({
  google: { auth: { OAuth2: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })) } },
}));

const mockRunDueJobs = jest.fn(async () => ({ claimed: 2, succeeded: 2 }));
jest.mock("../service", () => ({
  ...(jest.requireActual("../service") as object),
  ScheduleService: { runDueJobs: () => mockRunDueJobs() },
}));

import { verifyTickRequest } from "../tick-auth";
import { main as scheduleRouter } from "../router";

const AUDIENCE = "https://subturtle-api.example.run.app";
const INVOKER = "scheduler-invoker@subturtle-dev.iam.gserviceaccount.com";

function tokenFor(payload: Record<string, unknown>) {
  mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

const env = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.SCHEDULE_DRIVER = "http";
  process.env.SCHEDULE_TICK_AUDIENCE = AUDIENCE;
  process.env.SCHEDULE_TICK_INVOKER = INVOKER;
});
afterEach(() => {
  process.env = { ...env };
});

describe("verifyTickRequest", () => {
  it("accepts a verified token from the scheduler service account for the configured audience", async () => {
    tokenFor({ email: INVOKER, email_verified: true });

    expect(await verifyTickRequest("Bearer id.token.sig")).toBeNull();
    expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: "id.token.sig", audience: AUDIENCE });
  });

  it("refuses a missing or malformed Authorization header", async () => {
    expect(await verifyTickRequest(undefined)).toMatchObject({ status: 401 });
    expect(await verifyTickRequest("Basic abc")).toMatchObject({ status: 401 });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it("refuses a token Google does not verify (signature, expiry or audience)", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Wrong recipient, payload audience != requiredAudience"));

    expect(await verifyTickRequest("Bearer forged")).toMatchObject({ status: 401 });
  });

  it("refuses a valid Google token from any other account", async () => {
    tokenFor({ email: "someone@example.com", email_verified: true });
    expect(await verifyTickRequest("Bearer t")).toMatchObject({ status: 403 });

    tokenFor({ email: INVOKER, email_verified: false });
    expect(await verifyTickRequest("Bearer t")).toMatchObject({ status: 403 });
  });

  it("fails closed when the expected audience or invoker is not configured", async () => {
    delete process.env.SCHEDULE_TICK_INVOKER;

    expect(await verifyTickRequest("Bearer t")).toMatchObject({ status: 503 });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});

describe("POST /schedule/tick", () => {
  const tickHandler = (scheduleRouter as any).stack.find((layer: any) => layer.path === "/tick").stack[0];

  async function callTick(authorization?: string) {
    const ctx: any = { status: 200, body: undefined, get: (header: string) => (header === "Authorization" ? authorization : undefined) };
    await tickHandler(ctx, async () => undefined);
    return ctx;
  }

  it("drains due jobs for an authenticated scheduler and reports the summary", async () => {
    tokenFor({ email: INVOKER, email_verified: true });

    const ctx = await callTick("Bearer id.token.sig");

    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ claimed: 2, succeeded: 2 });
    expect(mockRunDueJobs).toHaveBeenCalledTimes(1);
  });

  it("does not drain for an unauthenticated caller", async () => {
    const ctx = await callTick();

    expect(ctx.status).toBe(401);
    expect(mockRunDueJobs).not.toHaveBeenCalled();
  });

  it("is disabled while the in-process interval driver is in charge", async () => {
    process.env.SCHEDULE_DRIVER = "interval";

    const ctx = await callTick("Bearer id.token.sig");

    expect(ctx.status).toBe(404);
    expect(mockRunDueJobs).not.toHaveBeenCalled();
  });
});
