#!/usr/bin/env bash
# Bootstrap GCP resources required by the deploy-dev workflow.
# Idempotent: safe to re-run.
#
# Usage:
#   GCP_PROJECT_ID=my-project ./infra/gcp/bootstrap.sh
#
# Requires: gcloud CLI authenticated as a user with project Owner or equivalent.
# Uses Workload Identity Federation (no long-lived JSON key needed).

set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
GCP_REGION="${GCP_REGION:-us-central1}"
AR_REPO="${AR_REPO:-ziza}"
SA_NAME="${SA_NAME:-ziza-deployer}"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_ORG="${GITHUB_ORG:-zizatransportationllc-gif}"
GITHUB_REPO="${GITHUB_REPO:-ziza-platform}"
WIF_POOL="${WIF_POOL:-github-pool}"
WIF_PROVIDER="${WIF_PROVIDER:-github}"

echo "==> Project:  $GCP_PROJECT_ID"
echo "==> Region:   $GCP_REGION"
echo "==> AR repo:  $AR_REPO"
echo "==> SA:       $SA_EMAIL"
echo "==> GitHub:   $GITHUB_ORG/$GITHUB_REPO"
echo "==> WIF pool: $WIF_POOL / provider: $WIF_PROVIDER"

gcloud config set project "$GCP_PROJECT_ID"

# ----------------------------------------------------------------------
# 1. Enable required APIs
# ----------------------------------------------------------------------
echo ""
echo "==> Enabling required APIs (may take a minute)…"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com

# ----------------------------------------------------------------------
# 2. Create Artifact Registry repo
# ----------------------------------------------------------------------
echo ""
echo "==> Ensuring Artifact Registry repo $AR_REPO exists…"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$GCP_REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --description="Ziza platform images"
else
  echo "    already exists ✓"
fi

# ----------------------------------------------------------------------
# 3. Create deployer service account
# ----------------------------------------------------------------------
echo ""
echo "==> Ensuring service account $SA_EMAIL exists…"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Ziza CI/CD Deployer"
else
  echo "    already exists ✓"
fi

# ----------------------------------------------------------------------
# 4. Grant least-privilege roles
# ----------------------------------------------------------------------
echo ""
echo "==> Granting roles to $SA_EMAIL…"
# - artifactregistry.writer : push images
# - run.admin               : deploy & update Cloud Run services
# - iam.serviceAccountUser  : act as the Cloud Run runtime SA
for ROLE in \
  roles/artifactregistry.writer \
  roles/run.admin \
  roles/iam.serviceAccountUser
do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None \
    --quiet >/dev/null
  echo "    granted $ROLE ✓"
done

# ----------------------------------------------------------------------
# 5. Workload Identity Federation (replaces JSON key)
# ----------------------------------------------------------------------
echo ""
echo "==> Setting up Workload Identity Federation for GitHub Actions…"

PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectNumber)")

# 5a. Create WIF pool
if ! gcloud iam workload-identity-pools describe "$WIF_POOL" \
    --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$WIF_POOL" \
    --location=global \
    --display-name="GitHub Actions pool"
  echo "    pool $WIF_POOL created ✓"
else
  echo "    pool $WIF_POOL already exists ✓"
fi

# 5b. Create OIDC provider
if ! gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
    --workload-identity-pool="$WIF_POOL" \
    --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --workload-identity-pool="$WIF_POOL" \
    --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${GITHUB_ORG}/${GITHUB_REPO}'"
  echo "    provider $WIF_PROVIDER created ✓"
else
  echo "    provider $WIF_PROVIDER already exists ✓"
fi

# 5c. Allow the GitHub repo to impersonate the service account
WIF_MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$WIF_MEMBER" \
  --quiet >/dev/null
echo "    workloadIdentityUser binding set ✓"

WIF_PROVIDER_FULL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"

echo ""
echo "==> ✅ Bootstrap complete."
echo ""
echo "Next steps — add these to your GitHub repo (Settings → Secrets and variables):"
echo ""
echo "  Variables:"
echo "    GCP_PROJECT_ID          = $GCP_PROJECT_ID"
echo "    WORKLOAD_IDENTITY_PROVIDER = $WIF_PROVIDER_FULL"
echo "    GCP_SERVICE_ACCOUNT     = $SA_EMAIL"
echo ""
echo "  (No secret key file needed — Workload Identity Federation is keyless)"
echo ""
echo "  After first deploy:"
echo "    ZIZA_API_URL            = <Cloud Run URL of ziza-api>"
echo "    ZIZA_CORS_ORIGINS       = <comma-separated Cloud Run URLs of the 3 frontends>"
