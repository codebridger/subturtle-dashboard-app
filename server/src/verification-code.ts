import * as crypto from "crypto";

/**
 * The code modular-rest hands out from `/user/register_id` and checks in
 * `/user/submit_password` and `/user/change_password`.
 *
 * Those two routes reset the password of any *existing* account matching the id, so a
 * fixed code lets anyone take over an account knowing only its email address —
 * including Google-only accounts, which have an email but no password of their own. No
 * shipping client uses them in production (the dashboard signs in with Google; the
 * extension's password form is gated on ENABLE_PASSWORD_AUTH at build time) and nothing
 * delivers the code by email or SMS, so production gets an unguessable value that no
 * caller can ever present, which closes the flow. Outside production the well-known
 * code keeps `scripts/create-standard-user.mjs` and the agent-tests loop working.
 */
export function generateVerificationCode(): string {
  if (process.env.NODE_ENV === "production") {
    return crypto.randomBytes(16).toString("hex");
  }

  return "123456";
}
