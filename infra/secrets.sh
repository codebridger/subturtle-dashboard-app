#!/usr/bin/env bash
# Writes secrets to Secret Manager without the values touching disk, argv or the terminal.
#
#   infra/secrets.sh dev|prod NAME < value     add a version of NAME from stdin
#                                              (e.g. piped from another gcloud command)
#   infra/secrets.sh dev|prod                  prompt, with hidden input, for every
#                                              single-line secret that has no version yet
#
# Each secret is readable by the API's runtime service account only. Multi-line values
# (the JWT PEM keys) must be piped in with the first form.
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"

ensure_secret() {
  if ! gcloud_p secrets describe "$1" >/dev/null 2>&1; then
    gcloud_p secrets create "$1" --replication-policy automatic >/dev/null
  fi
  gcloud_p secrets add-iam-policy-binding "$1" \
    --member "serviceAccount:$RUNTIME_SA" --role roles/secretmanager.secretAccessor >/dev/null
}

has_version() {
  [[ -n $(gcloud_p secrets versions list "$1" --filter 'state=ENABLED' --limit 1 --format 'value(name)' 2>/dev/null) ]]
}

if [[ $# -ge 2 ]]; then
  ensure_secret "$2"
  gcloud_p secrets versions add "$2" --data-file - >/dev/null
  echo "Added a version of $2 in $PROJECT_ID."
  exit 0
fi

for entry in "${REQUIRED_SECRETS[@]}" "${OPTIONAL_SECRETS[@]}"; do
  name=${entry%%:*}
  case $name in
    mongo-base-address | jwt-private-key | jwt-public-key) continue ;; # firestore.sh / piped PEM keys
  esac
  if has_version "$name"; then
    echo "  $name: already set"
    continue
  fi
  read -r -s -p "  $name (empty to skip): " value
  echo
  if [[ -n $value ]]; then
    ensure_secret "$name"
    printf '%s' "$value" | gcloud_p secrets versions add "$name" --data-file - >/dev/null
  fi
  unset value
done
