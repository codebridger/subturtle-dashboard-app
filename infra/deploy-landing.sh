#!/usr/bin/env bash
# Builds the marketing site (landing/) for one environment and deploys it to its own Firebase
# Hosting site, the `landing` target in .firebaserc. Everything is prerendered; NUXT_PUBLIC_* values
# are baked in at build time from infra/public/<env>.env (the Mixpanel project it shares with the
# dashboard) and infra/public/landing-<env>.env (its origins and tags).
# Usage: infra/deploy-landing.sh dev|prod
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"
set -a
# shellcheck source=/dev/null  # infra/public/<env>.env, then infra/public/landing-<env>.env
source "$(dirname "$0")/public/$ENVIRONMENT.env"
# shellcheck source=/dev/null
source "$(dirname "$0")/public/landing-$ENVIRONMENT.env"
# The local film master is a `nuxt dev` convenience only; a deployed build never points at it.
NUXT_PUBLIC_FILM_SRC=
set +a
cd "$(dirname "$0")/../landing"

yarn install --frozen-lockfile
# Live prices from Stripe through the API; falls back to the committed snapshot if it cannot answer.
node scripts/sync-plans.mjs "$API_URL"
# `--dotenv` names a file that does not exist, so a developer's landing/.env.local (localhost origin,
# film path) can never leak into a deployed build: only the values above apply.
npx nuxt typecheck --dotenv .env.deploy
npx nuxt generate --dotenv .env.deploy
node scripts/check-hosting.mjs

cd ..
npx --yes firebase-tools@15 deploy --only hosting:landing --project "$PROJECT_ID" --non-interactive
echo "Deployed the landing page to $NUXT_PUBLIC_SITE_URL"
