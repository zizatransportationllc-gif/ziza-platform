# Runbook — Hotfix Production Deployment

> Sprint 31 — SRE Runbooks  
> Applies to: all Cloud Run services (api, web-*)

---

## When to Use This Runbook

Use this runbook when:
- A **P1 or P2 incident** requires an immediate fix to production
- The fix cannot wait for the next scheduled sprint deployment
- A security vulnerability needs urgent patching

---

## Prerequisites

- [ ] `gcloud` CLI installed and authenticated (`gcloud auth login`)
- [ ] `GCP_PROJECT_ID` environment variable set
- [ ] Push access to the `main` branch on GitHub (for hotfix commits)
- [ ] Access to the `ziza-deployer` service account via Workload Identity

---

## Hotfix Process

### Step 1 — Create a hotfix branch

```bash
git checkout main
git pull origin main
git checkout -b hotfix/<ticket-id>-<short-description>
# Example: hotfix/INC-042-payment-crash
```

### Step 2 — Apply the fix

Make the minimal change required. Avoid refactoring during a hotfix.

```bash
# Edit the relevant file(s)
git add <files>
git commit -m "hotfix: <description> [INC-XXX]"
```

### Step 3 — Run tests locally

```bash
cd apps/api
pytest -x -q  # fast mode, stop on first failure
```

### Step 4 — Fast-track code review

Even in an emergency, require **at least one reviewer** to approve the PR. If the on-call engineer is unavailable, the incident commander can self-merge with a documented justification in the incident ticket.

```bash
git push origin hotfix/<ticket-id>-<short-description>
gh pr create --base main --title "hotfix: <description>" --body "Incident: INC-XXX. See incident channel for context."
```

### Step 5 — Merge and deploy

```bash
# After approval:
gh pr merge --squash --delete-branch

# CI/CD will auto-deploy via deploy-dev.yml on push to main.
# For prod, wait for CI to pass then manually trigger:
IMAGE_TAG=$(git rev-parse --short HEAD)
GCP_PROJECT_ID=ziza-prod IMAGE_TAG="${IMAGE_TAG}" ./infra/gcp/deploy-prod.sh
```

### Step 6 — Verify the fix

```bash
# Check Cloud Run service health
gcloud run services describe api --region=us-central1 --format="value(status.conditions)"

# Smoke test the affected endpoint
curl -X GET https://api.ziza.ci/health
# Expected: {"status":"ok"}

# Monitor error rate for 10 minutes via Cloud Monitoring
```

### Step 7 — Rollback if needed

If the hotfix makes things worse:

```bash
# List recent revisions
gcloud run revisions list --service=api --region=us-central1

# Rollback to previous revision
PREV_REVISION="api-00050-abc"  # replace with actual revision name
gcloud run services update-traffic api \
  --region=us-central1 \
  --to-revisions="${PREV_REVISION}=100"
```

### Step 8 — Post-incident

After the incident is resolved:

- [ ] Update incident ticket with root cause and fix description
- [ ] Write post-mortem within 5 business days (`docs/ops/incidents/INC-XXX.md`)
- [ ] Create follow-up tickets for any tech debt introduced by the hotfix
- [ ] Update runbook if the process needs adjustment

---

## Useful Commands

```bash
# View recent logs for the API service
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="api"' \
  --limit=100 --format="value(textPayload)" --project="${GCP_PROJECT_ID}"

# View error logs only
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=50 --project="${GCP_PROJECT_ID}"

# Check active alerts
gcloud alpha monitoring policies list --filter="displayName:Ziza" --project="${GCP_PROJECT_ID}"
```

---

## Escalation Matrix

| Situation                  | Contact                        |
|----------------------------|--------------------------------|
| API crash (P1)             | On-call engineer → CTO         |
| Payment failure (P1)       | On-call + CinetPay support     |
| Database unreachable       | On-call + GCP support          |
| Security breach            | CTO + Legal immediately        |

---

*Last updated: Sprint 31 — 2026-05-26*
