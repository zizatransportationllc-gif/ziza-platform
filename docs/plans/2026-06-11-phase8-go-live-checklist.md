# Checklist go-live prod — ZIZA

Liste de contrôle avant de basculer un environnement **prod réellement utilisable**.
Voir aussi le runbook d'infra : `2026-06-11-phase2-prod-groundwork.md`.

## 1. Authentification (BLOQUANT)
- [ ] Projet **Firebase prod** créé ; providers Auth activés (email/password + Google).
- [ ] Écran de consentement OAuth Google configuré ; domaines autorisés.
- [ ] Frontends (9 apps) câblés sur Firebase → `/v1/auth/firebase` (plus `/v1/token`).
- [ ] `VITE_FIREBASE_*` injectés au build des web/mobile.
- [ ] Comptes bcrypt existants importés (`scripts/migrate_bcrypt_to_firebase.py`) **ou** stratégie de reset décidée.
- [ ] Compte **admin prod** créé via `/v1/auth/firebase` + `admin_code` (= secret `ziza-prod-admin-code`).

## 2. Sécurité
- [x] `JWT_SECRET` ≥ 32 octets, non-défaut, en Secret Manager (`ziza-prod-jwt-secret`). *(garde-fou config F4)*
- [x] `/v1/token` & `/v1/auth/signup` → 404 en prod (verrou testé).
- [x] Validation anti-XSS des documents KYC + allowlist uploads.
- [ ] **F1 KYC** : bucket GCS **privé** (UBLA, accès public désactivé) + endpoint d'URL signée en lecture autorisée. *(non fait — voir revue Phase 5)*
- [ ] Rate limiting actif en prod (`RATE_LIMIT_ENABLED=true` — déjà dans `deploy-prod.yml`).
- [ ] CORS prod restreint aux domaines réels (`ZIZA_CORS_ORIGINS_PROD`).
- [ ] Revue des dépendances : pip-audit (résiduel pillow/starlette/pytest traité), npm audit.

## 3. Infrastructure (Phase 2)
- [x] Secret Manager : `ziza-prod-jwt-secret`, `ziza-prod-admin-code` (créés, accès SA).
- [x] Alerte budget $50 active.
- [x] `deploy-prod.yml` (tag de release, services `-prod`).
- [ ] **Cloud SQL `ziza-db-prod`** créé (db-f1-micro, ZONAL, **sans IP publique**) + DB + user.
- [ ] Secret `ziza-prod-database-url` créé (host = `/cloudsql/<connection>`).
- [ ] Repo vars : `FIREBASE_PROJECT_ID_PROD`, `ZIZA_CORS_ORIGINS_PROD`, `CLOUD_SQL_INSTANCE_PROD`, `ZIZA_API_URL_PROD`, `VITE_MAPBOX_TOKEN`.
- [ ] (Optionnel) domaine custom + TLS sur Cloud Run.

## 4. Données & conformité (Phase 5)
- [ ] Backups Cloud SQL activés + **PITR** vérifié ; test de restauration.
- [ ] Politique de rétention PII / KYC documentée.

## 5. Observabilité (Phase 4)
- [x] Scaffolding Sentry en place (no-op sans DSN).
- [ ] `SENTRY_DSN` prod fourni (compte Sentry) → erreurs remontées.
- [ ] Health/readiness probes Cloud Run vérifiées (`/health`).
- [ ] Alerting (budget + erreurs + uptime).

## 6. Déploiement & vérif (jour J)
- [ ] Provisionner Cloud SQL prod + secret DB (runbook Phase 2).
- [ ] Taguer la release : `git tag v1.0.0 && git push origin v1.0.0` → `deploy-prod.yml`.
- [ ] Récupérer l'URL `ziza-api-prod`, la mettre dans `ZIZA_API_URL_PROD`, re-tag pour rebuild des web apps.
- [ ] **Smoke tests prod** : `/health` 200 ; login Firebase ; estimate (USD) ; upload doc ; paiement (Stripe).
- [ ] Plan de **rollback** : redeploy du tag précédent ; migrations réversibles vérifiées.

## Légende
`[x]` = fait dans les PRs de cette session · `[ ]` = reste à faire (souvent bloqué sur Firebase/GCP).
