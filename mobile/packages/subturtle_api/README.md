# subturtle_api

A pure-Dart client for the Subturtle backend. It ports the HTTP protocol of
`@modular-rest/client` and adds typed models and one repository per backend module.

## Protocol (same as the web)

| What | How |
| --- | --- |
| Run a backend function | `POST /function/run` with `{name, args}`. The answer is `{status, data}`. |
| Read or write a collection | `POST /data-provider/find`, `find-one`, `findByIds`, `count`, `insert-one`, `update-one`, `remove-one`. The answer is `{data}`. |
| Token | The raw JWT in the `authorization` header (no `Bearer`). |
| Check a token | `POST /verify/token {token}` returns `{user}`. |
| Errors | Functions: HTTP 400 `{message: "CODE: detail"}`. `ApiException` splits the code (`TIER_LIMIT_REACHED`, `AI_CREDIT_EXHAUSTED`, `VOICE_PAUSED`, `COACH_UNAVAILABLE`) and the feature. |
| Bad token | A 401 or 412 on a request that carried a token calls `RestClient.onUnauthorized`. The app signs out, like the web. |

The server pins `args.userId` / `args.refId` to the token's user, so every
repository sends the signed-in user's id.

## Pieces

- `SubturtleApi`: builds everything from a base URL, a `TokenStore` and an optional `http.Client`.
- `AuthService`: Google access-token sign in, email + password, the code sign-up flow, restore, sign out.
- Repositories: `BoardRepository` (Today + Pool), `ReviewRepository` (Leitner),
  `BundleRepository`, `TranslationRepository`, `ProfileRepository`,
  `SubscriptionRepository`, `LiveSessionRepository` (voice + history), `TextChatRepository`.
- `CoachPractice`: the coach prompt and tools, ported from `frontend/utils/livePractice.ts`.

## Base URLs

`ApiEnvironment.dev` and `ApiEnvironment.prod` are the Cloud Run URLs the web
dashboards use. The dashboard domains also forward the API, but Firebase Hosting
stops those requests after 60 s.

## Tests

`dart test`. The tests use a fake HTTP client (`test/fake_server.dart`); no
network and no real account.
