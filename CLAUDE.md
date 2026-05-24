# CLAUDE.md

Quick orientation for AI assistants working in this repo. For install / Docker / deploy details see [README.md](README.md).

## Overview

SubTurtle Dashboard App — a language-learning dashboard for SubTurtle (learn-by-subtitle). Monorepo with a Nuxt 3 SPA frontend and a Node + `@modular-rest/server` backend that talk over the modular-rest RPC + data protocol.

| Environment | URL |
| --- | --- |
| Production | <https://dashboard.subturtle.app> |
| Development | <https://dev.dashboard.subturtle.app> |

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

## Commits & versioning

This repo uses **semantic versioning**, and commit titles follow **Conventional Commits** so the type prefix maps to the intended `vMAJOR.MINOR.PATCH` bump. Pick the type by the change's real impact, not by habit:

- `feat:` → **minor** (`0.X.0`) — new user-facing capability
- `fix:` / `perf:` → **patch** (`0.0.X`) — bug fix or performance
- `feat!:` / `fix!:` / a `BREAKING CHANGE:` footer → **major** (`X.0.0`)
- `refactor:` / `chore:` / `docs:` / `test:` / `style:` / `ci:` / `build:` → **no bump**

Don't dress a real feature as `refactor`/`chore` (it would skip a release) or inflate a refactor into `feat` (it over-bumps). If you squash-merge a PR, the **PR title** becomes the commit message, so it must follow the same convention.

> Release automation is **not** wired up in this repo yet (no `semantic-release`, no tags, `server/package.json` is `0.0.0`) — the convention currently records the *intended* bump. The sibling **subturtle-extension-apps** repo enforces the identical mapping automatically via `semantic-release`.

## Gotchas

- **Gemini, not OpenAI**, for new live-session work.
- **SSR is off** — don't reach for server-only Nuxt features (`useFetch` server context, Nitro server routes, etc.).
- **Mongo spans multiple databases** (`user_content`, `subturtle_leitner`, `subturtle_board`, `cms`). Always check [server/src/config.ts](server/src/config.ts) before adding a collection.
- **Live-session audio formats are fixed**: mic input is 16 kHz Int16 PCM via an AudioWorklet (`pcm16-downsampler`); server audio comes back at 24 kHz and is queued as gapless `AudioBufferSourceNode`s. Don't change rates without updating the worklet.
- **Yarn only** — both workspaces ship `yarn.lock`. Mixing `npm install` will desync the lockfile.
- **pilotui `<Button :to="url">` renders a disabled-looking link** — in link mode it emits `<a disabled="false">`, and the `.btn[disabled]` rule fades it (`opacity: 0.6`, `cursor: not-allowed`). For button-styled links, use `@click` with programmatic navigation instead of `:to`.

## Testing

- **Frontend unit/component**: Vitest + `@testing-library/vue` ([frontend/vitest.config.ts](frontend/vitest.config.ts), tests under [frontend/tests/unit/](frontend/tests/unit/)).
- **Frontend e2e**: Playwright across chromium / firefox / webkit / mobile ([frontend/playwright.config.ts](frontend/playwright.config.ts), specs in [frontend/tests/e2e/](frontend/tests/e2e/)).
- **Server**: Jest + ts-jest ([server/jest.config.js](server/jest.config.js), tests colocated as `server/src/modules/*/__tests__/`).
