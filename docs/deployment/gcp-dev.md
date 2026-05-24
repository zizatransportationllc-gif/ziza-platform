# Deploy to GCP — dev environment

Step-by-step guide to deploy Sprint 1 to Google Cloud Run.

**Target:** `us-central1`, 4 public Cloud Run services, images in Artifact Registry.

---

## Prerequisites

- A GCP project with **billing enabled**
- `gcloud` CLI installed and authenticated as a user with the **Owner** role on the project
- A GitHub repository pushed to GitHub (let's call it `<you>/ziza-platform`)
- Local working copy of this repo

---

## Step 1 — Bootstrap GCP resources (one-time)

The bootstrap script is **idempotent**: re-running it is safe.

```bash
export GCP_PROJECT_ID=<your-project-id>
./infra/gcp/bootstrap.sh
```

What it does:

1. Enables APIs: `run`, `artifactregistry`, `cloudbuild`, `iam`, `iamcredentials`
2. Creates Artifact Registry repo `ziza` in `us-central1`
3. Creates service account `ziza-deployer@<project>.iam.gserviceaccount.com`
4. Grants **least-privilege** roles to the SA:
   - `roles/artifactregistry.writer` — push images
   - `roles/run.admin` — deploy & update Cloud Run services
   - `roles/iam.serviceAccountUser` — act as the Cloud Run runtime SA
5. Creates a JSON key at `./ziza-deployer-key.json`

> ⚠️ **Delete the local key file** after copying its content to GitHub Secrets:
> ```bash
> rm ziza-deployer-key.json
> ```

---

## Step 2 — Configure GitHub repo

Go to **Settings → Secrets and variables → Actions** in your GitHub repo.

### Repository **secrets**

| Secret name  | Value                                            |
|--------------|--------------------------------------------------|
| `GCP_SA_KEY` | Full contents of `ziza-deployer-key.json` (JSON) |

### Repository **variables**

| Variable name        | Value (initial)                  | Notes                                       |
|----------------------|----------------------------------|---------------------------------------------|
| `GCP_PROJECT_ID`     | `<your-project-id>`              | Used by the workflow                        |
| `ZIZA_API_URL`       | `http://placeholder`             | Will be updated after first deploy (Step 4) |
| `ZIZA_CORS_ORIGINS`  | `http://placeholder`             | Will be updated after first deploy (Step 4) |

---

## Step 3 — First deploy

```bash
git push origin main
```

The `deploy-dev` workflow:
1. Builds & pushes 4 images to Artifact Registry (`us-central1-docker.pkg.dev/<project>/ziza/<app>:<sha>`)
2. Deploys 4 Cloud Run services: `ziza-api`, `ziza-web-customer`, `ziza-web-driver`, `ziza-web-admin`

> ⚠️ **First deploy will work for the backend but frontends will point at the placeholder URL.** That's expected. Fix in Step 4.

After the workflow finishes, retrieve the URLs:

```bash
gcloud run services list --region=us-central1 --format="table(metadata.name,status.url)"
```

Expected output (URLs will differ):

```
NAME                  URL
ziza-api              https://ziza-api-xxxxxx-uc.a.run.app
ziza-web-admin        https://ziza-web-admin-xxxxxx-uc.a.run.app
ziza-web-customer     https://ziza-web-customer-xxxxxx-uc.a.run.app
ziza-web-driver       https://ziza-web-driver-xxxxxx-uc.a.run.app
```

---

## Step 4 — Update GitHub variables with real URLs, then redeploy

`VITE_API_URL` is **baked into the JS bundle at build time** (Vite limitation). The frontends therefore need to be rebuilt with the real API URL.

Update the GitHub repo variables:

| Variable             | Value                                                                 |
|----------------------|-----------------------------------------------------------------------|
| `ZIZA_API_URL`       | `https://ziza-api-xxxxxx-uc.a.run.app`                                |
| `ZIZA_CORS_ORIGINS`  | `https://ziza-web-customer-...,https://ziza-web-driver-...,https://ziza-web-admin-...` |

Then trigger the deploy workflow again:

- GitHub UI: **Actions → Deploy Dev (GCP Cloud Run) → Run workflow** on `main`
- Or push an empty commit: `git commit --allow-empty -m "redeploy with real URLs" && git push`

After this redeploy:
- Frontends contact the real API
- API has correct CORS

---

## Step 5 — Verify

```bash
API_URL=https://ziza-api-xxxxxx-uc.a.run.app \
WEB_CUSTOMER_URL=https://ziza-web-customer-xxxxxx-uc.a.run.app \
WEB_DRIVER_URL=https://ziza-web-driver-xxxxxx-uc.a.run.app \
WEB_ADMIN_URL=https://ziza-web-admin-xxxxxx-uc.a.run.app \
./scripts/test/smoke.sh
```

Expected: `5 passed, 0 failed`.

Then open each frontend URL in a browser and confirm the page shows **"API reachable ✓"** with the JSON payload.

---

## Cost estimate (Sprint 1)

With `min-instances=0` and a free-tier GCP project, Cloud Run charges are essentially **$0/month** unless someone hammers the demo URLs. Artifact Registry storage for a few hundred MB of images is also free-tier.

Set a budget alert at $10/month in GCP Console → Billing for safety.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Workflow fails on `auth` step | `GCP_SA_KEY` malformed or missing | Re-paste the full JSON from `ziza-deployer-key.json` |
| `Permission denied` pushing to AR | SA missing `artifactregistry.writer` | Re-run `bootstrap.sh` |
| `Permission denied` on `gcloud run deploy` | SA missing `run.admin` or `iam.serviceAccountUser` | Re-run `bootstrap.sh` |
| Frontend shows "API unreachable ✗" | Wrong `VITE_API_URL` or CORS not updated | Update GitHub vars (Step 4), redeploy |
| CORS error in browser console | `ZIZA_CORS_ORIGINS` doesn't include the frontend's URL | Update variable, redeploy `ziza-api` |
| Cloud Run 503 | First request cold start (acceptable) or container fails to listen on `$PORT` | Check logs: `gcloud run logs read ziza-<app> --region=us-central1` |
| `nginx: [emerg] bind() ... Permission denied` | nginx trying to bind privileged port | Confirm template uses `${PORT}` (Cloud Run injects 8080) |

---

## Rollback

To roll back a service to a previous revision:

```bash
gcloud run revisions list --service=ziza-api --region=us-central1
gcloud run services update-traffic ziza-api \
  --region=us-central1 \
  --to-revisions=<previous-revision-name>=100
```

---

## Tearing down (cleanup)

```bash
for svc in ziza-api ziza-web-customer ziza-web-driver ziza-web-admin; do
  gcloud run services delete $svc --region=us-central1 --quiet
done
gcloud artifacts repositories delete ziza --location=us-central1 --quiet
gcloud iam service-accounts delete ziza-deployer@$GCP_PROJECT_ID.iam.gserviceaccount.com --quiet
```
