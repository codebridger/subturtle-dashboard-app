# infra — Firebase / Google Cloud deployment

One Google Cloud (Firebase) project per environment: `subturtle-dev` and `subturtle-prod`.
Every script takes the environment as its first argument, is safe to re-run, and reads its
settings from [env.sh](env.sh).

| Piece | Resource |
| --- | --- |
| Dashboard (SPA) | Firebase Hosting → `https://<project>.web.app` |
| API | Cloud Run `subturtle-api`, `europe-west4`, scales to zero |
| Database | Firestore Enterprise with MongoDB compatibility, database `subturtle` |
| Scheduled jobs | Cloud Scheduler `schedule-tick` → `POST /schedule/tick` every 5 min (OIDC) |
| Secrets | Secret Manager, mounted as env vars on the Cloud Run service |
| CI deploys | `.github/workflows/deploy-*.yml` via Workload Identity Federation (no key files) |

The SPA calls the Cloud Run URL directly (`NUXT_PUBLIC_BASE_URL_API`, baked in at build
time): Hosting rewrites cap requests at 60 s. [firebase.json](../firebase.json) still
rewrites the API route prefixes to Cloud Run, for clients that address the API through the
dashboard's domain — the published extension calls `https://dashboard.subturtle.app/...`,
and the live Stripe webhook points there. That lets the custom domain move to Hosting
without an extension release or a webhook change.

## Order

Console-only prerequisites (billing account, the two projects, OAuth consent screen and
clients, the Gemini and Text-to-Speech API keys) come first. Then:

1. `infra/bootstrap.sh dev` — APIs, Artifact Registry, service accounts, GitHub WIF.
2. `infra/firestore.sh dev` — database + SCRAM user; writes `mongo-base-address`.
3. **Go/no-go spike** — stop and re-plan if it reports NO-GO:
   ```bash
   cd server && MONGO_BASE_ADDRESS="$(gcloud secrets versions access latest --secret mongo-base-address --project subturtle-dev)" yarn spike:firestore
   ```
4. Secrets — `infra/api-keys.sh dev` creates the Gemini and Text-to-Speech keys.
   `infra/import-legacy-secrets.sh dev` copies what the old deployment already
   has (JWT keypair, admin, Stripe, OpenRouter, Mixpanel, old OAuth client IDs) straight
   from its Secret Manager. `infra/secrets.sh dev` prompts, with hidden input, for anything
   still missing; multi-line values can be piped: `<command> | infra/secrets.sh dev NAME`.
5. `infra/deploy-api.sh dev` — needs Docker with buildx.
6. `infra/deploy-hosting.sh dev` — public build values come from [public/](public/).
7. `infra/scheduler.sh dev`.
8. Point the outside world at the new URLs (both printed by the scripts):
   - OAuth **web** client, authorized redirect URIs: `<API_URL>/auth/google/code-login` for
     dashboard login, and `https://<extension-id>.chromiumapp.org/` because the extension
     signs in through `launchWebAuthFlow` with the web client.
   - Stripe webhook endpoint: `<API_URL>/gateway/webhook/stripe`, and its signing secret in
     `stripe-webhook-secret`.
9. GitHub: on environment `dev`, set the two variables `bootstrap.sh` printed, and add
   `dev` to the repository variable `DEPLOY_ENVIRONMENTS`. Pushes to `dev` then deploy
   automatically.

Both environments are already through this list. Deploys now run from GitHub Actions —
a push to `dev` deploys `subturtle-dev`, a push to `main` deploys `subturtle-prod`, both
running the scripts above (see the CI/CD section of [CLAUDE.md](../CLAUDE.md)). Running a
script by hand still works and takes the same path; it is the way to deploy a branch that
is not `dev` or `main`.

The Cloud Build triggers in the old `learn-by-subtitle` project that used to build from
`dev` and `main` are **disabled**, not deleted — they deploy the pre-Firebase stack, which
is the rollback path until it is decommissioned.

## Secrets

| Secret | Env var | Notes |
| --- | --- | --- |
| `mongo-base-address` | `MONGO_BASE_ADDRESS` | Written by `firestore.sh` |
| `jwt-private-key`, `jwt-public-key` | `PRIVATE_KEY`, `PUBLIC_KEY` | Prod must reuse the current pair, or every user is signed out |
| `admin-email`, `admin-password` | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The server refuses to start without them |
| `google-oauth-client-id`, `google-oauth-client-secret` | `GOOGLE_OAUTH_CLIENT_ID`, `…_SECRET` | Web client |
| `google-oauth-client-id-extension` | `GOOGLE_OAUTH_CLIENT_ID_EXTENSION` | Optional. Comma-separated extra accepted clients (old + new during the migration) |
| `stripe-secret-key`, `stripe-webhook-secret` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Test mode in dev, live in prod |
| `gemini-api-key`, `gcp-api-key` | `GEMINI_API_KEY`, `GCP_API_KEY` | Created in the project (Phase 2) |
| `openrouter-api-key` | `OPENROUTER_API_KEY` | |
| `openai-api-key`, `mixpanel-token` | `OPENAI_API_KEY`, `MIXPANEL_TOKEN` | Optional |

`deploy-api.sh` refuses to deploy while a required secret has no version.

## Firestore behaviour to keep in mind

- **A conditional `findOneAndUpdate` is not atomic under concurrency**: several concurrent
  callers can get the same document back. A conditional `updateOne` is applied exactly
  once, so claims and guards must use `updateOne` and read `modifiedCount`
  (`ScheduleService.runDueJobs` does). `$inc`, `$push` and `$ne`-guarded updates under
  concurrency lose nothing (verified by the spike).
- **Index builds are long-running.** The first `createIndexes` for an index can outlast the
  45 s socket timeout; the build still completes, and later boots find the index in
  place. The SCRAM user needs `roles/datastore.indexAdmin` for Mongoose to create indexes
  at all (`firestore.sh` grants it, limited to the database).

## Production data (cutover)

Production today keeps each logical database separately (`subturtle_cms`,
`subturtle_user_content`); on Firestore they share the database `subturtle`. Collection
names do not collide, so a restore only renames the namespace:

```bash
mongodump --uri "$OLD_URI" --db subturtle_cms --out dump
mongodump --uri "$OLD_URI" --db subturtle_user_content --out dump
mongorestore --uri "$NEW_URI" --nsFrom 'subturtle_cms.*' --nsTo 'subturtle.*' dump
mongorestore --uri "$NEW_URI" --nsFrom 'subturtle_user_content.*' --nsTo 'subturtle.*' dump
```

Rehearse first and compare document counts per collection. Scheduled jobs restored from
the old database get a `nextRunAt` at the API's first boot
(`server/src/modules/schedule/service.ts`).
