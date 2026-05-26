#!/usr/bin/env bash
# Sprint 31 — Configure Cloud Monitoring uptime checks + alerting policy.
#
# Creates one uptime check per service and one alerting policy that fires
# a PagerDuty/email alert when a service is down for > 2 minutes.
#
# Usage:
#   GCP_PROJECT_ID=my-project ALERT_EMAIL=ops@ziza.ci ./infra/gcp/uptime.sh
#
# Requires: gcloud CLI with monitoring.admin role.

set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
ALERT_EMAIL="${ALERT_EMAIL:-ops@ziza.ci}"
GCP_REGION="${GCP_REGION:-us-central1}"

# Cloud Run service URLs (override via env if different)
API_URL="${API_URL:-https://api-dev-xxxx-uc.a.run.app}"
CUSTOMER_URL="${CUSTOMER_URL:-https://web-customer-dev-xxxx-uc.a.run.app}"
DRIVER_URL="${DRIVER_URL:-https://web-driver-dev-xxxx-uc.a.run.app}"
ADMIN_URL="${ADMIN_URL:-https://web-admin-dev-xxxx-uc.a.run.app}"

echo "▶ GCP_PROJECT_ID : ${GCP_PROJECT_ID}"
echo "▶ ALERT_EMAIL    : ${ALERT_EMAIL}"

gcloud config set project "${GCP_PROJECT_ID}"

# ── Helper: create uptime check if it doesn't already exist ────────────────
create_uptime_check() {
  local name="$1"
  local host="$2"
  local path="${3:-/health}"

  echo "Creating uptime check: ${name} → https://${host}${path}"
  gcloud monitoring uptime create "${name}" \
    --resource-type=uptime-url \
    --resource-labels="host=${host},project_id=${GCP_PROJECT_ID}" \
    --protocol=HTTPS \
    --path="${path}" \
    --period=60 \
    --timeout=10 \
    --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "  (already exists, skipping)"
}

# Strip https:// prefix for the host label
_host() { echo "${1}" | sed 's|https://||'; }

create_uptime_check "ziza-api-health"      "$(_host "${API_URL}")"      "/health"
create_uptime_check "ziza-customer-health" "$(_host "${CUSTOMER_URL}")" "/"
create_uptime_check "ziza-driver-health"   "$(_host "${DRIVER_URL}")"   "/"
create_uptime_check "ziza-admin-health"    "$(_host "${ADMIN_URL}")"    "/"

# ── Notification channel (email) ───────────────────────────────────────────
echo "Creating email notification channel for ${ALERT_EMAIL}..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --display-name="Ziza Ops Email" \
  --type=email \
  --channel-labels="email_address=${ALERT_EMAIL}" \
  --format="value(name)" \
  --project="${GCP_PROJECT_ID}" 2>/dev/null || true)

if [ -z "${CHANNEL_ID}" ]; then
  CHANNEL_ID=$(gcloud alpha monitoring channels list \
    --filter="displayName='Ziza Ops Email'" \
    --format="value(name)" \
    --project="${GCP_PROJECT_ID}" | head -1)
fi

echo "Notification channel: ${CHANNEL_ID}"

# ── Alerting policy: uptime failure for any check ─────────────────────────
echo "Creating alerting policy (uptime failure → alert in 2 min)..."
gcloud alpha monitoring policies create \
  --display-name="Ziza Uptime SLA Alert" \
  --condition-display-name="Uptime check failed" \
  --condition-filter='metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id=starts_with("ziza")' \
  --condition-threshold-value=1 \
  --condition-threshold-comparison=COMPARISON_LT \
  --condition-aggregation-alignment-period=60s \
  --condition-aggregation-per-series-aligner=ALIGN_NEXT_OLDER \
  --condition-duration=120s \
  --notification-channels="${CHANNEL_ID}" \
  --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "  (policy may already exist)"

echo ""
echo "✅ Uptime checks + alerting configured."
echo "   View at: https://console.cloud.google.com/monitoring/uptime?project=${GCP_PROJECT_ID}"
