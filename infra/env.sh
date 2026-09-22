# Settings shared by the infra scripts. Sourced, not executed: `source infra/env.sh dev|prod`.
# Everything here is non-secret; secrets live in Secret Manager (see secrets.sh).
# shellcheck disable=SC2034  # the variables are used by the scripts that source this file

case "${1:-}" in
  dev) PROJECT_ID=subturtle-dev ;;
  prod) PROJECT_ID=subturtle-prod ;;
  *)
    echo "usage: $0 dev|prod" >&2
    exit 64
    ;;
esac
ENVIRONMENT=$1

REGION=europe-west4               # Cloud Run, Artifact Registry, Cloud Scheduler
FIRESTORE_LOCATION=${FIRESTORE_LOCATION:-europe-west4}   # fall back to eur3 if the region is unsupported
DATABASE_ID=subturtle             # Firestore database IDs allow no underscores
DB_USER=subturtle-api             # Firestore SCRAM user the API connects as
SERVICE=subturtle-api             # Cloud Run service
AR_REPO=subturtle                 # Artifact Registry repository
GITHUB_REPO=codebridger/subturtle-dashboard-app

RUNTIME_SA=subturtle-api@${PROJECT_ID}.iam.gserviceaccount.com
SCHEDULER_SA=subturtle-scheduler@${PROJECT_ID}.iam.gserviceaccount.com
DEPLOYER_SA=github-deployer@${PROJECT_ID}.iam.gserviceaccount.com

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
# Cloud Run's deterministic URL, known before the first deploy.
API_URL=https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app
DASHBOARD_URL=https://${PROJECT_ID}.web.app

# Secret name -> environment variable the API reads.
REQUIRED_SECRETS=(
  mongo-base-address:MONGO_BASE_ADDRESS
  jwt-private-key:PRIVATE_KEY
  jwt-public-key:PUBLIC_KEY
  admin-email:ADMIN_EMAIL
  admin-password:ADMIN_PASSWORD
  google-oauth-client-id:GOOGLE_OAUTH_CLIENT_ID
  google-oauth-client-secret:GOOGLE_OAUTH_CLIENT_SECRET
  stripe-secret-key:STRIPE_SECRET_KEY
  stripe-webhook-secret:STRIPE_WEBHOOK_SECRET
  gemini-api-key:GEMINI_API_KEY
  gcp-api-key:GCP_API_KEY
  openrouter-api-key:OPENROUTER_API_KEY
)
OPTIONAL_SECRETS=(
  google-oauth-client-id-extension:GOOGLE_OAUTH_CLIENT_ID_EXTENSION
  openai-api-key:OPENAI_API_KEY
  mixpanel-token:MIXPANEL_TOKEN
)

gcloud_p() { gcloud --project "$PROJECT_ID" "$@"; }
