# CLAUDE.md

Quick orientation for AI assistants working in this repo. For install / Docker / deploy details see [README.md](README.md).

## Overview

SubTurtle Dashboard App — a language-learning dashboard for SubTurtle (learn-by-subtitle). Monorepo with a Nuxt 3 SPA frontend and a Node + `@modular-rest/server` backend that talk over the modular-rest RPC + data protocol.

| Environment | URL |
| --- | --- |
| Production | <https://dashboard.subturtle.app> |
| Development | <https://dev.dashboard.subturtle.app> |

## Sibling repositories

SubTurtle spans several repos. Two siblings interact directly with this dashboard and often have to be touched to develop or test a dashboard change end to end:

| Repo | Purpose | GitHub | Typical local path |
| --- | --- | --- | --- |
| **subturtle-extension-apps** | Browser extension — the learn-by-subtitle capture surface. Talks to the same `@modular-rest` backend protocol, and enforces the identical Conventional-Commits → semver mapping (via `semantic-release`). | <https://github.com/codebridger/subturtle-extension-apps> | `../subturtle-extension-apps` |
| **pilotui** | In-house Vue 3 + Tailwind component library — the `pilotui` npm dependency the frontend consumes (`CL`-prefixed components). LLM docs: <https://codebridger.github.io/lib-vue-components/llm.md> | <https://github.com/codebridger/pilotui> | `../../lib-vue-components` |

### Working across siblings

When a dashboard task depends on, or breaks, a sibling — e.g. a backend RPC the extension also calls, or a `pilotui` component that needs a fix before the dashboard can consume it — pull the sibling in locally so you can build and test the dashboard branch against it:

1. **Search locally first.** The siblings are usually already cloned next to this repo (see *Typical local path* above — the extension is a direct sibling; `pilotui` is checked out as `lib-vue-components`, whose `package.json` name is `pilotui`). Check those paths before cloning.
2. **Clone (download) it if missing.** `git clone <GitHub URL>` into a sibling directory, then `yarn install`.
3. **Branch the sibling — never mutate its main line.** To exercise the cross-repo change, create a feature branch on the sibling using the same `CU-<taskId>_…` convention as [Branching](#branching), make your edits there, and run it locally (`yarn dev` / `yarn build`; for `pilotui`, build and `yarn link` it into `frontend/`). This lets you verify the dashboard's main branch work against the live sibling. **Keep dashboard-driven, experimental changes on the sibling's feature branch** — don't commit them onto the sibling's `dev`/`main`; only land them through that sibling's own PR flow if they're genuinely intended.

## Repo layout

```
subturtle-dashboard-app/
├── frontend/                 # Nuxt 3 SPA (Vue 3, Pinia, Tailwind, pilotui)
│   ├── pages/                # File-based routes (auth, bundles, practice, sessions, settings)
│   ├── components/           # Feature-grouped Vue components
│   ├── stores/               # Pinia stores (profile, bundle, leitner, liveSession{Gemini,Openai})
│   ├── composables/          # Reusable composition API logic
│   ├── plugins/              # Nuxt plugins (modular-rest, component-library, mixpanel, popper)
│   ├── middleware/           # Route guards (auth)
│   ├── layouts/              # default / auth / blank / spotlight
│   ├── locales/              # i18n JSON (en only)
│   ├── utils/, types/, assets/, public/, tests/
│   └── nuxt.config.ts, tailwind.config.cjs, vitest.config.ts, playwright.config.ts
├── server/                   # Node + TS modular-rest backend
│   └── src/
│       ├── index.ts          # Server entry (modular-rest setup)
│       ├── config.ts         # Database + collection names
│       ├── permissions.ts    # Access control groups
│       ├── triggers.ts       # Cross-module event hooks
│       └── modules/          # Feature modules (see Architecture)
├── docker-compose.yml
└── Dockerfile
```

## Commands

**Yarn is required** (both workspaces have `yarn.lock`). Run from inside each workspace.

### `frontend/`

| Command | What it does |
| --- | --- |
| `yarn dev` | Nuxt dev server with `--inspect` |
| `yarn build` | Production build |
| `yarn generate` | Static site generation |
| `yarn preview` | Preview production build |
| `yarn test` | Vitest (run mode) |
| `yarn test:unit` / `yarn test:unit:watch` | Unit tests |
| `yarn test:e2e` / `yarn test:e2e:ui` | Playwright e2e |
| `yarn test:coverage` | Coverage report |
| `yarn format` / `yarn format:check` | Prettier |

### `server/`

| Command | What it does |
| --- | --- |
| `yarn dev` | Build + `ts-node src/index.ts` |
| `yarn build` | `tsc` |
| `yarn start` | Run compiled `dist/index.js` |
| `yarn test` / `yarn test:watch` / `yarn test:coverage` | Jest |

## Tech stack

**Frontend** — Nuxt 3 (SSR **off**, hash routing), Vue 3, Pinia, Tailwind CSS, **pilotui** (in-house Vue 3 + Tailwind component library), vee-validate + yup, `@modular-rest/client`, `@google/genai` (Gemini Live API), Mixpanel, `@nuxtjs/i18n`, Iconify (`solar:` + `clarity:`), ApexCharts, Vitest, Playwright.

**Server** — Node + TypeScript, `@modular-rest/server` (the RPC/data framework), MongoDB, Stripe, `@google/genai`, `@google-cloud/text-to-speech`, Jest.

## Architecture

### Frontend

- File-based routing in [frontend/pages/](frontend/pages/). SSR is disabled — pure SPA with hash routing, so don't reach for server-only Nuxt features.
- State lives in [frontend/stores/](frontend/stores/) as Pinia stores (composition style): `profile.ts`, `bundle.ts`, `leitner.ts`, `liveSessionGemini.ts`, `liveSessionOpenai.ts`, plus app-level state in `index.ts`.
- The API client (`@modular-rest/client`) is bootstrapped in [frontend/plugins/modular-rest.ts](frontend/plugins/modular-rest.ts). It exposes `dataProvider` (CRUD), `functionProvider` (RPC), and `authentication`. Base URL: `NUXT_PUBLIC_BASE_URL_API`.
- Auth: JWT in localStorage; `401`/`412` responses force re-login. Route protection in [frontend/middleware/auth.ts](frontend/middleware/auth.ts).
- Pilotui components are registered globally in [frontend/plugins/component-library.ts](frontend/plugins/component-library.ts).

### Server (modular-rest)

Each feature lives under [server/src/modules/](server/src/modules/) and typically contains:

- `db.ts` — Mongo schema + collection registration
- `functions.ts` — RPC endpoints callable from the frontend via `functionProvider`
- `service.ts` — business logic (present in larger modules: `board`, `leitner_box`, `subscription`; simpler ones like `phrase_bundle` skip it)
- Sometimes also `router.ts` (e.g. `auth`), `triggers.ts`, `events.ts`, `types.ts`, `__tests__/`

Modules are discovered dynamically by the modular-rest framework. Entry point: [server/src/index.ts](server/src/index.ts). Mongo collection names and database names are centralized in [server/src/config.ts](server/src/config.ts) — **always add new collections there**, not inline.

#### Modules (under [server/src/modules/](server/src/modules/))

| Module | Purpose |
| --- | --- |
| [`auth/`](server/src/modules/auth/) | Authentication — login, token exchange, password flows (router-based) |
| [`board/`](server/src/modules/board/) | User activity board / dashboard data (activity logs in the `subturtle_board` DB) |
| [`gateway/`](server/src/modules/gateway/) | Payment gateway integration (Stripe webhooks, checkout sessions) |
| [`leitner_box/`](server/src/modules/leitner_box/) | Spaced-repetition engine (5 boxes, daily quotas, review scheduling) |
| [`live_session/`](server/src/modules/live_session/) | Live AI conversation practice — splits into `gemini/` (primary) and `openai/` (legacy); shared `types.ts` and `db.ts` |
| [`phrase_bundle/`](server/src/modules/phrase_bundle/) | Phrase + bundle content management (normal vs linguistic phrase variants, triggers) |
| [`profile/`](server/src/modules/profile/) | User profile data, preferences, onboarding state |
| [`schedule/`](server/src/modules/schedule/) | Scheduled jobs — daily bundle generation, recurring tasks (uses `cms` DB) |
| [`statistic/`](server/src/modules/statistic/) | Analytics + usage statistics aggregation |
| [`subscription/`](server/src/modules/subscription/) | Freemium tier limits, token-based usage accounting, Stripe subscription state — see its [readme.md](server/src/modules/subscription/readme.md) and [module_diagram.md](server/src/modules/subscription/module_diagram.md) |
| [`translation/`](server/src/modules/translation/) | Translation service (phrase translation + Google TTS audio generation) |

## Domain concepts

- **Phrase / Bundle** — vocabulary items grouped into bundles. A phrase is either `normal` (basic translation) or `linguistic` (carries phonetics, formality, examples). See [server/src/modules/phrase_bundle/](server/src/modules/phrase_bundle/) and [frontend/stores/bundle.ts](frontend/stores/bundle.ts).
- **Leitner Box** — 5-box spaced-repetition system. Intervals: 1, 2, 4, 8, 16 days. Daily caps: 20, 10, 5, 5, 5. See [server/src/modules/leitner_box/](server/src/modules/leitner_box/) and [leitner-box-clarification.md](leitner-box-clarification.md).
- **Live Session** — real-time AI conversation practice with two providers:
  - **Gemini Live API is the primary provider** (`@google/genai`, ephemeral server-issued tokens, 15-minute cap with auto-reconnect via session resumption handle). State in [frontend/stores/liveSessionGemini.ts](frontend/stores/liveSessionGemini.ts); server in [server/src/modules/live_session/gemini/](server/src/modules/live_session/gemini/).
  - **OpenAI Realtime is legacy** — kept for compatibility; do not add new features here. State in [frontend/stores/liveSessionOpenai.ts](frontend/stores/liveSessionOpenai.ts).
  - Session metadata: AI character, phrase selection mode (`selection` / `random`), phrase range, optional `nativeLanguage` for explanations.
- **Subscription** — freemium with token-based usage. Free tier: 5M credits / 50 saved words / 3 live sessions. Stripe for paid. See [server/src/modules/subscription/](server/src/modules/subscription/) and [frontend/stores/profile.ts](frontend/stores/profile.ts).

## Conventions

- **Prettier**: `printWidth: 160`, `singleQuote: true` ([frontend/.prettierrc](frontend/.prettierrc)). Run `yarn format` before committing.
- **ESLint** + Vue/TS rules ([frontend/.eslintrc.js](frontend/.eslintrc.js)).
- **Tailwind**: class-based dark mode. Primary `#4361ee`, secondary `#805dca`. Iconify selectors available with `solar:` and `clarity:` prefixes.
- **i18n**: strings in [frontend/locales/en.json](frontend/locales/en.json) — only English is wired up today.
- **UI components**: prefer **pilotui** (in-house Vue 3 + Tailwind library) before hand-rolling. Components are organized by category path (`pilotui/elements`, `pilotui/form`, `pilotui/shell`, etc.), use the `CL` prefix (e.g. `<CLButton>`), and require wrapping the app in `AppRoot` for theming. Registered in [frontend/plugins/component-library.ts](frontend/plugins/component-library.ts). **LLM-friendly docs**: <https://codebridger.github.io/lib-vue-components/llm.md> — fetch when adding or editing UI to see component APIs.

## Branching

**Every task gets its own feature branch — never commit task work directly to `dev` or `main`.** Follow the ClickUp branch convention used across the repo:

```
CU-<taskId>_<Short-Task-Title-Dashed>_<Author-Name>
```

e.g. `CU-86ext1gpf_Make-subscription-tiers-Stripe-metadata-driven-adaptive-pricing-Council-004-rollout_Navid-Shad`. The `<taskId>` is the ClickUp custom id (the `CU-…` shown on the task), the title is the task name with spaces → dashes, and the author is the assignee.

- Branch off the latest `dev`; open a **PR into `dev`**. `dev` reaches `main` via the long-running `dev → main` PR — so a task only needs the one PR into `dev`.
- **Footgun:** if you create the branch with `git switch -c <branch> origin/dev`, Git sets its upstream to `origin/dev`, and a plain `git push` (or a Git-client "sync") then lands the commits **straight on `dev`** instead of a new remote branch. Create it without that tracking and publish it explicitly: `git switch -c <branch>` then `git push -u origin <branch>` (or `--no-track` when branching off `origin/dev`).

## Commits & versioning

This repo uses **semantic versioning**, and commit titles follow **Conventional Commits** so the type prefix maps to the intended `vMAJOR.MINOR.PATCH` bump. Pick the type by the change's real impact, not by habit:

- `feat:` → **minor** (`0.X.0`) — new user-facing capability
- `fix:` / `perf:` → **patch** (`0.0.X`) — bug fix or performance
- `feat!:` / `fix!:` / a `BREAKING CHANGE:` footer → **major** (`X.0.0`)
- `refactor:` / `chore:` / `docs:` / `test:` / `style:` / `ci:` / `build:` → **no bump**

Don't dress a real feature as `refactor`/`chore` (it would skip a release) or inflate a refactor into `feat` (it over-bumps). If you squash-merge a PR, the **PR title** becomes the commit message, so it must follow the same convention.

**Link the ClickUp task:** when the work has a task id, append it as `#<taskId>` to the commit subject — and to the **PR title** so it survives a squash-merge — e.g. `feat: show dashboard version in a global footer #86exqazkq`. Use the bare id (not the `CU-` branch prefix). The type prefix still drives the version bump; the `#<taskId>` just keeps `git log` greppable and linkable back to ClickUp.

> Release automation is wired up for the **frontend** via `semantic-release` ([frontend/release.config.cjs](frontend/release.config.cjs), [.github/workflows/release.yml](.github/workflows/release.yml)) — it owns the version in [frontend/package.json](frontend/package.json) and cuts a tagged release on pushes to `dev`/`main` that contain releasable commits. The **server** has no release pipeline yet (`server/package.json` stays `0.0.0`). The sibling **subturtle-extension-apps** repo enforces the identical mapping via its own `semantic-release` setup.

## Gotchas

- **Gemini, not OpenAI**, for new live-session work.
- **SSR is off** — don't reach for server-only Nuxt features (`useFetch` server context, Nitro server routes, etc.).
- **Mongo spans multiple databases** (`user_content`, `subturtle_leitner`, `subturtle_board`, `cms`). Always check [server/src/config.ts](server/src/config.ts) before adding a collection.
- **Live-session audio formats are fixed**: mic input is 16 kHz Int16 PCM via an AudioWorklet (`pcm16-downsampler`); server audio comes back at 24 kHz and is queued as gapless `AudioBufferSourceNode`s. Don't change rates without updating the worklet.
- **Yarn only** — both workspaces ship `yarn.lock`. Mixing `npm install` will desync the lockfile.
- **pilotui `<Button :to="url">` renders a disabled-looking link** — in link mode it emits `<a disabled="false">`, and the `.btn[disabled]` rule fades it (`opacity: 0.6`, `cursor: not-allowed`). For button-styled links, use `@click` with programmatic navigation instead of `:to`.

## Verifying changes in the browser

The UI only logs in via **Google OAuth**, which an automated agent can't drive. To validate a change in a real browser, mint a JWT over the API and inject it into the SPA's `localStorage["token"]` — the `auth` middleware ([frontend/middleware/auth.ts](frontend/middleware/auth.ts)) then validates it via `POST /verify/token` exactly as it would a Google-issued token, so the app is fully "logged in" with **no frontend changes**.

### Driving the browser

A Playwright MCP is committed in [.mcp.json](.mcp.json) (`@playwright/mcp`, headless) — the web-app analog of the extension repo's `chrome-extension-tester-mcp`. It loads at Claude Code startup and exposes `browser_navigate`, `browser_evaluate` (the localStorage injection), `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`. (The IDE's built-in preview tools are Playwright-backed too and drive the same loop for quick local checks.)

### Two no-OAuth users

> **Validate with the standard-user token by default.** Reach for the admin token *only* when you're intentionally exercising admin/elevated behavior — the admin is a privileged `administrator` account, not a representative user, so its freemium/tier behavior isn't guaranteed to match a real user's (it may be treated specially now or in the future).

| User | How | Use for |
| --- | --- | --- |
| **Standard** *(default)* | `cd server && node scripts/create-standard-user.mjs` — runs the register→login flow (dev code `123456`), prints `{ email, password, token, userId }`. | Normal development — the real freemium experience |
| **Admin** *(only when intended)* | Auto-provisioned on server boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env` (the framework's `createRest({ adminUser })`, loginable as `type:'user'`); fetch its token with `node scripts/agent-token.mjs`. | Admin/elevated flows you specifically want to test |

### The loop

```bash
# 1. Server on node 18 (node 22 breaks the Mongoose 5 handshake); frontend on node 22.
cd server && yarn build && nvm exec 18 node dist/index.js   # :8080  (auto-provisions the admin)
cd frontend && yarn dev                                      # :3000

# 2. Mint a token. DEFAULT: a standard (freemium) user — test with this token
#    unless you specifically need admin behavior.
cd server && node scripts/create-standard-user.mjs   # -> { email, password, token, userId }
#    Admin token (only when admin/elevated behavior is intentionally under test):
cd server && node scripts/agent-token.mjs            # -> raw admin JWT on stdout
cd server && node scripts/agent-token.mjs --inject   # -> localStorage.setItem('token', '<jwt>')
```

```
# 3. In the Playwright MCP (or the preview tools):
browser_navigate  http://localhost:3000                     # redirects to /auth/login (no token yet)
browser_evaluate  localStorage.setItem('token', '<jwt>')    # localStorage is per-origin — navigate FIRST
browser_navigate  http://localhost:3000                     # reload -> middleware validates -> dashboard
browser_take_screenshot
```

`agent-token.mjs` defaults to the admin creds and tries a plaintext password first, falling back to base64 (an older server build wanted it pre-encoded). For deeper API-level subscription/freemium flows, see [agent-tests/](agent-tests/) — its [_helpers.md](agent-tests/subscription/_helpers.md) P1 is the same register recipe these scripts encode.

## Testing

- **Frontend unit/component**: Vitest + `@testing-library/vue` ([frontend/vitest.config.ts](frontend/vitest.config.ts), tests under [frontend/tests/unit/](frontend/tests/unit/)).
- **Frontend e2e**: Playwright across chromium / firefox / webkit / mobile ([frontend/playwright.config.ts](frontend/playwright.config.ts), specs in [frontend/tests/e2e/](frontend/tests/e2e/)).
- **Server**: Jest + ts-jest ([server/jest.config.js](server/jest.config.js), tests colocated as `server/src/modules/*/__tests__/`).
- **Agent E2E** ([agent-tests/](agent-tests/)): Markdown runbooks executed by an AI agent (not Jest/Playwright) against real Stripe **test mode** + a live server — for async, stateful, semantic flows like the subscription tier ladder. Start at [agent-tests/README.md](agent-tests/README.md) (the runner contract: preconditions, provisioning, await-grant, teardown, report), then run a `*.spec.md` (e.g. [agent-tests/subscription/tier-ladder.spec.md](agent-tests/subscription/tier-ladder.spec.md)). Requires `stripe listen` forwarding to `/gateway/webhook/stripe`. Run reports land in `agent-tests/_runs/` (gitignored).
