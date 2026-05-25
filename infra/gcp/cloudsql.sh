#!/usr/bin/env bash
# infra/gcp/cloudsql.sh — Provision a Cloud SQL PostgreSQL 16 instance for Ziza
#
# Run once from the repo root:
#   bash infra/gcp/cloudsql.sh
#
# Prerequisites:
#   gcloud auth login && gcloud config set project <PROJECT_ID>
#
# After this script completes, add the following to GitHub Secrets/Vars:
#   Secret  DATABASE_URL = postgresql+asyncpg://ziza:<DB_PASSWORD>@/ziza?host=/cloudsql/<PROJECT>:us-central1:ziza-db
#   Var     CLOUD_SQL_INSTANCE = <PROJECT>:us-central1:ziza-db

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these if needed
# ---------------------------------------------------------------------------
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
INSTANCE_NAME="ziza-db"
DB_NAME="ziza"
DB_USER="ziza"
TIER="db-f1-micro"          # cheapest; upgrade to db-g1-small for production

# Generate a random password (or set DB_PASSWORD manually before running)
DB_PASSWORD="${DB_PASSWORD:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')}"

echo "==================================================================="
echo "  Provisioning Cloud SQL PostgreSQL 16 for project: ${PROJECT_ID}"
echo "==================================================================="

# ---------------------------------------------------------------------------
# Step 1: Enable the Cloud SQL Admin API
# ---------------------------------------------------------------------------
echo ""
echo "Step 1/5: Enabling Cloud SQL Admin API…"
gcloud services enable sqladmin.googleapis.com --project="${PROJECT_ID}"

# ---------------------------------------------------------------------------
# Step 2: Create the Cloud SQL instance
# ---------------------------------------------------------------------------
echo ""
echo "Step 2/5: Creating Cloud SQL instance '${INSTANCE_NAME}'…"
echo "          (This takes 5-10 minutes)"

# Check if the instance already exists
if gcloud sql instances describe "${INSTANCE_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "          Instance already exists — skipping creation."
else
    gcloud sql instances create "${INSTANCE_NAME}" \
        --project="${PROJECT_ID}" \
        --database-version=POSTGRES_16 \
        --tier="${TIER}" \
        --region="${REGION}" \
        --storage-type=SSD \
        --storage-size=10GB \
        --storage-auto-increase \
        --backup-start-time=03:00 \
        --no-assign-ip \
        --enable-google-private-path
fi

# ---------------------------------------------------------------------------
# Step 3: Create the database
# ---------------------------------------------------------------------------
echo ""
echo "Step 3/5: Creating database '${DB_NAME}'…"
if gcloud sql databases describe "${DB_NAME}" --instance="${INSTANCE_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "          Database already exists — skipping."
else
    gcloud sql databases create "${DB_NAME}" \
        --instance="${INSTANCE_NAME}" \
        --project="${PROJECT_ID}"
fi

# ---------------------------------------------------------------------------
# Step 4: Create the DB user
# ---------------------------------------------------------------------------
echo ""
echo "Step 4/5: Creating DB user '${DB_USER}'…"
if gcloud sql users list --instance="${INSTANCE_NAME}" --project="${PROJECT_ID}" \
        --format="value(name)" | grep -q "^${DB_USER}$"; then
    echo "          User already exists — updating password."
    gcloud sql users set-password "${DB_USER}" \
        --instance="${INSTANCE_NAME}" \
        --project="${PROJECT_ID}" \
        --password="${DB_PASSWORD}"
else
    gcloud sql users create "${DB_USER}" \
        --instance="${INSTANCE_NAME}" \
        --project="${PROJECT_ID}" \
        --password="${DB_PASSWORD}"
fi

# ---------------------------------------------------------------------------
# Step 5: Grant Cloud Run SA access to Cloud SQL
# ---------------------------------------------------------------------------
echo ""
echo "Step 5/5: Granting Cloud SQL Client role to the Cloud Run service account…"
SA_EMAIL=$(gcloud iam service-accounts list \
    --project="${PROJECT_ID}" \
    --filter="displayName:ziza-deploy OR email:ziza-deploy" \
    --format="value(email)" | head -1)

if [ -n "${SA_EMAIL}" ]; then
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/cloudsql.client" \
        --condition=None
    echo "          Granted roles/cloudsql.client to ${SA_EMAIL}"
else
    echo "          WARNING: Could not find ziza-deploy service account."
    echo "          Add roles/cloudsql.client manually to your Cloud Run SA."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}"

echo ""
echo "==================================================================="
echo "  Cloud SQL instance ready!"
echo "==================================================================="
echo ""
echo "  Instance:       ${CONNECTION_NAME}"
echo "  Database:       ${DB_NAME}"
echo "  User:           ${DB_USER}"
echo "  Password:       ${DB_PASSWORD}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add these to GitHub → Settings → Secrets and Variables:"
echo ""
echo "     SECRET  DATABASE_URL"
echo "     Value:  ${DATABASE_URL}"
echo ""
echo "     VAR     CLOUD_SQL_INSTANCE"
echo "     Value:  ${CONNECTION_NAME}"
echo ""
echo "  2. Run Alembic migrations:"
echo "     cd apps/api"
echo "     DATABASE_URL='${DATABASE_URL}' alembic upgrade head"
echo ""
echo "  3. Push to main — the deploy workflow will attach the Cloud SQL"
echo "     instance to ziza-api on Cloud Run automatically."
echo "==================================================================="
