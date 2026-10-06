import { google } from "googleapis";

/**
 * Authentication for `POST /schedule/tick` (SCHEDULE_DRIVER=http).
 *
 * Cloud Scheduler calls the tick with a Google-signed OIDC ID token in
 * `Authorization: Bearer <token>`. The rest of the API stays public, so the route checks
 * the token itself: signature, expiry and `aud` via Google's verifier, then that the
 * token belongs to the scheduler's service account.
 *
 * - SCHEDULE_TICK_AUDIENCE: the audience configured on the Cloud Scheduler job (the
 *   Cloud Run service URL).
 * - SCHEDULE_TICK_INVOKER: the service account email the job signs its token as.
 */
export interface TickAuthConfig {
  audience: string;
  invoker: string;
}

export function getTickAuthConfig(): TickAuthConfig {
  const audience = process.env.SCHEDULE_TICK_AUDIENCE;
  const invoker = process.env.SCHEDULE_TICK_INVOKER;
  if (!audience || !invoker) {
    throw new Error("SCHEDULE_DRIVER=http requires SCHEDULE_TICK_AUDIENCE and SCHEDULE_TICK_INVOKER");
  }
  return { audience, invoker };
}

const tokenVerifier = new google.auth.OAuth2();

/** Null when the request carries a valid scheduler token, otherwise why it is refused. */
export async function verifyTickRequest(
  authorization: string | undefined
): Promise<{ status: number; message: string } | null> {
  let config: TickAuthConfig;
  try {
    config = getTickAuthConfig();
  } catch (error: any) {
    return { status: 503, message: error.message };
  }

  const idToken = /^Bearer\s+(\S+)$/i.exec(authorization || "")?.[1];
  if (!idToken) return { status: 401, message: "Missing bearer token" };

  try {
    const ticket = await tokenVerifier.verifyIdToken({ idToken, audience: config.audience });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== config.invoker) {
      return { status: 403, message: "Token does not belong to the scheduler service account" };
    }
    return null;
  } catch {
    return { status: 401, message: "Invalid token" };
  }
}
