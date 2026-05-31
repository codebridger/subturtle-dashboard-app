# Capability matrix — features × tiers

The **assertion source of truth** for the subscription E2E. Each row is a gated
capability; the cells are the expected, *enforced* behaviour per tier. The agent
asserts the runtime behaviour matches this table.

> **Single source of truth:** the PAID columns are ultimately defined by **Stripe
> product metadata** (entitlements) + the **GBP prices**, and the FREE column by
> `server/src/config.ts` (`FREEMIUM_DEFAULT_*`). A robust run should READ the paid
> values from Stripe (`getSubscriptionPlans` for prices; product metadata for caps)
> and assert enforcement matches — rather than trusting the literals below, which
> are a convenience snapshot and can drift if Stripe is edited.

## Tiers & prices (GBP base; Adaptive Pricing localizes at checkout)

| Tier | monthly | annual | trial | Stripe product? |
| --- | --- | --- | --- | --- |
| Starter (free) | — | — | — | no (code: `STARTER_TIER`) |
| Reader | £4.49 | £42.99 | — | yes |
| Learner | £10.99 | £104.99 | 3 days | yes (highlight, "Most popular") |
| Coach | £24.99 | £239.99 | — | yes |

## Enforced capabilities

| Capability | Starter (free) | Reader | Learner | Coach | Where enforced (RPC) | Block signal |
| --- | --- | --- | --- | --- | --- | --- |
| **save_words** | 200 / window | ∞ | ∞ | ∞ | `createPhrase` | HTTP 400 `TIER_LIMIT_REACHED: "save_words"` |
| **weekly_insights** | 🔒 locked | 🔒 locked | ✅ unlocked | ✅ unlocked | `getUserStatistic`, `generateChartDataForInsertionRatio` | 400 `TIER_LIMIT_REACHED: "weekly_insights"` |
| **session_history** | 🔒 locked | 🔒 locked | ✅ full | ✅ full | `list-live-sessions` | 400 `TIER_LIMIT_REACHED: "session_history"` |
| **live_sessions (count)** | 3 / window | ∞ | ∞ | ∞ | `request-gemini-live-session-ephemeral-token` (freemium only) | 400 `TIER_LIMIT_REACHED: "live_sessions"` |
| **voice_minutes** | 5 | **0** | 90 | 300 | same token RPC (pre-check) + `debit-voice-minutes` | 400 `TIER_LIMIT_REACHED: "voice_minutes"` |
| **AI credits** | 5,000,000 | 200,000,000 | 300,000,000 | 600,000,000 | any AI path via `checkCreditAllocation` | 400 `AI_CREDIT_EXHAUSTED: …` |
| smart_review | ∞ | ∞ | ∞ | ∞ | (never gated) | — |

Notes:
- **voice_minutes**: Reader is text-only (granted **0**) → a voice session is
  blocked immediately. Free gets a 5-minute taste; Learner/Coach get 90/300. The
  budget lives on the active subscription (paid) or `free_credits` (free), and is
  debited (rounded up to whole minutes) by `debit-voice-minutes` on session end.
- **live_sessions count** is enforced for **freemium users only** (paid tiers are
  not count-gated — only their credit + voice budgets apply).
- The **headline "limited → unlimited" story** to demonstrate: `save_words`
  (200 → ∞ from Reader up), `weekly_insights` + `session_history` (locked → unlocked
  at Learner), and `voice_minutes` (0 on Reader → 90/300 on Learner/Coach).

## What each tier transition should grant (webhook snapshot)

After `customer.subscription.created` / `.updated`, the `subscription` doc for the
user should carry an `entitlements` snapshot + budgets matching the tier:

| Tier | `tier` | `total_credits` | `voice_minutes_total` | `entitlements.weeklyInsights` / `sessionHistory` |
| --- | --- | --- | --- | --- |
| Reader | `reader` | 200000000 | 0 | false / false |
| Learner | `learner` | 300000000 | 90 | true / true |
| Coach | `coach` | 600000000 | 300 | true / true |

Cancel (`customer.subscription.deleted`) → the active subscription is removed/expired
→ the user reverts to **Starter** (freemium caps reapply).
