#!/usr/bin/env bash
# One-time project setup, safe to re-run: APIs, Artifact Registry, service accounts and
# their roles, and keyless GitHub Actions access (Workload Identity Federation).
# Usage: infra/bootstrap.sh dev|prod
set -euo pipefail
source "$(dirname "$0")/env.sh" "${1:-}"

gcloud_p services enable \
  firestore.googleapis.com run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com firebasehosting.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  texttospeech.googleapis.com generativelanguage.googleapis.com

gcloud_p artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud_p artifacts repositories create "$AR_REPO" --repository-format docker --location "$REGION"

ensure_sa() {
  gcloud_p iam service-accounts describe "$1@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 ||
    gcloud_p iam service-accounts create "$1" --display-name "$2"
}
ensure_sa subturtle-api "SubTurtle API (Cloud Run runtime)"
ensure_sa subturtle-scheduler "Cloud Scheduler caller of POST /schedule/tick"
ensure_sa github-deployer "GitHub Actions deploys"

# A service account created a moment ago can take a while to be visible to IAM.
retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    "$@" && return 0
    sleep $((attempt * 5))
  done
  return 1
}

project_role() {
  retry gcloud_p projects add-iam-policy-binding "$PROJECT_ID" --member "$1" --role "$2" --condition None --quiet >/dev/null
}
# The deployer pushes images, deploys Cloud Run as the runtime account, and deploys Hosting.
project_role "serviceAccount:$DEPLOYER_SA" roles/artifactregistry.writer
project_role "serviceAccount:$DEPLOYER_SA" roles/run.admin
project_role "serviceAccount:$DEPLOYER_SA" roles/firebasehosting.admin
project_role "serviceAccount:$DEPLOYER_SA" roles/serviceusage.serviceUsageConsumer
# deploy-api.sh refuses to deploy when a required secret has no enabled version, which
# means listing version metadata. `viewer` grants exactly that and NOT access to the
# payloads - only the runtime account can read those (secrets.sh) - so a compromised
# deploy job still cannot read a single secret value.
project_role "serviceAccount:$DEPLOYER_SA" roles/secretmanager.viewer
retry gcloud_p iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser >/dev/null

# Cloud Scheduler signs the tick's OIDC token as the scheduler account.
gcloud_p beta services identity create --service cloudscheduler.googleapis.com >/dev/null
retry gcloud_p iam service-accounts add-iam-policy-binding "$SCHEDULER_SA" \
  --member "serviceAccount:service-$PROJECT_NUMBER@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountTokenCreator >/dev/null

# GitHub Actions -> deployer, without a key file. Prod only trusts runs on main.
POOL=github
PROVIDER=github-actions
CONDITION="assertion.repository == '$GITHUB_REPO'"
[[ $ENVIRONMENT == prod ]] && CONDITION="$CONDITION && assertion.ref == 'refs/heads/main'"
gcloud_p iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 ||
  gcloud_p iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
gcloud_p iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool "$POOL" --location global >/dev/null 2>&1 ||
  gcloud_p iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool "$POOL" --location global \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "$CONDITION"
retry gcloud_p iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null

cat <<EOF

Bootstrap done for $PROJECT_ID. GitHub environment "$ENVIRONMENT" variables:
  GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
  GCP_DEPLOYER_SERVICE_ACCOUNT   = $DEPLOYER_SA
EOF
