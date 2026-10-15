/**
 * Verifies a Sign in with Apple identity token (an RS256 JWT) with node:crypto alone.
 *
 * The iOS app gets the token from ASAuthorizationAppleIDCredential.identityToken and posts it
 * to /auth/apple/identity-token-login. The token is signed with one of the keys Apple
 * publishes at APPLE_KEYS_URL; the header's `kid` picks the key. A token is accepted only when
 * the signature checks out, Apple issued it, it was issued to one of our client IDs (`aud`),
 * it has not expired, and it carries a verified email.
 */
import { createPublicKey, verify as cryptoVerify, JsonWebKey } from "crypto";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

/** One entry of Apple's JWKS. */
export interface AppleJwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

/**
 * Returns Apple's signing keys. `forceRefresh` is set when the token names a key the
 * previous answer did not contain (Apple rotated its keys), so a cache must be bypassed.
 */
export type AppleKeyFetcher = (forceRefresh: boolean) => Promise<AppleJwk[]>;

export interface VerifyAppleTokenOptions {
  /** Client IDs (bundle ID / Services ID) the token's `aud` must be one of. */
  audiences: string[];
  fetchKeys: AppleKeyFetcher;
  /** Current time in milliseconds; injectable for tests. */
  now?: number;
  /** Tolerated clock difference when checking `exp`, in seconds. */
  clockSkewSeconds?: number;
}

export interface AppleIdentity {
  /** Apple's stable user identifier for this app team. */
  sub: string;
  email: string;
  /** True for a "Hide My Email" relay address (@privaterelay.appleid.com). */
  isPrivateEmail: boolean;
}

/** A token that must not sign anyone in. `status` is the HTTP status to reply with. */
export class AppleTokenError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
    this.name = "AppleTokenError";
  }
}

function decodeSegment(segment: string, name: string): any {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new AppleTokenError(`Malformed identity token ${name}`, 400);
  }
}

// Apple sends boolean claims as JSON booleans in some tokens and as strings in others.
function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

export async function verifyAppleIdentityToken(token: string, options: VerifyAppleTokenOptions): Promise<AppleIdentity> {
  const { audiences, fetchKeys, now = Date.now(), clockSkewSeconds = 60 } = options;

  if (typeof token !== "string" || !token) {
    throw new AppleTokenError("Identity token is required", 400);
  }

  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new AppleTokenError("Malformed identity token", 400);
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeSegment(encodedHeader, "header");
  const payload = decodeSegment(encodedPayload, "payload");

  // Pinning the algorithm stops a token from choosing how it is verified (e.g. "none").
  if (header?.alg !== "RS256") {
    throw new AppleTokenError("Identity token must be signed with RS256");
  }
  if (typeof header.kid !== "string" || !header.kid) {
    throw new AppleTokenError("Identity token has no key id");
  }

  let jwk = (await fetchKeys(false)).find((key) => key.kid === header.kid);
  if (!jwk) {
    // Apple may have rotated its keys since the cached copy was fetched.
    jwk = (await fetchKeys(true)).find((key) => key.kid === header.kid);
  }
  if (!jwk) {
    throw new AppleTokenError("Identity token was signed with an unknown key");
  }

  let signatureValid = false;
  try {
    const publicKey = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e } as JsonWebKey, format: "jwk" });
    signatureValid = cryptoVerify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      publicKey,
      Buffer.from(encodedSignature, "base64url")
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new AppleTokenError("Identity token signature is invalid");
  }

  if (payload?.iss !== APPLE_ISSUER) {
    throw new AppleTokenError("Identity token was not issued by Apple");
  }

  const tokenAudiences: unknown[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!tokenAudiences.some((aud) => typeof aud === "string" && audiences.includes(aud))) {
    throw new AppleTokenError("Identity token was not issued to a SubTurtle client");
  }

  if (typeof payload.exp !== "number" || payload.exp + clockSkewSeconds <= now / 1000) {
    throw new AppleTokenError("Identity token has expired");
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AppleTokenError("Identity token has no subject");
  }

  if (typeof payload.email !== "string" || !payload.email) {
    throw new AppleTokenError("Identity token has no email", 400);
  }

  if (!isTrue(payload.email_verified)) {
    throw new AppleTokenError("Apple account email is not verified");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    isPrivateEmail: isTrue(payload.is_private_email),
  };
}

/**
 * A key fetcher that keeps Apple's JWKS in memory for `ttlMs` and refetches when the copy is
 * stale or when asked to (unknown kid). Forced refetches are limited to one per
 * `minRefreshIntervalMs`, so tokens with made-up key ids cannot turn every request into a
 * call to Apple.
 */
export function createAppleKeyFetcher({
  url = APPLE_KEYS_URL,
  ttlMs = 60 * 60 * 1000,
  minRefreshIntervalMs = 60 * 1000,
  fetchImpl = (input: string) => fetch(input),
}: {
  url?: string;
  ttlMs?: number;
  minRefreshIntervalMs?: number;
  fetchImpl?: (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
} = {}): AppleKeyFetcher {
  let cached: { keys: AppleJwk[]; fetchedAt: number } | null = null;

  return async (forceRefresh) => {
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      if (age < ttlMs && (!forceRefresh || age < minRefreshIntervalMs)) {
        return cached.keys;
      }
    }

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new AppleTokenError(`Could not fetch Apple signing keys (HTTP ${response.status})`, 502);
    }
    const body = await response.json();
    const keys: AppleJwk[] = Array.isArray(body?.keys) ? body.keys : [];
    cached = { keys, fetchedAt: Date.now() };
    return keys;
  };
}
