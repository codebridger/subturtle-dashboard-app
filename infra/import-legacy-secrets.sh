#!/usr/bin/env bash
# One-time copy of the values the API needs from the old deployment into this
# environment's Secret Manager. The old Cloud Build trigger writes server/.env from the
# secret `dashboard-app` (prod) / `dashboard-app-dev` (dev) in the navidshad project
# `learn-by-subtitle`; this reads the version that trigger deploys, parses it as a dotenv
# file and pipes each value straight into secrets.sh. Nothing is printed or written to disk.
#
# Not copied, because the new stack gets new ones: the Mongo address (Firestore), the web
# OAuth client and its secret, and the Gemini / Text-to-Speech API keys. The old web and
# extension OAuth client IDs go into google-oauth-client-id-extension, so installed
# extensions keep signing in until they ship the new client.
#
# Usage: infra/import-legacy-secrets.sh dev|prod   (LEGACY_ACCOUNT overrides the old account)
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"
cd "$(dirname "$0")/.."

LEGACY_PROJECT=learn-by-subtitle
LEGACY_ACCOUNT=${LEGACY_ACCOUNT:-navidshad72@gmail.com}
if [[ $ENVIRONMENT == prod ]]; then
  LEGACY_SECRET=dashboard-app
  LEGACY_TRIGGER=prod-subturtle-dashboard-app-europe-west4-codebridger-subcgz
else
  LEGACY_SECRET=dashboard-app-dev
  LEGACY_TRIGGER=dev-subturtle-dashboard-app-europe-west4-codebridgermkf
fi

legacy() { gcloud --project "$LEGACY_PROJECT" --account "$LEGACY_ACCOUNT" "$@"; }
VERSION=$(legacy builds triggers describe "$LEGACY_TRIGGER" --region global --format 'value(substitutions._BE_ENV_REVISION)' 2>/dev/null || true)
VERSION=${VERSION:-latest}
LEGACY_ENV=$(legacy secrets versions access "$VERSION" --secret "$LEGACY_SECRET")
echo "Reading $LEGACY_SECRET version $VERSION from $LEGACY_PROJECT."

# Prints the value of one key of the legacy .env to stdout; exits 3 when it is absent.
value_of() {
  printf '%s' "$LEGACY_ENV" | (cd server && node -e '
    const value = require("dotenv").parse(require("fs").readFileSync(0))[process.argv[1]];
    if (value === undefined || value === "") process.exit(3);
    process.stdout.write(value);
  ' "$1")
}

copy() { # copy KEY SECRET [optional]
  if value_of "$1" >/dev/null; then
    value_of "$1" | infra/secrets.sh "$ENVIRONMENT" "$2" >/dev/null
    echo "  $1 -> $2"
  elif [[ ${3:-} == optional ]]; then
    echo "  $1: not in the legacy .env (optional, skipped)"
  else
    echo "  $1: MISSING from the legacy .env" >&2
    MISSING=1
  fi
}

MISSING=
copy PRIVATE_KEY jwt-private-key
copy PUBLIC_KEY jwt-public-key
copy ADMIN_EMAIL admin-email
copy ADMIN_PASSWORD admin-password
copy STRIPE_SECRET_KEY stripe-secret-key
copy STRIPE_WEBHOOK_SECRET stripe-webhook-secret
copy OPENROUTER_API_KEY openrouter-api-key
copy MIXPANEL_TOKEN mixpanel-token optional
copy OPENAI_API_KEY openai-api-key optional

# Accepted access-token clients: the old web client (the extension's launchWebAuthFlow)
# and the old extension client. The new extension client is appended once it exists.
{ value_of GOOGLE_OAUTH_CLIENT_ID || true; printf ','; value_of GOOGLE_OAUTH_CLIENT_ID_EXTENSION || true; } |
  infra/secrets.sh "$ENVIRONMENT" google-oauth-client-id-extension >/dev/null
echo "  GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_ID_EXTENSION -> google-oauth-client-id-extension"

unset LEGACY_ENV
[[ -z $MISSING ]] || { echo "Some required values were missing; add them with infra/secrets.sh." >&2; exit 1; }
