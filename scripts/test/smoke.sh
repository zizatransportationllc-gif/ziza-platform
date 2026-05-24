#!/usr/bin/env bash
# Smoke test the local stack: verify each service responds.
# Usage:
#   ./scripts/test/smoke.sh                # local
#   API_URL=https://... WEB_CUSTOMER_URL=https://... \
#   WEB_DRIVER_URL=https://... WEB_ADMIN_URL=https://... \
#   ./scripts/test/smoke.sh                # against deployed URLs

set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
WEB_CUSTOMER_URL="${WEB_CUSTOMER_URL:-http://localhost:3001}"
WEB_DRIVER_URL="${WEB_DRIVER_URL:-http://localhost:3002}"
WEB_ADMIN_URL="${WEB_ADMIN_URL:-http://localhost:3003}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect="${3:-200}"
  if code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$url"); then
    if [ "$code" = "$expect" ]; then
      echo "  ✓ $name ($code) $url"
      PASS=$((PASS + 1))
    else
      echo "  ✗ $name expected $expect got $code  $url"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "  ✗ $name unreachable  $url"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke tests"
echo "==========="
check "API /health"        "$API_URL/health"
check "API /v1/demo"       "$API_URL/v1/demo"
check "web-customer"       "$WEB_CUSTOMER_URL/"
check "web-driver"         "$WEB_DRIVER_URL/"
check "web-admin"          "$WEB_ADMIN_URL/"

echo ""
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
