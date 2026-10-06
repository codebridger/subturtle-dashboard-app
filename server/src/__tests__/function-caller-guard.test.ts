import { describe, it, expect, jest } from "@jest/globals";
import { decodeCaller, functionCallerGuard } from "../function-caller-guard";

// An unsigned token is enough: the guard only decodes, the router verifies afterwards.
function token(claims: Record<string, unknown>) {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const USER = token({ id: "u1", permissionGroup: { title: "end-user" } });
const ADMIN = token({ id: "a1", permissionGroup: { title: "administrator" } });

async function call(args: unknown, authorization?: string, path = "/function/run", method = "POST") {
  const ctx: any = { method, path, headers: { authorization }, request: { body: { name: "f", args } }, status: 404, body: undefined };
  const next = jest.fn(async () => undefined);
  await functionCallerGuard(ctx, next);
  return { passed: next.mock.calls.length === 1, status: ctx.status };
}

describe("functionCallerGuard", () => {
  it("lets a user act on their own account", async () => {
    expect((await call({ userId: "u1" }, USER)).passed).toBe(true);
    expect((await call({ refId: "u1", phrase: "on the fence" }, USER)).passed).toBe(true);
  });

  it("lets calls without userId or refId through", async () => {
    expect((await call({ bundleId: "b1" }, USER)).passed).toBe(true);
    expect((await call(undefined, USER)).passed).toBe(true);
  });

  it("rejects a userId or refId that isn't the caller", async () => {
    expect(await call({ userId: "u2" }, USER)).toEqual({ passed: false, status: 403 });
    expect(await call({ refId: "u2" }, USER)).toEqual({ passed: false, status: 403 });
    expect(await call({ userId: "u1", refId: "u2" }, USER)).toEqual({ passed: false, status: 403 });
  });

  it("rejects a claimed account when there is no usable token", async () => {
    expect((await call({ userId: "u1" })).status).toBe(403);
    expect((await call({ userId: "u1" }, "not-a-jwt")).status).toBe(403);
  });

  it("lets an administrator act on any account", async () => {
    expect((await call({ userId: "u2" }, ADMIN)).passed).toBe(true);
  });

  it("guards every path spelling the function router accepts", async () => {
    for (const path of ["/Function/Run", "/function/run/", "//function//run"]) {
      expect((await call({ userId: "u2" }, USER, path)).status).toBe(403);
    }
  });

  it("leaves other routes alone", async () => {
    expect((await call({ userId: "u2" }, USER, "/data-provider/find")).passed).toBe(true);
    expect((await call({ userId: "u2" }, USER, "/function/run", "GET")).passed).toBe(true);
  });
});

describe("decodeCaller", () => {
  it("reads the id and the administrator flag", () => {
    expect(decodeCaller(USER)).toEqual({ id: "u1", isAdmin: false });
    expect(decodeCaller(ADMIN)).toEqual({ id: "a1", isAdmin: true });
  });

  it("returns null for anything that isn't a token with an id", () => {
    expect(decodeCaller(undefined)).toBeNull();
    expect(decodeCaller("abc")).toBeNull();
    expect(decodeCaller(token({ email: "x@example.com" }))).toBeNull();
  });
});
