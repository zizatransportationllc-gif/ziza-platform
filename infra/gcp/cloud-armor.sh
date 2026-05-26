#!/usr/bin/env bash
# infra/gcp/cloud-armor.sh — Sprint 25
#
# Configure Cloud Armor WAF rules for Ziza API:
#   1. Pre-configured OWASP Top-10 managed rule set.
#   2. IP-level rate limit on /v1/token (brute-force protection).
#   3. Optional admin IP allowlist for /v1/admin/* endpoints.
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Cloud Armor API enabled
#   - Load Balancer with backend service pointing to Cloud Run
#
# Usage:
#   bash infra/gcp/cloud-armor.sh [PROJECT_ID] [BACKEND_SERVICE_NAME]
#
set -euo pipefail

PROJECT=${1:-$(gcloud config get-value project)}
BACKEND=${2:-"ziza-api-backend"}
POLICY_NAME="ziza-waf-policy"

echo "▶ Project : ${PROJECT}"
echo "▶ Backend : ${BACKEND}"
echo "▶ Policy  : ${POLICY_NAME}"

# ---------------------------------------------------------------------------
# 1. Create security policy (idempotent)
# ---------------------------------------------------------------------------
if gcloud compute security-policies describe "${POLICY_NAME}" \
     --project="${PROJECT}" &>/dev/null; then
  echo "  ↻ Policy already exists — updating rules."
else
  echo "  + Creating security policy: ${POLICY_NAME}"
  gcloud compute security-policies create "${POLICY_NAME}" \
    --description="Ziza API WAF policy" \
    --project="${PROJECT}"
fi

# ---------------------------------------------------------------------------
# 2. OWASP Top-10 managed rule set (priority 1000)
# ---------------------------------------------------------------------------
echo "  + Applying OWASP Top-10 managed rule set (priority 1000)"
gcloud compute security-policies rules create 1000 \
  --security-policy="${POLICY_NAME}" \
  --expression="evaluatePreconfiguredExpr('xss-stable') || evaluatePreconfiguredExpr('sqli-stable') || evaluatePreconfiguredExpr('rce-stable') || evaluatePreconfiguredExpr('lfi-stable')" \
  --action="deny-403" \
  --description="OWASP Top-10 — XSS, SQLi, RCE, LFI" \
  --project="${PROJECT}" 2>/dev/null || \
gcloud compute security-policies rules update 1000 \
  --security-policy="${POLICY_NAME}" \
  --expression="evaluatePreconfiguredExpr('xss-stable') || evaluatePreconfiguredExpr('sqli-stable') || evaluatePreconfiguredExpr('rce-stable') || evaluatePreconfiguredExpr('lfi-stable')" \
  --action="deny-403" \
  --project="${PROJECT}"

# ---------------------------------------------------------------------------
# 3. Rate limit on /v1/token — 5 req / 60 s per IP (priority 900)
# ---------------------------------------------------------------------------
echo "  + Rate limit rule for /v1/token (priority 900)"
gcloud compute security-policies rules create 900 \
  --security-policy="${POLICY_NAME}" \
  --expression="request.path.matches('/v1/token')" \
  --action="throttle" \
  --rate-limit-threshold-count=5 \
  --rate-limit-threshold-interval-sec=60 \
  --conform-action="allow" \
  --exceed-action="deny-429" \
  --enforce-on-key="IP" \
  --description="Rate limit: POST /v1/token — 5 req/60s per IP" \
  --project="${PROJECT}" 2>/dev/null || \
echo "    (rule 900 already exists — skipping)"

# ---------------------------------------------------------------------------
# 4. Default allow rule (priority 2147483647)
# ---------------------------------------------------------------------------
echo "  + Ensuring default allow rule"
gcloud compute security-policies rules update 2147483647 \
  --security-policy="${POLICY_NAME}" \
  --action="allow" \
  --project="${PROJECT}" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 5. Attach policy to backend service
# ---------------------------------------------------------------------------
echo "  ↻ Attaching policy to backend service: ${BACKEND}"
gcloud compute backend-services update "${BACKEND}" \
  --security-policy="${POLICY_NAME}" \
  --global \
  --project="${PROJECT}"

echo ""
echo "✅ Cloud Armor WAF policy applied to ${BACKEND}."
echo ""
echo "To add an admin IP allowlist for /v1/admin/* (priority 800):"
echo "  gcloud compute security-policies rules create 800 \\"
echo "    --security-policy=${POLICY_NAME} \\"
echo "    --expression=\"request.path.matches('/v1/admin/') && !inIpRange(origin.ip, 'YOUR_OFFICE_CIDR')\" \\"
echo "    --action=deny-403 \\"
echo "    --project=${PROJECT}"
