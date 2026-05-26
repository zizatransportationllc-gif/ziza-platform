# Ziza — Service Level Objectives (SLO)

> Sprint 31 — Performance, SRE & General Availability

## Overview

This document defines the SLOs for all Ziza production services. SLOs are reviewed monthly and tracked via Cloud Monitoring dashboards.

---

## Services in Scope

| Service        | Component           | Cloud Run Name     |
|----------------|---------------------|--------------------|
| API Backend    | FastAPI / asyncpg   | `api`              |
| Customer Web   | React / Vite        | `web-customer`     |
| Driver Web     | React / Vite        | `web-driver`       |
| Admin Web      | React / Vite        | `web-admin`        |
| Landing Page   | Static HTML / Nginx | `web-landing`      |

---

## SLO Definitions

### 1. Availability SLO

**Target**: 99.5% monthly uptime for all production services.

| Service         | Availability Target | Error Budget (30 days) |
|-----------------|---------------------|------------------------|
| API Backend     | 99.5%               | 3h 36m                 |
| Customer Web    | 99.5%               | 3h 36m                 |
| Driver Web      | 99.5%               | 3h 36m                 |
| Admin Web       | 99.0%               | 7h 12m                 |
| Landing Page    | 99.9%               | 43m 12s                |

**Measurement**: Google Cloud Monitoring uptime checks (`infra/gcp/uptime.sh`), probing `/health` every 60 seconds from multiple regions.

### 2. Latency SLO

**Target**: p95 response time at the API layer.

| Endpoint                    | p95 Target |
|-----------------------------|------------|
| `POST /v1/estimate`         | 200ms      |
| `GET /v1/trips/available`   | 300ms      |
| `PUT /v1/drivers/location`  | 150ms      |
| `POST /v1/trips`            | 400ms      |
| `GET /v1/me`                | 100ms      |
| All other endpoints         | 500ms      |

**Measurement**: Cloud Run request latency metrics + `test_performance.py` regression suite in CI.

### 3. Error Rate SLO

**Target**: HTTP 5xx error rate < 0.5% over any rolling 5-minute window.

**Exclusions**:
- HTTP 422 (client validation errors) are excluded from error budget
- Planned maintenance windows (announced 24h in advance)

---

## SLI Signals

### API Health Check

```
GET /health → 200 OK
{ "status": "ok", "sprint": "31" }
```

### Static Service Health

Nginx `location /health` returns `200 ok`.

---

## Error Budget Policy

| Burn Rate       | Action                                         |
|-----------------|------------------------------------------------|
| > 2× (fast)     | Page on-call immediately                       |
| > 1× for 1h     | Notify team, investigate                       |
| Budget < 25%    | Feature freeze; focus on reliability           |
| Budget exhausted| Incident post-mortem required before new features |

---

## Monitoring Links

- **Uptime dashboard**: Cloud Monitoring → Uptime checks → filter `ziza-*`
- **Latency dashboard**: Cloud Run → Metrics → Request Latency p95
- **Alerting policy**: "Ziza Uptime SLA Alert" (configured via `infra/gcp/uptime.sh`)

---

## Review Schedule

| Period    | Action                                |
|-----------|---------------------------------------|
| Weekly    | Check error budget burn rate          |
| Monthly   | SLO review meeting + target adjustment|
| Quarterly | Full SLO/SLA renegotiation            |

---

*Last updated: Sprint 31 — 2026-05-26*
