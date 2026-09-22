#!/usr/bin/env bash
# Builds the dashboard for one environment and deploys it to Firebase Hosting
# (https://<project>.web.app). NUXT_PUBLIC_* values are baked in at build time, so every
# environment gets its own build. The API URL is derived; the other public values come
# from the environment (GitHub environment variables in CI):
#   NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, NUXT_PUBLIC_MIXPANEL_PROJECT_TOKEN,
#   NUXT_PUBLIC_MIXPANEL_API_HOST, NUXT_PUBLIC_CHROME_WEB_STORE_URL
# Usage: infra/deploy-hosting.sh dev|prod
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"
cd "$(dirname "$0")/../frontend"

NUXT_PUBLIC_MODE=development
if [[ $ENVIRONMENT == prod ]]; then NUXT_PUBLIC_MODE=production; fi
export NUXT_PUBLIC_MODE NUXT_PUBLIC_BASE_URL_API=$API_URL

yarn install --frozen-lockfile
yarn generate

cd ..
npx --yes firebase-tools@15 deploy --only hosting --project "$PROJECT_ID" --non-interactive
echo "Deployed the dashboard to $DASHBOARD_URL"
