#!/usr/bin/env bash
# infra/gcp/secrets.sh — Sprint 25
#
# Provision GCP Secret Manager secrets for Ziza API.
# Run once per environment (dev / prod) after authenticating with:
#
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   bash infra/gcp/secrets.sh [PROJECT_ID]
#
# All secrets are stored as the latest version.
# After provisioning, update the Cloud Run deploy step to reference them:
#   gcloud run services update ziza-api \
#     --update-secrets DATABASE_URL=ziza-database-url:latest \
#     --update-secrets AUTH_DEV_SECRET=ziza-auth-dev-secret:latest \
#     ...
#
set -euo pipefail

PROJECT=${1:-$(gcloud config get-value project)}
echo "▶ Provisioning secrets in project: ${PROJECT}"

# Helper — creates or updates a secret
upsert_secret() {
  local name="$1"
  local value="$2"

  if gcloud secrets describe "${name}" --project="${PROJECT}" &>/dev/null; then
    echo "  ↻ Updating existing secret: ${name}"
    printf '%s' "${value}" | \
      gcloud secrets versions add "${name}" --data-file=- --project="${PROJECT}"
  else
    echo "  + Creating new secret: ${name}"
    printf '%s' "${value}" | \
      gcloud secrets create "${name}" --data-file=- --project="${PROJECT}" \
        --replication-policy="automatic"
  fi
}

# ---------------------------------------------------------------------------
# Prompt for secret values (never hard-code them in this script)
# ---------------------------------------------------------------------------

read -rsp "DATABASE_URL (postgresql+asyncpg://...): " DB_URL; echo
upsert_secret "ziza-database-url" "${DB_URL}"

read -rsp "AUTH_DEV_SECRET (JWT signing secret): " AUTH_SECRET; echo
upsert_secret "ziza-auth-dev-secret" "${AUTH_SECRET}"

read -rsp "CINETPAY_API_KEY: " CINETPAY_KEY; echo
upsert_secret "ziza-cinetpay-api-key" "${CINETPAY_KEY}"

read -rsp "CINETPAY_SITE_ID: " CINETPAY_SITE; echo
upsert_secret "ziza-cinetpay-site-id" "${CINETPAY_SITE}"

read -rsp "STRIPE_SECRET_KEY (sk_live_...): " STRIPE_KEY; echo
upsert_secret "ziza-stripe-secret-key" "${STRIPE_KEY}"

read -rsp "STRIPE_WEBHOOK_SECRET (whsec_...): " STRIPE_WH; echo
upsert_secret "ziza-stripe-webhook-secret" "${STRIPE_WH}"

echo ""
echo "✅ All secrets provisioned."
echo ""
echo "Next steps:"
echo "  1. Grant the Cloud Run service account access:"
echo "     gcloud projects add-iam-policy-binding ${PROJECT} \\"
echo "       --member='serviceAccount:ziza-api-sa@${PROJECT}.iam.gserviceaccount.com' \\"
echo "       --role='roles/secretmanager.secretAccessor'"
echo ""
echo "  2. Update the deploy workflow to use --update-secrets instead of --update-env-vars"
echo "     for sensitive values."
