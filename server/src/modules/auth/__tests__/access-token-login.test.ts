import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockGetTokenInfo = jest.fn<(token: string) => Promise<any>>();
jest.mock("googleapis", () => ({
  google: { auth: { OAuth2: jest.fn(() => ({ getTokenInfo: mockGetTokenInfo })) } },
}));

const mockUserManager = {
  getUserByIdentity: jest.fn(async (_identity: string, _type: string) => ({ id: "user-1" })),
  registerUser: jest.fn(async (_user: any) => "user-1"),
  issueTokenForUser: jest.fn(async (_email: string) => "subturtle-jwt"),
};
jest.mock("@modular-rest/server", () => ({
  reply: { create: (_status: string, body: any) => body },
  userManager: mockUserManager,
}));
jest.mock("../../profile/service", () => ({ updateUserProfile: jest.fn() }));
jest.mock("../../leitner_box/service", () => ({ LeitnerService: { ensureInitialized: jest.fn() } }));
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: { ACCOUNT_CREATED: "account_created" },
}));

const WEB_CLIENT = "web-client.apps.googleusercontent.com";
const OLD_EXTENSION_CLIENT = "old-extension-client.apps.googleusercontent.com";
const EXTENSION_CLIENT = "extension-client.apps.googleusercontent.com";

// The router reads its client IDs when it loads.
process.env.GOOGLE_OAUTH_CLIENT_ID = WEB_CLIENT;
process.env.GOOGLE_OAUTH_CLIENT_ID_EXTENSION = ` ${OLD_EXTENSION_CLIENT} , ${EXTENSION_CLIENT}`;
const { main: authRouter } = require("../router");
const handler = authRouter.stack.find((layer: any) => layer.path === "/google/access-token-login").stack[0];

async function login(tokenInfo: Record<string, unknown>) {
  mockGetTokenInfo.mockResolvedValue(tokenInfo);
  const ctx: any = {
    query: { access_token: "ya29.access-token" },
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

describe("GET /auth/google/access-token-login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("signs in with a token issued to the web client, as the extension's launchWebAuthFlow gets", async () => {
    const res = await login({ aud: WEB_CLIENT, email: "a@b.test", email_verified: "true" });

    expect(res).toEqual({ status: 200, body: { token: "subturtle-jwt" } });
    expect(mockUserManager.issueTokenForUser).toHaveBeenCalledWith("a@b.test");
  });

  it("accepts every client listed in GOOGLE_OAUTH_CLIENT_ID_EXTENSION, old and new during a migration", async () => {
    for (const aud of [OLD_EXTENSION_CLIENT, EXTENSION_CLIENT]) {
      expect((await login({ aud, email: "a@b.test", email_verified: "true" })).status).toBe(200);
    }
  });

  it("rejects a Google token issued to any other app", async () => {
    const res = await login({ aud: "someone-elses-app.apps.googleusercontent.com", email: "victim@b.test", email_verified: "true" });

    expect(res.status).toBe(401);
    expect(mockUserManager.getUserByIdentity).not.toHaveBeenCalled();
    expect(mockUserManager.issueTokenForUser).not.toHaveBeenCalled();
  });

  it("rejects an account whose email Google has not verified", async () => {
    const res = await login({ aud: WEB_CLIENT, email: "victim@b.test", email_verified: "false" });

    expect(res.status).toBe(401);
    expect(mockUserManager.issueTokenForUser).not.toHaveBeenCalled();
  });
});
