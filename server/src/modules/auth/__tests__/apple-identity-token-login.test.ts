import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockVerify = jest.fn<(token: string, options: any) => Promise<any>>();
jest.mock("../apple", () => {
  const actual = jest.requireActual<typeof import("../apple")>("../apple");
  return { ...actual, createAppleKeyFetcher: () => jest.fn(), verifyAppleIdentityToken: mockVerify };
});
jest.mock("googleapis", () => ({ google: { auth: { OAuth2: jest.fn() } } }));

const mockUserManager = {
  getUserByIdentity: jest.fn<(identity: string, type: string) => Promise<any>>(),
  registerUser: jest.fn(async (_user: any) => "new-user"),
  issueTokenForUser: jest.fn(async (_email: string) => "subturtle-jwt"),
};
jest.mock("@modular-rest/server", () => ({
  reply: { create: (_status: string, body: any) => body },
  userManager: mockUserManager,
}));
const mockUpdateUserProfile = jest.fn();
jest.mock("../../profile/service", () => ({ updateUserProfile: mockUpdateUserProfile }));
const mockEnsureInitialized = jest.fn();
jest.mock("../../leitner_box/service", () => ({ LeitnerService: { ensureInitialized: mockEnsureInitialized } }));
const mockTrack = jest.fn();
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: mockTrack,
  SERVER_ANALYTICS_EVENTS: { ACCOUNT_CREATED: "account_created" },
}));

delete process.env.APPLE_CLIENT_IDS;
const { AppleTokenError } = jest.requireActual<typeof import("../apple")>("../apple");
const { main: authRouter } = require("../router");
const layer = authRouter.stack.find((l: any) => l.path === "/apple/identity-token-login");
const handler = layer.stack[0];

async function login(body: Record<string, unknown>) {
  const ctx: any = {
    request: { body },
    throw(status: number, message: string) {
      throw Object.assign(new Error(message), { status });
    },
  };
  try {
    await handler(ctx, async () => undefined);
    return { status: 200, body: ctx.body };
  } catch (error: any) {
    return { status: error.status, message: error.message };
  }
}

describe("POST /auth/apple/identity-token-login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockResolvedValue({ sub: "apple-sub", email: "x@privaterelay.appleid.com", isPrivateEmail: true });
  });

  it("is a POST route", () => {
    expect(layer.methods).toContain("POST");
  });

  it("signs in an existing user without touching the profile", async () => {
    mockUserManager.getUserByIdentity.mockResolvedValue({ id: "user-1" });

    const res = await login({ identityToken: "jwt", fullName: "Ada Lovelace" });

    expect(res).toEqual({ status: 200, body: { token: "subturtle-jwt" } });
    expect(mockVerify).toHaveBeenCalledWith("jwt", expect.objectContaining({ audiences: ["app.subturtle.subturtle"] }));
    expect(mockUserManager.registerUser).not.toHaveBeenCalled();
    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    expect(mockEnsureInitialized).toHaveBeenCalledWith("user-1");
    expect(mockUserManager.issueTokenForUser).toHaveBeenCalledWith("x@privaterelay.appleid.com");
  });

  it("registers a new user, tracks the signup and saves the name Apple shared", async () => {
    mockUserManager.getUserByIdentity.mockRejectedValue(new Error("User not found"));

    const res = await login({ identityToken: "jwt", fullName: "  Ada Lovelace " });

    expect(res.status).toBe(200);
    expect(mockUserManager.registerUser).toHaveBeenCalledWith({ email: "x@privaterelay.appleid.com" });
    expect(mockTrack).toHaveBeenCalledWith("account_created", "new-user", { signup_provider: "apple" });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ refId: "new-user", name: "Ada Lovelace" }, false);
    expect(mockEnsureInitialized).toHaveBeenCalledWith("new-user");
  });

  it("rejects a request without an identity token", async () => {
    const res = await login({});
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("rejects a token the verifier refuses, without signing anyone in", async () => {
    mockVerify.mockRejectedValue(new AppleTokenError("Identity token was not issued to a SubTurtle client"));

    const res = await login({ identityToken: "jwt" });

    expect(res).toEqual({ status: 401, message: "Identity token was not issued to a SubTurtle client" });
    expect(mockUserManager.getUserByIdentity).not.toHaveBeenCalled();
    expect(mockUserManager.issueTokenForUser).not.toHaveBeenCalled();
  });

  it("answers 502 when Apple's keys cannot be fetched", async () => {
    mockVerify.mockRejectedValue(new Error("fetch failed"));
    expect((await login({ identityToken: "jwt" })).status).toBe(502);
  });
});
