# Phase 2 — Groundwork prod (lean) + runbook go-live

- **Date** : 2026-06-11
- **Branche** : `phase2-prod-groundwork`
- **Stratégie** : option **lean** — préparer la prod sans allumer la facture. Les
  ressources facturables (Cloud SQL prod) sont **différées** jusqu'au go-live ;
  seul le « gratuit » (workflow, secrets, alerte budget) est mis en place maintenant.
- **Projet** : `ziza-platform` (même projet que le dev) · région `us-central1`.
  Services prod **suffixés `-prod`**, isolés des services dev existants.

## Fait dans cette PR

- **`deploy-prod.yml`** : workflow de déploiement prod, déclenché sur **tag de
  release `v*`** (jamais sur push main). `ENVIRONMENT=prod`, secrets via Secret
  Manager, services `-prod`, `min-instances=0` (lean), gate sur les tests,
  `RATE_LIMIT_ENABLED=true`. Réutilise le Workload Identity + SA dev existants.

## À faire côté GCP (commandes — bloquées par le classifieur, à lancer par le propriétaire)

```bash
SA="ziza-deployer@ziza-platform.iam.gserviceaccount.com"
# Secrets prod (valeurs générées, non affichées)
python -c "import secrets;print(secrets.token_urlsafe(48))" | tr -d '\n' | \
  gcloud secrets create ziza-prod-jwt-secret --data-file=- --replication-policy=automatic
python -c "import secrets;print('ZIZA-ADMIN-'+secrets.token_urlsafe(9))" | tr -d '\n' | \
  gcloud secrets create ziza-prod-admin-code --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding ziza-prod-jwt-secret  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding ziza-prod-admin-code --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
# Alerte budget $50
gcloud billing budgets create --billing-account=01D6C7-A09180-AB4926 \
  --display-name="ziza-prod-budget" --budget-amount=50USD \
  --filter-projects=projects/ziza-platform \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

## Bloqueurs avant un premier go-live prod (dans l'ordre)

1. **Auth Firebase frontend** (Phase 0-frontend / 3b) — sans ça, `ENVIRONMENT=prod`
   n'a **aucun login fonctionnel** (`/v1/token` est 404 en prod). C'est LE verrou.
2. **Projet Firebase** (prod) : providers Auth activés, web-app config, OAuth Google.
3. **F1 KYC** (revue Phase 5) : bucket privé + URLs signées en lecture avant d'avoir
   de vrais documents d'utilisateurs.

## Runbook go-live (le jour J, quand 1-3 sont prêts)

```bash
# 1. Cloud SQL prod (lean, ZONAL, SANS IP publique, accès via connecteur)
gcloud sql instances create ziza-db-prod \
  --database-version=POSTGRES_16 --tier=db-f1-micro --region=us-central1 \
  --no-assign-ip --storage-size=10 --storage-type=SSD --availability-type=ZONAL
gcloud sql databases create ziza --instance=ziza-db-prod
gcloud sql users create ziza --instance=ziza-db-prod --password='<généré>'
# 2. Secret de connexion (host = /cloudsql/<connection_name>)
CONN=$(gcloud sql instances describe ziza-db-prod --format='value(connectionName)')
printf 'postgresql+asyncpg://ziza:<pw>@/ziza?host=/cloudsql/%s' "$CONN" | \
  gcloud secrets create ziza-prod-database-url --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding ziza-prod-database-url --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```
- Définir les **repo variables** : `FIREBASE_PROJECT_ID_PROD`, `ZIZA_CORS_ORIGINS_PROD`,
  `CLOUD_SQL_INSTANCE_PROD` (= `$CONN`), `VITE_MAPBOX_TOKEN`.
- Importer les comptes bcrypt → Firebase (`apps/api/scripts/migrate_bcrypt_to_firebase.py`).
- Taguer une release : `git tag v1.0.0 && git push origin v1.0.0` → déclenche `deploy-prod.yml`.
- Après le 1er déploiement API : récupérer son URL, la mettre dans `ZIZA_API_URL_PROD`,
  re-tag pour rebuilder les web apps avec la bonne URL.

## Coût
- **Maintenant** : ~$0 (Secret Manager = centimes, alerte budget = gratuit).
- **Au go-live** : +~$13/mo (Cloud SQL `db-f1-micro`) + Cloud Run scale-to-zero ≈ gratuit.
