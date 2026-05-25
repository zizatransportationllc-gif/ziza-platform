# Ziza — Monitoring Guide

> Sprint 19 — Observability baseline

## Overview

The API emits structured JSON logs on every HTTP request via `RequestLoggingMiddleware`.
Each log line contains:

```json
{
  "request_id": "<uuid-v4>",
  "method": "GET",
  "path": "/v1/trips",
  "status_code": 200,
  "duration_ms": 12.4
}
```

Every HTTP response carries the corresponding `X-Request-ID` header — useful to correlate
client-reported errors with server log lines.

---

## Health check

| Endpoint | Expected response |
|----------|-------------------|
| `GET /health` | `{"status":"ok","version":"<x>","environment":"<env>","db":"ok"}` |

- **`status`**: always `"ok"` if the process is up.
- **`db`**: `"ok"` if SQLite / PostgreSQL is reachable; `"error"` otherwise.
- **`environment`**: `"development"` locally, `"production"` on GCP.

### GCP uptime check

1. Cloud Console → **Monitoring → Uptime checks → Create check**
2. Target: `https://api.ziza.dev/health`
3. Period: 1 minute
4. Failure threshold: 2 consecutive failures
5. Alert policy: notify `#ops-alerts` Slack + PagerDuty on-call

---

## Log-based metrics (GCP Cloud Logging)

### Request latency

```bash
# Filter in Log Explorer
resource.type="cloud_run_revision"
jsonPayload.duration_ms > 1000
```

Create a **log-based metric** named `ziza_slow_requests` that counts log lines matching
`duration_ms > 1000`. Alert when rate > 5/min over a 5-minute window.

### 5xx error rate

```bash
resource.type="cloud_run_revision"
jsonPayload.status_code >= 500
```

Alert when count > 3 in any 2-minute window.

---

## Key dashboards

| Dashboard | Purpose |
|-----------|---------|
| Cloud Run Metrics | Request count, latency percentiles, instance count |
| Cloud SQL (future) | Connection pool, query time |
| Custom log metric | Slow requests, 5xx rate |

---

## Alert channels

| Channel | Severity |
|---------|----------|
| Slack `#ops-alerts` | P2 — slow requests, non-zero 5xx rate |
| PagerDuty | P1 — health check down, 5xx spike > 10/min |

---

## Useful gcloud commands

```bash
# Tail production logs (structured JSON)
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="ziza-api"' \
  --project=ziza-prod \
  --limit=50 \
  --format=json \
  | jq '.[] | .jsonPayload'

# Check current Cloud Run revision
gcloud run services describe ziza-api --region=europe-west1 --project=ziza-prod

# List recent deployments
gcloud run revisions list --service=ziza-api --region=europe-west1 --project=ziza-prod
```
