# Ziza — Incident Runbook

> Sprint 19 — First-responder guide

## Severity levels

| Level | Definition | Response time |
|-------|-----------|--------------|
| P1 | API unreachable or data loss | 15 min |
| P2 | Feature degraded, latency spike | 1 hour |
| P3 | Cosmetic bug, single-user impact | Next business day |

---

## Runbook: API health check failing (P1)

**Alert**: GCP uptime check on `/health` returns non-200 or `db != "ok"`.

### 1. Confirm the incident

```bash
curl -s https://api.ziza.dev/health | jq .
```

Check `status` and `db` fields.

### 2. Check Cloud Run logs

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --project=ziza-prod \
  --limit=20 \
  --format=json | jq '.[].textPayload'
```

### 3. Check revision rollout

```bash
gcloud run revisions list --service=ziza-api --region=europe-west1 --project=ziza-prod
```

If a recent bad revision was deployed:

```bash
# Roll back to the previous revision (replace <PREV_REVISION>)
gcloud run services update-traffic ziza-api \
  --to-revisions=<PREV_REVISION>=100 \
  --region=europe-west1 \
  --project=ziza-prod
```

### 4. Verify DB connectivity

If `db` field is `"error"` but the process is up, the database connection is broken.

- Check Cloud SQL instance status in GCP Console.
- Check `DATABASE_URL` secret in Secret Manager hasn't been rotated.
- Redeploy with a working `DATABASE_URL` if necessary.

### 5. Communicate

Post in `#ops-alerts`:
```
[INCIDENT P1] API health check failing since HH:MM UTC.
Status: investigating | root-cause identified | mitigated
ETA: ...
```

---

## Runbook: Elevated 5xx error rate (P2)

**Alert**: log-based metric `ziza_slow_requests` or 5xx count threshold exceeded.

### 1. Identify the failing endpoint

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.status_code>=500' \
  --project=ziza-prod \
  --limit=30 \
  --format=json \
  | jq '.[] | {path: .jsonPayload.path, request_id: .jsonPayload.request_id}'
```

### 2. Reproduce locally

```bash
curl -v https://api.ziza.dev/<failing-endpoint>
```

### 3. Check for recent code changes

```bash
git log --oneline -10
```

### 4. Options

| Situation | Action |
|-----------|--------|
| Bad deploy | Roll back (see P1 runbook step 3) |
| DB migration issue | Check alembic `alembic_version` table; run `alembic downgrade -1` if safe |
| Third-party dependency | Disable the feature flag / endpoint temporarily |

---

## Runbook: High latency (P2)

**Alert**: p95 latency > 2 000 ms for 10 consecutive minutes.

### 1. Check Cloud Run instance count

If auto-scaling is capped, increase `--max-instances`:

```bash
gcloud run services update ziza-api \
  --max-instances=20 \
  --region=europe-west1 \
  --project=ziza-prod
```

### 2. Identify slow queries

Look for log lines with `duration_ms > 1000`:

```bash
gcloud logging read \
  'jsonPayload.duration_ms > 1000' \
  --project=ziza-prod \
  --limit=20 \
  --format=json \
  | jq '.[] | {path: .jsonPayload.path, duration_ms: .jsonPayload.duration_ms}'
```

### 3. Check DB connection pool

For PostgreSQL: inspect pg_stat_activity for long-running queries.

---

## Post-incident template

```markdown
## Post-mortem — [date] [title]

**Severity**: P1 / P2
**Duration**: HH:MM – HH:MM UTC (X minutes)
**Impact**: N% of requests affected / N users impacted

### Timeline
- HH:MM Alert fired
- HH:MM First responder paged
- HH:MM Root cause identified
- HH:MM Mitigation applied
- HH:MM Incident resolved

### Root cause
...

### Mitigation
...

### Action items
- [ ] Owner: description (due date)
```
