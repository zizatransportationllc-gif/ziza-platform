#!/usr/bin/env bash
# Sprint 31 — Set up Cloud CDN + HTTPS Load Balancer for the landing page.
#
# Creates:
#   - Serverless NEG pointing at Cloud Run web-landing service
#   - Backend service with Cloud CDN enabled
#   - URL map + HTTPS target proxy + global forwarding rule
#   - Managed SSL certificate (Google-managed)
#
# Usage:
#   GCP_PROJECT_ID=my-project DOMAIN=www.ziza.ci ./infra/gcp/cdn.sh
#
# Requires: gcloud CLI authenticated with project Owner or compute.admin role.

set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
: "${DOMAIN:?Set DOMAIN env var (e.g. www.ziza.ci)}"

GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-web-landing}"
LB_NAME="${LB_NAME:-ziza-lb}"
NEG_NAME="${NEG_NAME:-ziza-landing-neg}"
BACKEND_NAME="${BACKEND_NAME:-ziza-landing-backend}"
URL_MAP_NAME="${URL_MAP_NAME:-ziza-url-map}"
PROXY_NAME="${PROXY_NAME:-ziza-https-proxy}"
FORWARDING_RULE="${FORWARDING_RULE:-ziza-https-rule}"
CERT_NAME="${CERT_NAME:-ziza-cert}"

echo "▶ GCP_PROJECT_ID : ${GCP_PROJECT_ID}"
echo "▶ DOMAIN         : ${DOMAIN}"
echo "▶ GCP_REGION     : ${GCP_REGION}"

gcloud config set project "${GCP_PROJECT_ID}"

# ── 1. Reserve a global static IP ──────────────────────────────────────────
if ! gcloud compute addresses describe "${LB_NAME}-ip" --global --quiet 2>/dev/null; then
  echo "Creating global static IP..."
  gcloud compute addresses create "${LB_NAME}-ip" --global
fi
STATIC_IP=$(gcloud compute addresses describe "${LB_NAME}-ip" --global --format="value(address)")
echo "Static IP: ${STATIC_IP}"

# ── 2. Serverless NEG for Cloud Run ────────────────────────────────────────
if ! gcloud compute network-endpoint-groups describe "${NEG_NAME}" \
    --region="${GCP_REGION}" --quiet 2>/dev/null; then
  echo "Creating serverless NEG..."
  gcloud compute network-endpoint-groups create "${NEG_NAME}" \
    --region="${GCP_REGION}" \
    --network-endpoint-type=serverless \
    --cloud-run-service="${SERVICE_NAME}"
fi

# ── 3. Backend service with CDN ────────────────────────────────────────────
if ! gcloud compute backend-services describe "${BACKEND_NAME}" --global --quiet 2>/dev/null; then
  echo "Creating backend service with Cloud CDN..."
  gcloud compute backend-services create "${BACKEND_NAME}" \
    --global \
    --enable-cdn \
    --cache-mode=CACHE_ALL_STATIC \
    --default-ttl=3600 \
    --max-ttl=86400

  gcloud compute backend-services add-backend "${BACKEND_NAME}" \
    --global \
    --network-endpoint-group="${NEG_NAME}" \
    --network-endpoint-group-region="${GCP_REGION}"
fi

# ── 4. URL map ──────────────────────────────────────────────────────────────
if ! gcloud compute url-maps describe "${URL_MAP_NAME}" --global --quiet 2>/dev/null; then
  echo "Creating URL map..."
  gcloud compute url-maps create "${URL_MAP_NAME}" \
    --default-service="${BACKEND_NAME}" --global
fi

# ── 5. Managed SSL certificate ─────────────────────────────────────────────
if ! gcloud compute ssl-certificates describe "${CERT_NAME}" --global --quiet 2>/dev/null; then
  echo "Creating managed SSL certificate for ${DOMAIN}..."
  gcloud compute ssl-certificates create "${CERT_NAME}" \
    --domains="${DOMAIN}" --global
fi

# ── 6. HTTPS target proxy ──────────────────────────────────────────────────
if ! gcloud compute target-https-proxies describe "${PROXY_NAME}" --global --quiet 2>/dev/null; then
  echo "Creating HTTPS target proxy..."
  gcloud compute target-https-proxies create "${PROXY_NAME}" \
    --url-map="${URL_MAP_NAME}" \
    --ssl-certificates="${CERT_NAME}" --global
fi

# ── 7. Forwarding rule ─────────────────────────────────────────────────────
if ! gcloud compute forwarding-rules describe "${FORWARDING_RULE}" --global --quiet 2>/dev/null; then
  echo "Creating HTTPS forwarding rule..."
  gcloud compute forwarding-rules create "${FORWARDING_RULE}" \
    --global \
    --target-https-proxy="${PROXY_NAME}" \
    --address="${LB_NAME}-ip" \
    --ports=443
fi

echo ""
echo "✅ Cloud CDN + HTTPS LB setup complete."
echo "   Point your DNS A record for ${DOMAIN} → ${STATIC_IP}"
echo "   SSL provisioning may take up to 15 minutes."
