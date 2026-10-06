#!/usr/bin/env bash
# Creates (or updates) the Cloud Scheduler job that drives scheduled jobs: every 5 minutes
# it POSTs /schedule/tick with an OIDC token for the scheduler service account. The API
# verifies that token itself (server/src/modules/schedule/tick-auth.ts); the service
# stays publicly invokable for everything else.
# Usage: infra/scheduler.sh dev|prod
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"

JOB=schedule-tick
# The audience must equal SCHEDULE_TICK_AUDIENCE in infra/deploy-api.sh.
args=(
  --location "$REGION"
  --schedule "*/5 * * * *"
  --uri "$API_URL/schedule/tick"
  --http-method POST
  --oidc-service-account-email "$SCHEDULER_SA"
  --oidc-token-audience "$API_URL"
  --attempt-deadline 300s
)

if gcloud_p scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1; then
  gcloud_p scheduler jobs update http "$JOB" "${args[@]}"
else
  gcloud_p scheduler jobs create http "$JOB" "${args[@]}"
fi

echo "Scheduler job $JOB -> $API_URL/schedule/tick every 5 minutes."
echo "Force a run now: gcloud --project $PROJECT_ID scheduler jobs run $JOB --location $REGION"
