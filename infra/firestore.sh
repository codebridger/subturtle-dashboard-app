#!/usr/bin/env bash
# Creates the Firestore Enterprise database (MongoDB compatible) and the SCRAM user the
# API connects as, and stores the full connection string in Secret Manager as
# `mongo-base-address`. The password is printed by Google exactly once; it is captured
# straight into the secret and never echoed or written to disk. Safe to re-run;
# RESET_PASSWORD=1 rotates the password (and the secret).
# Usage: infra/firestore.sh dev|prod
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"

if ! gcloud_p firestore databases describe --database "$DATABASE_ID" >/dev/null 2>&1; then
  # Only a project's first database gets the free tier: check the billing report after creating it.
  gcloud_p firestore databases create --database "$DATABASE_ID" --location "$FIRESTORE_LOCATION" \
    --edition enterprise --enable-mongodb-compatible-data-access --delete-protection
fi
DB_UID=$(gcloud_p firestore databases describe --database "$DATABASE_ID" --format 'value(uid)')
DB_LOCATION=$(gcloud_p firestore databases describe --database "$DATABASE_ID" --format 'value(locationId)')

PASSWORD=
ISSUED=
if ! gcloud_p firestore user-creds describe "$DB_USER" --database "$DATABASE_ID" >/dev/null 2>&1; then
  PASSWORD=$(gcloud_p firestore user-creds create "$DB_USER" --database "$DATABASE_ID" --format 'value(securePassword)')
  ISSUED=1
elif [[ ${RESET_PASSWORD:-} == 1 ]]; then
  PASSWORD=$(gcloud_p firestore user-creds reset-password "$DB_USER" --database "$DATABASE_ID" --format 'value(securePassword)')
  ISSUED=1
else
  echo "User creds $DB_USER already exist; leaving mongo-base-address as is (RESET_PASSWORD=1 rotates it)."
fi
if [[ -n $ISSUED && -z $PASSWORD ]]; then
  echo "gcloud issued a password but printed none under 'securePassword'; rerun with RESET_PASSWORD=1 once the field is known." >&2
  exit 1
fi

if [[ -n $PASSWORD ]]; then
  ENCODED=$(printf '%s' "$PASSWORD" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))')
  printf 'mongodb://%s:%s@%s.%s.firestore.goog:443/%s?loadBalanced=true&tls=true&retryWrites=false&authMechanism=SCRAM-SHA-256' \
    "$DB_USER" "$ENCODED" "$DB_UID" "$DB_LOCATION" "$DATABASE_ID" |
    "$(dirname "$0")/secrets.sh" "$ENVIRONMENT" mongo-base-address
  unset PASSWORD ENCODED
fi

# The SCRAM user may read and write this database only.
gcloud_p projects add-iam-policy-binding "$PROJECT_ID" \
  --member "principal://firestore.googleapis.com/projects/$PROJECT_NUMBER/name/databases/$DATABASE_ID/userCreds/$DB_USER" \
  --role roles/datastore.user \
  --condition "expression=resource.name == \"projects/$PROJECT_ID/databases/$DATABASE_ID\",title=subturtle-database-only" \
  --quiet >/dev/null

echo "Firestore database $DATABASE_ID ($DB_LOCATION) ready. Next: the go/no-go spike (infra/README.md)."
