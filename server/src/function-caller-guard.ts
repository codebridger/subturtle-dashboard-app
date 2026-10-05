/**
 * Locks `POST /function/run` to the signed-in user.
 *
 * modular-rest calls a function with only the `args` the client sent; the caller is never
 * passed in. Most functions here take `userId` / `refId` from those args and act on that
 * account, so without this check any signed-in user could act on another user's account by
 * sending their id (read their subscription, spend their voice minutes, reset their data).
 *
 * Registered through createRest's `onBeforeInit`, which runs after koa-body and before the
 * routers. It only decodes the token: the function router's own auth middleware still
 * verifies the signature before anything runs, so a forged token gains nothing here.
 * Administrators may act on any account.
 */
// The slice of a Koa context the guard touches (the server has no Koa type package).
interface GuardContext {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  request: { body?: any };
  status: number;
  body: unknown;
}

// The fields functions read the acting account from.
const CALLER_FIELDS = ["userId", "refId"] as const;

// koa-router matches routes case-insensitively and tolerates repeated or trailing slashes,
// so the guard has to match every spelling the function router would accept.
const FUNCTION_RUN_PATH = /^\/+function\/+run\/*$/i;

interface Caller {
  id: string;
  isAdmin: boolean;
}

/** Reads the caller from a modular-rest token (a raw JWT in `authorization`) without verifying it. */
export function decodeCaller(token: unknown): Caller | null {
  if (typeof token !== "string") return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims?.id) return null;
    return {
      id: String(claims.id),
      isAdmin: claims.permissionGroup?.title === "administrator",
    };
  } catch {
    return null;
  }
}

export async function functionCallerGuard(ctx: GuardContext, next: () => Promise<unknown>) {
  if (ctx.method === "POST" && FUNCTION_RUN_PATH.test(ctx.path)) {
    const args = ctx.request.body?.args;
    const claimed = CALLER_FIELDS.map((field) => args?.[field]).filter(
      (value) => value !== undefined && value !== null && value !== ""
    );

    if (claimed.length > 0) {
      const caller = decodeCaller(ctx.headers.authorization);
      const actsForSomeoneElse = claimed.some((id) => String(id) !== caller?.id);
      if (!caller?.isAdmin && actsForSomeoneElse) {
        ctx.status = 403;
        ctx.body = {
          status: "error",
          message: "FORBIDDEN: a function can only act on the signed-in user's account.",
        };
        return;
      }
    }
  }

  await next();
}
