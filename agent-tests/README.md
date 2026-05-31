# Agent E2E tests

End-to-end specs **run by an AI agent** (e.g. Claude), not by Jest/Playwright.
Each `*.spec.md` is a precise, executable runbook: the agent reads it, sets up the
preconditions, drives the system with its tools (Bash, the modular-rest HTTP API,
`mongosh`, the Stripe API, the browser preview), checks each expectation, and
writes a PASS/FAIL report. This suits the subscription flow, which is **async**
(grants happen in a Stripe webhook), **stateful**, and **semantic** (e.g.
"unlimited on Coach") — exactly where scripted E2E is brittle and an agent shines.

> These are slow + side-effecting (real Stripe **test mode**, real Mongo writes).
> Run them deliberately, not on every change. The Jest suites
> (`server/src/modules/**/__tests__`) cover the logic fast; these prove the whole
> lifecycle wires together.

## The runner contract (how an agent executes ANY spec here)

1. **Check preconditions; abort loudly if unmet.** Do not "best-effort" past a
   missing dependency — a missing webhook forwarder produces false failures.
   - Mongo up on `:27017` (Docker). Server up on `:8080` (**node 16–18**, from a
     fresh `dist` — see Gotchas). Frontend on `:3000` (only for UI specs).
   - `stripe listen --forward-to localhost:8080/gateway/webhook/stripe` **running**
     (grants happen in `customer.subscription.*` webhooks; Stripe can't reach
     localhost otherwise). `STRIPE_SECRET_KEY` is a `sk_test_…` key.
   - Stripe products seeded (`yarn setup:stripe`).
2. **Provision a fresh, isolated subject.** Create a new timestamped test user per
   run (`e2e+<runId>@example.com`) so reruns never collide. Never reuse a human's
   account.
3. **Execute steps in order.** After any tier transition, **poll** for the async
   grant (e.g. `getSubscriptionDetails` until `tier` changes) — never assert
   immediately after a checkout/upgrade.
4. **Verify each expectation against the capability matrix**, capturing evidence
   (RPC output, DB row, Stripe object, HTTP status, screenshot).
5. **Tear down (always, even on failure).** Cancel the Stripe subscription, delete
   the test user + its `stripe_customers` mapping, drop its `subscriptions` /
   `free_credits` / `usages` rows. Leave no live Stripe subs.
6. **Write a report** to `agent-tests/_runs/<UTC-timestamp>.md`: per-expectation
   PASS/FAIL + evidence + a summary. `_runs/` is gitignored.

## Environment cheat-sheet (this repo)

- **RPC:** `POST http://localhost:8080/function/run` with JSON `{ "name", "args" }`
  and header `authorization: <token>` (raw JWT, no `Bearer`). **`user_access` RPCs need
  `userId` IN `args`** — the framework does NOT auto-inject it (omitting it throws
  "User ID is required", or silently mis-resolves). Success →
  `{"status":"success","data":<payload>}`; a blocked call → **HTTP 400**
  `{"status":"error","message":"TIER_LIMIT_REACHED: \"<feature>\" …"}` (or
  `"AI_CREDIT_EXHAUSTED: …"`).
- **Auth (no email-signup UI):** `GET /user/loginAnonymous`; or
  `register_id → validateCode → submit_password → login` with dev code **`123456`**
  (`POST /user/<route>`, body `{idType:"email", id, code?, password?}`) → `{ token }`.
- **Mongo (this machine):** prefix from `server/.env` `MONGO_DB_PREFIX` (currently
  `subturtle_dev_`). DB **`subturtle_dev_user_content`**. Collection names are
  **PLURAL** (Mongoose pluralizes the model names from `config.ts`): `subscriptions`,
  `free_credits`, `stripe_customers`, `phrases`, `phrase_bundles`, `usages`,
  `live_sessions`, `live_session_texts`. **`subturtle_dev_cms`** holds `auths`. Use
  `mongosh` (run `$set`/`$nin` via `--eval` only with single quotes or `execFileSync`,
  else the shell eats the `$`). `subscriptions`/`free_credits` key `user_id` as an
  **ObjectId**; `stripe_customers` keys it as a **string**.
- **Reset a user:** RPC `clearSubscriptionAndFreemium {userId}` clears the user's
  `subscriptions` + `free_credits` + `usages` (NOT the Stripe sub or `stripe_customers`).
- **Drive Stripe by API** (preferred over the embedded checkout UI — deterministic,
  no 3DS): wire the test user to a Stripe customer (one `createCustomCheckoutSession`
  call creates the `stripe_customers` mapping, or insert it directly), then
  `stripe.subscriptions.create({ customer, items:[{price}], default_payment_method:
  'pm_card_visa' })`. **Upgrade** = `stripe.subscriptions.update(sub, { items:
  [{ id, price: <next> }] })` (fires `customer.subscription.updated`). Resolve a
  tier's GBP price id from Stripe: `products.list({active})` → match
  `metadata.tier_id` → `prices.list({product})` → the `gbp` / `recurring.interval`
  one.
- **Stripe test clocks** make the trial→active transition and renewals deterministic.

## Gotchas

- The server loads modules from **`dist/`** (`createRest({ modulesPath: ../dist/modules })`),
  so after editing server code you must rebuild (`tsc`) before restarting — `ts-node`
  alone runs stale compiled modules.
- Run the **server on node 16–18**; node 14 breaks `formidable`, node 22 breaks the
  Mongoose 5 handshake. Build (`tsc`) / Jest are fine on node 22.
- Most caps are checked only at their RPC; `featureCapFor` is enforced via the
  helpers in `server/src/modules/subscription/enforcement.ts`.

## Layout

```
agent-tests/
  README.md                     # this contract
  subscription/
    capability-matrix.md        # features × tiers — the assertion source of truth
    _helpers.md                 # reusable recipes (provision, drive Stripe, exercisers, teardown)
    tier-ladder.spec.md         # Starter → Reader → Learner → Coach → cancel, full enforcement
  _runs/                        # (gitignored) timestamped run reports
```

A working **reference executor** for the tier ladder lives at
[`server/scripts/e2e-tier-ladder.js`](../server/scripts/e2e-tier-ladder.js): with
the preconditions met, run `cd server && node scripts/e2e-tier-ladder.js`
(node 18+) to execute the spec and write a `_runs/` report. It encodes the exact
collection names + `userId`-in-args contract above, and uses the **fresh-sub-per-tier**
path (each `create` fires an immediate grant) — an in-place `subscriptions.update`
only refills entitlements on the next billing period, so observing a plan-swap
upgrade live needs a Stripe **test clock**. Last run: **38/38 passed**.
