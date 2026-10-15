import { describe, it, expect, jest } from "@jest/globals";
import { generateKeyPairSync, sign, KeyObject } from "crypto";
import { verifyAppleIdentityToken, createAppleKeyFetcher, AppleJwk, AppleTokenError } from "../apple";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const KID = "test-kid";
const AUDIENCE = "app.subturtle.subturtle";
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const NOW_S = Math.floor(NOW / 1000);

const jwk = { ...(publicKey.export({ format: "jwk" }) as any), kid: KID, alg: "RS256", use: "sig" } as AppleJwk;

function b64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeToken(payload: Record<string, unknown> = {}, header: Record<string, unknown> = {}, key: KeyObject = privateKey) {
  const h = b64url({ alg: "RS256", kid: KID, ...header });
  const p = b64url({
    iss: "https://appleid.apple.com",
    aud: AUDIENCE,
    exp: NOW_S + 600,
    iat: NOW_S,
    sub: "001234.abcdef.1234",
    email: "abc123@privaterelay.appleid.com",
    email_verified: true,
    is_private_email: "true",
    ...payload,
  });
  const signature = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url");
  return `${h}.${p}.${signature}`;
}

function verify(token: string, keys: AppleJwk[] = [jwk]) {
  const fetchKeys = jest.fn(async (_force: boolean) => keys);
  return { fetchKeys, result: verifyAppleIdentityToken(token, { audiences: [AUDIENCE], fetchKeys, now: NOW }) };
}

async function expectRejected(promise: Promise<unknown>, message: RegExp) {
  await expect(promise).rejects.toBeInstanceOf(AppleTokenError);
  await expect(promise).rejects.toThrow(message);
}

describe("verifyAppleIdentityToken", () => {
  it("accepts a valid token, including a private-relay email", async () => {
    const { result } = verify(makeToken());
    await expect(result).resolves.toEqual({
      sub: "001234.abcdef.1234",
      email: "abc123@privaterelay.appleid.com",
      isPrivateEmail: true,
    });
  });

  it("accepts email_verified sent as the string \"true\"", async () => {
    await expect(verify(makeToken({ email_verified: "true" })).result).resolves.toMatchObject({ email: "abc123@privaterelay.appleid.com" });
  });

  it("allows a minute of clock skew on exp", async () => {
    await expect(verify(makeToken({ exp: NOW_S - 30 })).result).resolves.toBeTruthy();
  });

  it("rejects a token issued to another app", async () => {
    await expectRejected(verify(makeToken({ aud: "com.someone.else" })).result, /not issued to a SubTurtle client/);
  });

  it("rejects a token not issued by Apple", async () => {
    await expectRejected(verify(makeToken({ iss: "https://evil.example" })).result, /not issued by Apple/);
  });

  it("rejects an expired token", async () => {
    await expectRejected(verify(makeToken({ exp: NOW_S - 120 })).result, /expired/);
  });

  it("rejects a token signed by another key", async () => {
    await expectRejected(verify(makeToken({}, {}, otherPrivateKey)).result, /signature is invalid/);
  });

  it("rejects a token whose payload was altered after signing", async () => {
    const [h, , s] = makeToken().split(".");
    const forged = `${h}.${b64url({ iss: "https://appleid.apple.com", aud: AUDIENCE, exp: NOW_S + 600, sub: "x", email: "victim@b.test", email_verified: true })}.${s}`;
    await expectRejected(verify(forged).result, /signature is invalid/);
  });

  it("rejects a token naming an unknown key, after refetching the keys once", async () => {
    const { fetchKeys, result } = verify(makeToken({}, { kid: "rotated-away" }));
    await expectRejected(result, /unknown key/);
    expect(fetchKeys.mock.calls).toEqual([[false], [true]]);
  });

  it("rejects a token that is not RS256", async () => {
    await expectRejected(verify(makeToken({}, { alg: "none" })).result, /RS256/);
  });

  it("rejects an account whose email Apple has not verified", async () => {
    await expectRejected(verify(makeToken({ email_verified: false })).result, /not verified/);
    await expectRejected(verify(makeToken({ email_verified: "false" })).result, /not verified/);
  });

  it("rejects a token without an email", async () => {
    await expectRejected(verify(makeToken({ email: undefined })).result, /no email/);
  });

  it("rejects a malformed token", async () => {
    await expectRejected(verify("not-a-jwt").result, /Malformed/);
  });
});

describe("createAppleKeyFetcher", () => {
  function fetcher(options: { minRefreshIntervalMs?: number } = {}) {
    const fetchImpl = jest.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }) }));
    return { fetchImpl, fetchKeys: createAppleKeyFetcher({ fetchImpl, ...options }) };
  }

  it("caches the keys between calls", async () => {
    const { fetchImpl, fetchKeys } = fetcher();
    await fetchKeys(false);
    await fetchKeys(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://appleid.apple.com/auth/keys");
  });

  it("refetches on a forced refresh once the throttle allows", async () => {
    const { fetchImpl, fetchKeys } = fetcher({ minRefreshIntervalMs: 0 });
    await fetchKeys(false);
    await fetchKeys(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throttles forced refreshes so unknown kids cannot flood Apple", async () => {
    const { fetchImpl, fetchKeys } = fetcher();
    await fetchKeys(false);
    await fetchKeys(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
