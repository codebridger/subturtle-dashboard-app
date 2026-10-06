#!/usr/bin/env bash
# Creates the Google API keys the API uses, each restricted to its one API, and stores the
# key strings in Secret Manager without printing them. Skips keys whose secret already has
# a version.
#   gemini-api-key -> Generative Language API (Gemini Live and text sessions)
#   gcp-api-key    -> Cloud Text-to-Speech
# Usage: infra/api-keys.sh dev|prod
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"

create_key() { # secret display-name service
  if [[ -n $(gcloud_p secrets versions list "$1" --filter 'state=ENABLED' --limit 1 --format 'value(name)' 2>/dev/null) ]]; then
    echo "  $1: already set"
    return
  fi
  gcloud_p services api-keys create --display-name "$2" --api-target "service=$3" --format json 2>/dev/null |
    python3 -c 'import json, sys; sys.stdout.write(json.load(sys.stdin)["response"]["keyString"])' |
    "$(dirname "$0")/secrets.sh" "$ENVIRONMENT" "$1" >/dev/null
  echo "  $1: created, restricted to $3"
}

create_key gemini-api-key "SubTurtle API - Gemini" generativelanguage.googleapis.com
create_key gcp-api-key "SubTurtle API - Text-to-Speech" texttospeech.googleapis.com
