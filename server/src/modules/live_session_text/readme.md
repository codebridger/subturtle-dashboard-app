# live_session_text

Text-only AI conversation practice. A self-contained sibling of [`live_session`](../live_session)
— it borrows that module's patterns but shares none of its files.

## Why it exists

The Gemini **Live API** (used by `live_session`) is **audio-out only** — it cannot return a
text-only response. This module provides an equivalent text conversation (same function-calling
behaviour, full token accounting) over the standard `generateContent` API.

## Design: server-held state

The browser cannot hold the `GEMINI_API_KEY`, and ephemeral tokens are Live-API-only, so every
turn is proxied through the server. The **server owns the authoritative session state** in Mongo
(system prompt, tool declarations, the Gemini `contents[]` history, cumulative usage). The client
sends only `{ sessionId, input }`, keeps a *display* transcript, and runs the tool *handlers*
(pure UI effects — they live on the client because they manipulate the practice screen).

```
client ──{sessionId, input}──▶  text-turn
                                  load session ◀─ Mongo (live_session_text)
                                  append input → generateContent → bill usage → save
                                ◀── { text }  OR  { functionCalls }   (pending tools)
client runs tool handlers, then ──{sessionId, toolResults}──▶ text-turn …loops until { text }
```

Because the tool handlers run on the client, a model function-call round-trips: the server
returns the pending call(s), the client executes the handler(s) and posts the results back, and
the server resumes the same turn. The in-progress function-call turn is persisted between the two
calls so the continuation is coherent.

## Functions (`functions.ts`)

| Function | Purpose |
| --- | --- |
| `create-text-session` | Gate AI credits (`checkCreditAllocation`, `minCredits: 1`), then persist a fresh record `{ model, instructions, toolDeclarations, contents: [], dialogs: [], usage }`. Returns `{ sessionId, model }`. **Does not** consume a freemium live-session slot. |
| `text-turn` | Load the session, append the `input`, call `generateContent`, bill the turn, persist, and return either the model's `text` (`done: true`) or its pending `functionCalls` (`done: false`). |

`text-turn` input shapes (`TextTurnInput`):
- `{ kind: 'user', text }` — a real user message (added to the display transcript).
- `{ kind: 'system', text }` — a system nudge (welcome / card-switch); drives a turn but isn't shown.
- `{ kind: 'toolResults', results: [{ id?, name, output }] }` — outcome of client tool handlers, sent
  back as Gemini `functionResponse` parts so the model can finish the turn.

`Content.role` in `@google/genai` is only `user`/`model`, so the model's call turn is stored as
`{ role: 'model', parts: [{ functionCall }] }` and tool results as
`{ role: 'user', parts: [{ functionResponse }] }`.

## Data model (`db.ts`, `types.ts`)

Collection `live_session_text` (name in [`server/src/config.ts`](../../config.ts)). Notable fields:
- `contents` — the Gemini history (model's source of truth).
- `dialogs` — human-readable transcript rows for the UI/history.
- `model` lives under `session.model` (a top-level `model` path would shadow Mongoose's `doc.model()`).
- `cost` virtual → `extractTextCostCalculationInput(usage, session.model)`.
- 6-month TTL on `createdAt`; `user_access` permission scoped to `refId`.

## Token tracking & pricing (`utils.ts`, `config.ts`)

Each `text-turn` maps the response `usageMetadata` (`mapUsage`) and calls `recordUsage` so credits
are deducted **server-side** (authoritative — unlike the audio path, which trusts browser-reported
usage). Pricing is **model-aware**: `TEXT_PRICES_PER_M` in `config.ts` is keyed by model id with a
`DEFAULT` fallback. The model is a parameter (default `gemini-2.5-flash-lite`).

> ⚠️ The per-million USD rates in `config.ts` are published rates to **confirm against current
> Gemini pricing** before relying on the billing numbers.

## Frontend touchpoints

- Store [`frontend/stores/liveSessionGeminiText.ts`](../../../../frontend/stores/liveSessionGeminiText.ts)
  — thin client mirroring the voice store's public surface; drives the function-call loop.
- `mode: 'voice' | 'text'` on `LiveSessionRequest`; a Voice/Text toggle in `StartLiveSessionForm`.
- **Page routing** — `pages/practice/live-session.vue` is a **dispatcher**: it resolves the request
  into the `livePracticeSetup` store and redirects to a dedicated page by mode:
  `live-session-voice.vue` (audio) or `live-session-text.vue` (composer-only). The shared system
  prompt + tool definitions live once in [`frontend/utils/livePractice.ts`](../../../../frontend/utils/livePractice.ts)
  so the two transports can't drift.
- **Request shape** — `LiveSessionRequest.source` is just `{ phraseIds }`. Phrase *selection*
  (range/random over a bundle) is resolved at the entry point (the bundle page, or the extension's
  "Practice now"), so the setup store's resolution is a single `findByIds`. This also keeps a random
  selection stable across refresh.
- Session history (`pages/sessions/*`) merges this collection and falls back to it on the detail page.
