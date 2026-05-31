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
   the test user + its `stripe_customer` mapping, drop its `subscription` /
   `free_credit` / `usage` rows. Leave no live Stripe subs.
6. **Write a report** to `agent-tests/_runs/<UTC-timestamp>.md`: per-expectation
   PASS/FAIL + evidence + a summary. `_runs/` is gitignored.

## Environment cheat-sheet (this repo)

- **RPC:** `POST http://localhost:8080/function/run` with JSON `{ "name", "args" }`
  and header `authorization: <token>` (raw JWT, no `Bearer`). A blocked call returns
  **HTTP 400** `{"status":"error","message":"TIER_LIMIT_REACHED: \"<feature>\" …"}`
  or `… "AI_CREDIT_EXHAUSTED: …"`.
- **Auth (no email-signup UI):** `GET /user/loginAnonymous`; or
  `register_id → validateCode → submit_password → login` with dev code **`123456`**
  (`POST /user/<route>`, body `{idType:"email", id, code?, password?}`) → `{ token }`.
- **Mongo (this machine):** prefix from `server/.env` `MONGO_DB_PREFIX` (currently
  `subturtle_dev_`). DB **`subturtle_dev_user_content`** holds `subscription`,
  `free_credit`, `stripe_customer`, `phrase`, `phrase_bundle`, `live_session`,
  `live_session_text`; **`subturtle_dev_cms`** holds `auths`. Use `mongosh`.
  `subscription`/`free_credit` key `user_id` as an **ObjectId**; `stripe_customer`
  keys it as a **string**.
- **Reset a user:** RPC `clearSubscriptionAndFreemium {userId}` clears
  `subscription` + `free_credit` + `usage` (NOT the Stripe sub or `stripe_customer`).
- **Drive Stripe by API** (preferred over the embedded checkout UI — deterministic,
  no 3DS): wire the test user to a Stripe customer (one `createCustomCheckoutSession`
  call creates the `stripe_customer` mapping, or insert it directly), then
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
