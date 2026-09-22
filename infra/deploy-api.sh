#!/usr/bin/env bash
# Builds Dockerfile.api, pushes it to Artifact Registry and deploys the Cloud Run service.
# Secrets are mounted from Secret Manager; nothing secret is passed on the command line.
# Usage: infra/deploy-api.sh dev|prod [image-tag]   (tag defaults to the git commit)
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"
cd "$(dirname "$0")/.."

TAG=${2:-$(git rev-parse --short HEAD)}
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/$SERVICE:$TAG

secret_env=()
for entry in "${REQUIRED_SECRETS[@]}"; do
  name=${entry%%:*}
  if [[ -z $(gcloud_p secrets versions list "$name" --filter 'state=ENABLED' --limit 1 --format 'value(name)' 2>/dev/null) ]]; then
    echo "Secret $name has no enabled version in $PROJECT_ID (see infra/secrets.sh)." >&2
    exit 1
  fi
  secret_env+=("${entry#*:}=$name:latest")
done
for entry in "${OPTIONAL_SECRETS[@]}"; do
  name=${entry%%:*}
  if [[ -n $(gcloud_p secrets versions list "$name" --filter 'state=ENABLED' --limit 1 --format 'value(name)' 2>/dev/null) ]]; then
    secret_env+=("${entry#*:}=$name:latest")
  fi
done

gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker buildx build --platform linux/amd64 -f Dockerfile.api -t "$IMAGE" --push .

# SCHEDULE_TICK_AUDIENCE must equal the audience in infra/scheduler.sh.
gcloud_p run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 4 \
  --cpu 1 --memory 512Mi --cpu-boost \
  --timeout 300 \
  --set-env-vars "MONGO_SINGLE_DATABASE=true,SCHEDULE_DRIVER=http,SCHEDULE_TICK_AUDIENCE=$API_URL,SCHEDULE_TICK_INVOKER=$SCHEDULER_SA,API_BASE_URL=$API_URL,DASHBOARD_BASE_URL=$DASHBOARD_URL" \
  --set-secrets "$(IFS=,; echo "${secret_env[*]}")"

echo "Deployed $IMAGE to $API_URL"
