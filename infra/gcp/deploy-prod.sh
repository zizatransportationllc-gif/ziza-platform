#!/usr/bin/env bash
# Sprint 31 — Production deployment script for Ziza Cloud Run services.
#
# Deploys all 4 services (api, web-customer, web-driver, web-admin) + landing page
# to the PRODUCTION Cloud Run environment with:
#   - min-instances=1 (no cold starts)
#   - max-instances=10
#   - traffic 100% to new revision
#   - HTTPS-only
#
# Usage:
#   GCP_PROJECT_ID=ziza-prod \
#   GCP_REGION=us-central1 \
#   IMAGE_TAG=v1.0.0 \
#   ./infra/gcp/deploy-prod.sh
#
# Prerequisites:
#   - Docker images already pushed to Artifact Registry with IMAGE_TAG
#   - All secrets configured in Secret Manager
#   - gcloud CLI authenticated with Cloud Run Admin role

set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
: "${IMAGE_TAG:?Set IMAGE_TAG env var (e.g. v1.0.0 or git SHA)}"

GCP_REGION="${GCP_REGION:-us-central1}"
AR_REPO="${AR_REPO:-ziza}"
AR_HOST="${GCP_REGION}-docker.pkg.dev"
IMAGE_BASE="${AR_HOST}/${GCP_PROJECT_ID}/${AR_REPO}"

SERVICES=(api web-customer web-driver web-admin web-landing)

echo "▶ GCP_PROJECT_ID : ${GCP_PROJECT_ID}"
echo "▶ GCP_REGION     : ${GCP_REGION}"
echo "▶ IMAGE_TAG       : ${IMAGE_TAG}"
echo ""

gcloud config set project "${GCP_PROJECT_ID}"

# ── Common Cloud Run flags ──────────────────────────────────────────────────
COMMON_FLAGS=(
  --region="${GCP_REGION}"
  --platform=managed
  --min-instances=1
  --max-instances=10
  --memory=512Mi
  --cpu=1
  --timeout=30s
  --ingress=all
  --allow-unauthenticated
  --traffic=100
)

# ── Deploy each service ─────────────────────────────────────────────────────
for SERVICE in "${SERVICES[@]}"; do
  IMAGE="${IMAGE_BASE}/${SERVICE}:${IMAGE_TAG}"
  echo "🚀 Deploying ${SERVICE} → ${IMAGE}"

  EXTRA_FLAGS=()

  if [ "${SERVICE}" = "api" ]; then
    # API needs secrets
    EXTRA_FLAGS+=(
      --set-secrets="DATABASE_URL=DATABASE_URL:latest"
      --set-secrets="JWT_SECRET=JWT_SECRET:latest"
      --set-secrets="FIREBASE_CREDENTIALS=FIREBASE_CREDENTIALS:latest"
      --set-env-vars="ENVIRONMENT=production"
      --set-env-vars="CACHE_ENABLED=true"
      --set-secrets="REDIS_URL=REDIS_URL:latest"
      --memory=1Gi
      --cpu=2
      --min-instances=2
    )
  fi

  gcloud run deploy "${SERVICE}" \
    "${COMMON_FLAGS[@]}" \
    "${EXTRA_FLAGS[@]}" \
    --image="${IMAGE}"

  echo "✅ ${SERVICE} deployed."
  echo ""
done

# ── Print service URLs ──────────────────────────────────────────────────────
echo "Service URLs:"
for SERVICE in "${SERVICES[@]}"; do
  URL=$(gcloud run services describe "${SERVICE}" \
    --region="${GCP_REGION}" \
    --format="value(status.url)" 2>/dev/null || echo "unknown")
  printf "  %-20s %s\n" "${SERVICE}" "${URL}"
done

echo ""
echo "✅ Production deployment complete. Tag: ${IMAGE_TAG}"
