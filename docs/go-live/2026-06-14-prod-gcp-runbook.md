# ZIZA — Runbook GCP prod (commandes exactes)

| | |
|---|---|
| **Date** | 2026-06-14 |
| **Projet** | `ziza-platform` · région `us-central1` |
| **SA déployeur/runtime** | `ziza-deployer@ziza-platform.iam.gserviceaccount.com` |
| **Compte de facturation** | `01D6C7-A09180-AB4926` |
| **Déclencheur prod** | tag `v*` → `.github/workflows/deploy-prod.yml` |

> ⚠️ Ces commandes **créent des ressources facturables et des secrets** : à lancer
> **par le propriétaire** (auth GCP requise, bloquées pour l'agent). Lance chaque
> bloc avec le préfixe `! ` dans la session, ou dans un terminal `gcloud` authentifié.
> Coût récurrent principal : Cloud SQL `db-f1-micro` ≈ **13 $/mo**.

## 0. Variables de travail

```bash
PROJECT=ziza-platform
REGION=us-central1
SA=ziza-deployer@ziza-platform.iam.gserviceaccount.com
gcloud config set project "$PROJECT"
```

## 1. Cloud SQL prod (lean : zonal, sans IP publique)

```bash
gcloud sql instances create ziza-db-prod \
  --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION" \
  --no-assign-ip --storage-size=10 --storage-type=SSD --availability-type=ZONAL \
  --backup --backup-start-time=03:00
gcloud sql databases create ziza --instance=ziza-db-prod
# Mot de passe fort, généré localement :
DB_PW=$(python -c "import secrets;print(secrets.token_urlsafe(24))")
gcloud sql users create ziza --instance=ziza-db-prod --password="$DB_PW"
CONN=$(gcloud sql instances describe ziza-db-prod --format='value(connectionName)')
echo "CLOUD_SQL_INSTANCE_PROD = $CONN"
```

## 2. Secret `ziza-prod-database-url` (+ accès SA)

```bash
printf 'postgresql+asyncpg://ziza:%s@/ziza?host=/cloudsql/%s' "$DB_PW" "$CONN" | \
  gcloud secrets create ziza-prod-database-url --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding ziza-prod-database-url \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

## 3. Secret `ziza-prod-bank-encryption-key` (Fernet — chiffrement bancaire)

```bash
# La clé est générée et stockée sans jamais s'afficher.
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())" | tr -d '\n' | \
  gcloud secrets create ziza-prod-bank-encryption-key --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding ziza-prod-bank-encryption-key \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

## 4. Bucket GCS privé (KYC + photos de profil) + IAM

```bash
BUCKET=ziza-kyc-prod
gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
  --uniform-bucket-level-access --public-access-prevention
# Le SA lit/écrit les objets…
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"
# …et peut SIGNER des URLs V4 sans fichier de clé (IAM SignBlob) :
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountTokenCreator"
```

## 5. Accès SA aux secrets déjà créés (idempotent)

```bash
for S in ziza-prod-jwt-secret ziza-prod-admin-code; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
done
```

## 6. Variables de dépôt GitHub (via `gh`)

```bash
REPO=zizatransportationllc-gif/ziza-platform
gh variable set CLOUD_SQL_INSTANCE_PROD --repo "$REPO" --body "$CONN"
gh variable set FIREBASE_PROJECT_ID_PROD --repo "$REPO" --body "ziza-platform"
gh variable set ZIZA_CORS_ORIGINS_PROD  --repo "$REPO" --body "https://app.ziza.app,https://driver.ziza.app,https://admin.ziza.app,https://pro.ziza.app"
gh variable set ZIZA_KYC_BUCKET_PROD    --repo "$REPO" --body "$BUCKET"
gh variable set VITE_MAPBOX_TOKEN       --repo "$REPO" --body "<ton_token_mapbox>"
# DÉCISION (US, hybride) : Stripe encaisse, Wells Fargo ACH reverse.
# Astuce : commencer en 'mock' pour un 1er smoke test, puis basculer après l'étape 7.
gh variable set PAYMENT_PROVIDER_PROD   --repo "$REPO" --body "stripe"
gh variable set PAYOUT_PROVIDER_PROD    --repo "$REPO" --body "wellsfargo"
gh variable set WELLSFARGO_FUNDING_ACCOUNT_PROD --repo "$REPO" --body "<compte_WF_de_financement>"
gh variable set WELLSFARGO_PAYMENT_RAIL_PROD    --repo "$REPO" --body "ach"
# ZIZA_API_URL_PROD : renseigné APRÈS le 1er déploiement (étape 9).
```

## 7. Secrets paiement (décision : Stripe encaisse + Wells Fargo reverse)

Le workflow n'exige ces secrets que si le provider correspondant est sélectionné.

```bash
# Stripe (cartes) — commencer par les clés TEST, basculer en live à la recette
printf '%s' "sk_test_xxx" | gcloud secrets create ziza-prod-stripe-secret-key --data-file=-
printf '%s' "whsec_xxx"   | gcloud secrets create ziza-prod-stripe-webhook-secret --data-file=-
# Wells Fargo Gateway (payout ACH)
printf '%s' "<wf_gateway_api_key>" | gcloud secrets create ziza-prod-wf-gateway-key --data-file=-
# Accès SA à tous ces secrets
for S in ziza-prod-stripe-secret-key ziza-prod-stripe-webhook-secret ziza-prod-wf-gateway-key; do
  gcloud secrets add-iam-policy-binding "$S" --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
done
```
> Tant que `PAYMENT_PROVIDER_PROD=mock`, **aucun argent réel** n'est manipulé.
> En `stripe`, enregistrer le webhook Stripe sur `<api>/v1/payments/webhook`
> (events `checkout.session.completed`, `payment_intent.payment_failed`,
> `checkout.session.expired`).

### 7bis. Wells Fargo Gateway — contrat d'API (confirmé) + reste à faire

**Credentials reçues et stockées** dans `ziza-prod-wf-gateway-credentials` (secret JSON :
`api_key`, `consumer_key`, `consumer_secret`, `company_id`, `entity_id`) — accès SA accordé.
⚠️ Ce secret JSON **ne correspond pas** au `ziza-prod-wf-gateway-key` (api key seule)
attendu par `deploy-prod.yml` + l'adaptateur bearer-token actuel : à réconcilier avant la
bascule `PAYOUT_PROVIDER_PROD=wellsfargo`.

**Pattern confirmé via developer.wellsfargo.com :**
- **OAuth2** client-credentials : `POST {base}/oauth2/v1/token`, `Authorization: Basic base64(consumer_key:consumer_secret)`, `grant_type=client_credentials` → `access_token`.
- **Headers d'appel** : `Authorization: Bearer {token}`, `gateway-entity-id: {entity_id}`, `client-request-id: {uuid}`, + l'**api key** (header `apikey`).
- **mTLS OBLIGATOIRE** en Validation et Production (pas en Sandbox) → il faut un **certificat client** généré/obtenu via le portail WF (lui-même un secret à stocker).
- **Base URL** : certification = `https://api-certification.wellsfargo.com`, prod = `https://api.wellsfargo.com` (à confirmer).

**Reste à obtenir (portail authentifié, non accessible à l'agent) :**
1. Le **path exact de l'endpoint paiement ACH** + le **schéma JSON du body** (originator/company id, compte de financement, routing+account du bénéficiaire, montant, devise, date d'effet, SEC code).
2. Le **certificat client mTLS** (.crt/.key) → à stocker en Secret Manager.
3. Confirmer la base URL de prod.

→ Tant que ces 3 points ne sont pas fournis, **`PAYOUT_PROVIDER_PROD` reste `mock`**.
Ensuite : réécrire `WellsFargoPayoutAdapter` (OAuth2 + headers + mTLS, config-driven),
mettre à jour `deploy-prod.yml` pour lire le secret JSON + monter le cert mTLS, et tester
en environnement **certification** WF avant la prod.

## 8. (Optionnel) migration des comptes bcrypt → Firebase

```bash
python apps/api/scripts/migrate_bcrypt_to_firebase.py   # génère le JSON
# puis: firebase auth:import users.json --hash-algo=BCRYPT ...
```

## 9. Premier go-live

```bash
git tag v1.0.0 && git push origin v1.0.0      # déclenche deploy-prod.yml
```
Après le 1er déploiement de l'API, récupérer son URL et la figer :

```bash
API_URL=$(gcloud run services describe ziza-api-prod --region="$REGION" --format='value(status.url)')
gh variable set ZIZA_API_URL_PROD --repo zizatransportationllc-gif/ziza-platform --body "$API_URL"
git tag v1.0.1 && git push origin v1.0.1      # rebuild des web apps avec la bonne URL d'API
```

## 10. Smoke test prod

- [ ] `GET <api>/health` → 200
- [ ] Login Firebase (web) — `/v1/token` doit être **404** (prod), `/v1/auth/firebase` OK
- [ ] Une réservation de course complète
- [ ] Console admin accessible (gate `admin_signup_code`)
- [ ] Upload d'un document KYC → relecture via URL **signée** (bucket privé)
- [ ] `PUT /v1/profile/bank-account` → 200 (preuve que la clé de chiffrement est branchée)

---

## Récap : ce qui est déjà fait vs à faire

| Élément | État |
|---|---|
| `deploy-prod.yml` câblé (incl. bucket, providers, clé bancaire) | ✅ (cette PR) |
| Secrets `jwt-secret`, `admin-code` + budget | ✅ (déjà créés) |
| Cloud SQL prod, `database-url`, `bank-encryption-key` | ⏳ étapes 1–3 |
| Bucket GCS privé + IAM signing | ⏳ étape 4 |
| Repo variables | ⏳ étape 6 |
| Tag release | ⏳ étape 9 |
