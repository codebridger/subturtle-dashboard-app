# Spec: tier ladder — Starter → Reader → Learner → Coach → cancel

**Goal:** prove the full subscription lifecycle and that each gated capability is
limited on lower tiers and unlocked as the user climbs the ladder, then locks back
down on cancel.

**Reads:** [`capability-matrix.md`](./capability-matrix.md) (expectations),
[`_helpers.md`](./_helpers.md) (recipes), [`../README.md`](../README.md) (contract).

**Layers covered:** API-driven entitlement ladder (primary) + a UI pass (§7).
**Upgrade paths:** in-place plan-swap (primary) + fresh-sub-per-tier (§6 variant).
**Verification depth:** full enforcement — every gate exercised at its boundary.

---

## Preconditions (abort if unmet — see README contract)
Mongo `:27017`; server `:8080` (node 16–18, fresh `dist`); `stripe listen` forwarding
to `/gateway/webhook/stripe`; `sk_test_…` key; products seeded. For §7 also frontend `:3000`.

## Setup
- **P1** provision a fresh user → `{token, userId}`. **S1** wire its Stripe customer
  → `CUSTOMER`. **S2** resolve monthly price ids for reader/learner/coach.
- Record a `runId`; everything is torn down in §8.

---

## Step 0 — Starter (free baseline)
- **Expect (matrix):** `getSubscriptionDetails` → `is_freemium:true`, `tier:"starter"`,
  `allowed_save_words:200`, `allowed_lived_sessions:3`, `voice_minutes_total:5`,
  `total_credits:5000000`.
- **Exercise the limits (E·\*):**
  - `weekly_insights` → `getUserStatistic` returns **400 "weekly_insights"** (locked).
  - `session_history` → `list-live-sessions` returns **400 "session_history"** (locked).
  - `save_words` → seed used=199, two `createPhrase` → 1st **ok**, 2nd **400 "save_words"**.
  - `live_sessions` → seed used=3, token request → **400 "live_sessions"**.
  - `voice_minutes` → seed `free_credit.voice_minutes_used=5`, token request → **400 "voice_minutes"**.
- **Reset** the seeded usage (`clearSubscriptionAndFreemium {userId}`) before Step 1.

## Step 1 — Subscribe to Reader (created)
- **Perform:** S3 create a subscription on the Reader monthly price.
- **Await:** A1 until `tier:"reader"`.
- **Expect grant (matrix snapshot):** `tier:"reader"`, `total_credits:200000000`,
  `voice_minutes_total:0`, `entitlements.weeklyInsights:false`, `sessionHistory:false`;
  and a `subscription` doc with an `entitlements` snapshot.
- **Exercise — what unlocked vs not:**
  - `save_words` → now **unlimited** (two creates past 200 both **ok**). ✅ unlocked
  - `weekly_insights` → `getUserStatistic` still **400** (Reader locked). 🔒
  - `session_history` → `list-live-sessions` still **400**. 🔒
  - `voice_minutes` → token request **400 "voice_minutes"** (Reader granted 0 — text-only). 🔒
  - AI credits → an AI call succeeds (budget 200M, not exhausted). ✅

## Step 2 — Upgrade Reader → Learner (in-place, updated) + trial coverage
- **Perform:** S3 `subscriptions.update` to the Learner monthly price.
- **Await:** A1 until `tier:"learner"`.
- **Expect grant:** `tier:"learner"`, `total_credits:300000000`, `voice_minutes_total:90`,
  `entitlements.weeklyInsights:true`, `sessionHistory:true`.
- **Exercise — the unlocks:**
  - `weekly_insights` → `getUserStatistic` now **200** `{totalPhrases,totalBundles}`. ✅
  - `session_history` → `list-live-sessions` now **200** `{items,total,pages}`. ✅
  - `voice_minutes` → a token request is **allowed** (budget 90 > 0); then
    `debit-voice-minutes {seconds:5400}` (90 min) → next token request **400 "voice_minutes"**
    (budget exhausted). Reset the budget after.
- **Trial note:** to cover Learner's 3-day trial, alternatively create the sub with
  `trial_period_days` (from product metadata) and assert status `trialing` still grants
  the full budget; advance a **test clock** past the trial → `customer.subscription.updated`
  with status `active` (trial→paid). The grant budget is unchanged.

## Step 3 — Upgrade Learner → Coach (in-place, updated)
- **Perform:** S3 update to the Coach monthly price. **Await** `tier:"coach"`.
- **Expect grant:** `tier:"coach"`, `total_credits:600000000`, `voice_minutes_total:300`,
  insights/history still `true`.
- **Exercise:** insights + history still **200**; voice budget is now **300** (debit 300
  min → blocked). save_words still ∞.

## Step 4 — Cancel → revert to Starter (deleted)
- **Perform:** S3 cancel the subscription. **Await** until `is_freemium:true` again.
- **Expect:** back to the **Starter** column — `weekly_insights` + `session_history`
  **400** again; `save_words` capped at 200 again; `voice_minutes_total:5`.

## Step 5 — Idempotency (no double-grant)
- In the Stripe dashboard (or via API event resend), **redeliver** the Step 1
  `customer.subscription.created` event.
- **Expect:** still exactly one active `subscription` doc for the user; credits NOT
  doubled (guarded on subscription id + `granted_period_end`).

## §6 — Variant: fresh-sub-per-tier (created path)
Repeat the ladder but instead of plan-swap, between tiers **cancel + create a new
subscription** on the next tier's price (each fires `customer.subscription.created`).
Assert the same per-tier grants + enforcement. This exercises the `created` grant path
for every tier (Step 2/3 above exercise the `updated`/renewal path).

## §7 — Variant: UI pass (frontend surfaces)
With frontend `:3000` and a logged-in user (inject the token in `localStorage`):
- **Free user** → opening **/statistic** and **/sessions** shows the global **upgrade
  modal** ("Upgrade to unlock", feature-aware copy) — the locked state, not data.
- **Subscription page** → the four cards render (Starter "Current plan" when free;
  Learner badge "Most popular"; "Start 3-day free trial" on Learner). Prices localize.
- This layer verifies the *surfaces*; the API layer (§Steps) verifies enforcement.

## §8 — Teardown (always)
Run **T1**: cancel all the customer's Stripe subs; delete the user's `subscription`,
`free_credit`, `usage`, `stripe_customer`, `phrase`, `phrase_bundle` rows + the
`e2e+…` auth. Confirm no live Stripe subscription remains for `CUSTOMER`.

## Report
Write `agent-tests/_runs/<UTC>.md`: a PASS/FAIL row per Expect/Exercise bullet with
evidence (RPC status+body, DB row, Stripe object), and a summary line. Any bullet
that can't be evaluated (e.g. real voice audio) is reported as **SKIPPED** with the
reason — never silently passed.
