#!/usr/bin/env bash
# Moves one environment's data from the old DigitalOcean MongoDB into its Firestore
# database. The old deployment keeps two physical databases (`subturtle[_dev]_user_content`
# and `subturtle[_dev]_cms`); Firestore runs everything in the single database named in
# env.sh (MONGO_SINGLE_DATABASE=true), so each source database is restored separately into
# it rather than with --nsFrom/--nsTo: a Firestore URI names its database in the path, and
# mongorestore then reads the dump as a single-database one and skips the subdirectories.
#
# Usage: infra/migrate-data.sh dev|prod [--yes] [--keep-dump] [--dry-run]
#
#   --yes        skip the confirmation prompt (the clear step is destructive)
#   --keep-dump  leave the dump on disk and print its path; by default it is deleted,
#                because it holds every user's data in clear text
#   --dry-run    print what would move and what would be deleted, then stop
#
# Re-runnable: it clears the target collections first. That is required, not tidiness —
# `auths.email_1` is unique AND non-sparse (so only one document may lack an email),
# and `scheduled_jobs.name_1`, `phrase_bundles.refId_1_title_1`, `stripe_customers.user_id_1`
# and `customer_id_1` are unique too. Restoring into a non-empty target silently drops the
# colliding documents - the framework-provisioned admin, any anonymous auth, and the jobs
# the API creates on boot all collide.
#
# Indexes are NOT restored (--noIndexRestore): the API's Mongoose schemas build the indexes
# they need on connect, and index builds on Firestore are long-running operations that
# outlive mongorestore's socket timeout.
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"
cd "$(dirname "$0")/.."

ASSUME_YES=
KEEP_DUMP=
DRY_RUN=
for arg in "${@:2}"; do
  case $arg in
    --yes) ASSUME_YES=1 ;;
    --keep-dump) KEEP_DUMP=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown option: $arg" >&2; exit 64 ;;
  esac
done

for tool in mongodump mongorestore mongosh; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed (brew install mongodb-database-tools mongosh)" >&2; exit 69; }
done

# --- the old deployment's Mongo URI, straight out of its Secret Manager ------------------
LEGACY_PROJECT=learn-by-subtitle
LEGACY_ACCOUNT=${LEGACY_ACCOUNT:-navidshad72@gmail.com}
if [[ $ENVIRONMENT == prod ]]; then
  LEGACY_SECRET=dashboard-app
  LEGACY_TRIGGER=prod-subturtle-dashboard-app-europe-west4-codebridger-subcgz
  SOURCE_DBS=(subturtle_user_content subturtle_cms)
else
  LEGACY_SECRET=dashboard-app-dev
  LEGACY_TRIGGER=dev-subturtle-dashboard-app-europe-west4-codebridgermkf
  SOURCE_DBS=(subturtle_dev_user_content subturtle_dev_cms)
fi

legacy() { gcloud --project "$LEGACY_PROJECT" --account "$LEGACY_ACCOUNT" "$@"; }
LEGACY_VERSION=$(legacy builds triggers describe "$LEGACY_TRIGGER" --region global \
  --format 'value(substitutions._BE_ENV_REVISION)' 2>/dev/null || true)
LEGACY_VERSION=${LEGACY_VERSION:-latest}

# The URI's path ("/admin") is dropped: mongodump refuses --db when the URI names one.
SOURCE_URI=$(legacy secrets versions access "$LEGACY_VERSION" --secret "$LEGACY_SECRET" \
  | (cd server && node -e '
      const env = require("dotenv").parse(require("fs").readFileSync(0));
      const uri = new URL(env.MONGO_BASE_ADDRESS);
      uri.pathname = "/";
      process.stdout.write(uri.toString());
    '))
TARGET_URI=$(gcloud_p secrets versions access latest --secret mongo-base-address)

DUMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/subturtle-$ENVIRONMENT-dump-XXXXXX")
cleanup() { [[ -n $KEEP_DUMP ]] && echo "Dump kept at $DUMP_DIR" || rm -rf "$DUMP_DIR"; }
trap cleanup EXIT

# Counts every collection of a database, as "name<TAB>count" lines, for the diff at the end.
count_source() {
  MONGO_URI="$SOURCE_URI" SOURCE_DB="$1" mongosh --nodb --quiet --eval '
    const db = new Mongo(process.env.MONGO_URI).getDB(process.env.SOURCE_DB);
    for (const c of db.getCollectionNames().sort()) print(c + "\t" + db.getCollection(c).countDocuments({}));
  '
}
count_target() {
  MONGO_URI="$TARGET_URI" mongosh --nodb --quiet --eval '
    const db = connect(process.env.MONGO_URI);
    for (const c of db.getCollectionNames().sort()) print(c + "\t" + db.getCollection(c).countDocuments({}));
  '
}

echo "Source : ${SOURCE_DBS[*]}  (old $ENVIRONMENT deployment, secret $LEGACY_SECRET@$LEGACY_VERSION)"
echo "Target : $PROJECT_ID / Firestore database $DATABASE_ID"
echo
echo "Source documents:"
SOURCE_COUNTS=$(for db in "${SOURCE_DBS[@]}"; do count_source "$db"; done | sort)
printf '%s\n' "$SOURCE_COUNTS" | awk -F'\t' '{ printf "  %-24s %6s\n", $1, $2 }'
SOURCE_TOTAL=$(printf '%s\n' "$SOURCE_COUNTS" | awk -F'\t' '{ s += $2 } END { print s + 0 }')
echo "  ---- total               $SOURCE_TOTAL"

echo
echo "Documents the target holds now (they will be DELETED):"
TARGET_BEFORE=$(count_target)
printf '%s\n' "$TARGET_BEFORE" | awk -F'\t' '{ printf "  %-24s %6s\n", $1, $2 }'

if [[ -n $DRY_RUN ]]; then
  echo
  echo "--dry-run: nothing was read from the source or written to the target."
  exit 0
fi

if [[ -z $ASSUME_YES ]]; then
  echo
  read -r -p "Clear those and restore $SOURCE_TOTAL documents into $PROJECT_ID? [y/N] " answer
  [[ $answer == [yY] ]] || { echo "Aborted."; exit 1; }
fi

echo
echo "Clearing the target..."
MONGO_URI="$TARGET_URI" mongosh --nodb --quiet --eval '
  const db = connect(process.env.MONGO_URI);
  for (const c of db.getCollectionNames().sort()) {
    // Firestore does not support dropDatabase, and dropping a collection loses the
    // indexes the API built on connect - so empty them in place.
    const { deletedCount } = db.getCollection(c).deleteMany({});
    print("  " + c.padEnd(24) + " deleted " + deletedCount);
  }
'

echo
echo "Dumping..."
for db in "${SOURCE_DBS[@]}"; do
  mongodump --uri "$SOURCE_URI" --db "$db" --out "$DUMP_DIR" --quiet
done

echo "Restoring..."
for db in "${SOURCE_DBS[@]}"; do
  mongorestore --uri "$TARGET_URI" --noIndexRestore --dir "$DUMP_DIR/$db" 2>&1 \
    | grep -iE "restored successfully|failed to restore|duplicate|error" || true
done

echo
echo "Result (source -> target):"
TARGET_AFTER=$(count_target)
join -t $'\t' -a1 -a2 -e 0 -o '0,1.2,2.2' <(printf '%s\n' "$SOURCE_COUNTS") <(printf '%s\n' "$TARGET_AFTER") \
  | awk -F'\t' '{ printf "  %-24s %6s -> %-6s %s\n", $1, $2, $3, ($2 == $3 ? "" : "  MISMATCH") }'
TARGET_TOTAL=$(printf '%s\n' "$TARGET_AFTER" | awk -F'\t' '{ s += $2 } END { print s + 0 }')
echo "  ---- total               $SOURCE_TOTAL -> $TARGET_TOTAL"
[[ $SOURCE_TOTAL == "$TARGET_TOTAL" ]] || { echo "Totals differ - investigate before cutting over." >&2; exit 1; }

echo
echo "Done. Restart the API so ScheduleService.init() stamps nextRunAt on the restored jobs:"
echo "  gcloud run services update $SERVICE --region $REGION --project $PROJECT_ID --update-env-vars RESTART_TOKEN=\$(date +%s)"
echo
echo "That backfill is one updateOne per job, filtered on a field Firestore cannot index"
echo "(nextRunAt missing), and Cloud Run throttles CPU between requests - so on an idle"
echo "instance it crawls. Keep hitting the API while it runs and ~230 jobs take about four"
echo "minutes. A job cannot be claimed until it is stamped, so wait for zero here:"
echo "  MONGO_URI=\"\$(gcloud secrets versions access latest --secret mongo-base-address --project $PROJECT_ID)\" \\"
echo "    mongosh --nodb --quiet --eval 'print(connect(process.env.MONGO_URI).scheduled_jobs.countDocuments({ nextRunAt: { \$exists: false } }))'"
echo
echo "It resumes on the next boot if the instance dies mid-way, so a partial count is safe."
