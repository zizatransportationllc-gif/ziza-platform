# Sprint 25 — Security Hardening

**Durée :** ~1 semaine  
**Objectif :** Renforcer la sécurité de la plateforme : rotation de refresh tokens JWT, rate limiting par IP, upload de documents via URL signée GCS, gestion des secrets en production via Secret Manager, et protection WAF Cloud Armor.  
**Gap adressé :** #9 — Sécurité insuffisante (roadmap Phase 5)

---

## Livrables

| # | Livrable | Statut |
|---|---|---|
| 1 | `app/models/refresh_token.py` — modèle `RefreshToken` (hash SHA-256) | ✅ |
| 2 | `alembic/versions/0021_refresh_tokens.py` — migration table `refresh_tokens` | ✅ |
| 3 | `app/auth/dev_adapter.py` — `issue_for_user_id()` + TTL configurable (15 min) | ✅ |
| 4 | `app/config.py` — `jwt_access_ttl_min`, `jwt_refresh_ttl_days`, `rate_limit_enabled`, `gcs_bucket_name` | ✅ |
| 5 | `app/crud.py` — `create_refresh_token`, `use_refresh_token`, `revoke_refresh_token` | ✅ |
| 6 | `POST /v1/auth/refresh` — rotation obligatoire (ancien token révoqué, nouveau émis) | ✅ |
| 7 | `POST /v1/auth/logout` — révocation du refresh token (204) | ✅ |
| 8 | `POST /v1/token` — retourne désormais `refresh_token` + `expires_in` | ✅ |
| 9 | `app/middleware/rate_limit.py` — sliding window par (IP, path), désactivé par défaut | ✅ |
| 10 | `POST /v1/drivers/me/documents/upload-url` — URL signée GCS (mock en dev/CI) | ✅ |
| 11 | `infra/gcp/secrets.sh` — provisionnement interactif Secret Manager | ✅ |
| 12 | `infra/gcp/cloud-armor.sh` — WAF Cloud Armor : OWASP Top-10 + rate limit `/v1/token` | ✅ |
| 13 | `.github/workflows/ci.yml` — job `security-audit` (pip-audit, bandit, npm audit) | ✅ |
| 14 | Tests : 18 nouveaux → **338 tests au total** | ✅ |

---

## Modèle de données

### Table `refresh_tokens` (migration 0021)

```
id              UUID          PK
auth_user_id    VARCHAR(128)  NOT NULL  INDEX  -- pas de FK (fonctionne avant /v1/auth/register)
token_hash      VARCHAR(64)   NOT NULL  UNIQUE -- SHA-256 du token brut, jamais le token lui-même
expires_at      DATETIME(tz)  NOT NULL
revoked_at      DATETIME(tz)  NULL      -- NULL = actif
created_at      DATETIME(tz)  NOT NULL  default=now()
```

**Design :** le token brut (URL-safe base64, 32 octets aléatoires) n'est jamais persisté. Seul son hash SHA-256 est stocké. La rotation est atomique : l'ancien token est révoqué et le nouveau est inséré dans la même transaction.

---

## Endpoints API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/token` | — | Retourne maintenant `refresh_token` + `expires_in` (secondes) |
| `POST` | `/v1/auth/refresh` | — | Échange un refresh token valide contre un nouveau binôme access+refresh |
| `POST` | `/v1/auth/logout` | — | Révoque le refresh token actif (204 No Content) |
| `POST` | `/v1/drivers/me/documents/upload-url` | driver | URL signée GCS pour upload direct (PUT) |

**Règles métier — Refresh Token :**
- Rotation obligatoire : chaque appel `/v1/auth/refresh` révoque l'ancien token et émet un nouveau
- Token expiré ou révoqué → 401
- Token inconnu → 401
- Après logout : toute tentative de refresh → 401
- `auth_user_id` stocké comme VARCHAR, sans FK sur `users` (fonctionne immédiatement après `/v1/token`)

**Règles métier — Upload URL :**
- Rôle `driver` requis (403 sinon)
- Si `gcs_bucket_name` vide (dev/CI) → URL mock `http://localhost/mock-gcs-upload/...`
- Si `gcs_bucket_name` renseigné (prod) → URL signée GCS v4 (PUT, TTL 15 min)

---

## Rate Limiting

```
RateLimitMiddleware (BaseHTTPMiddleware)
  ├── Sliding window par (IP, chemin)
  ├── X-Forwarded-For respecté (load balancer)
  ├── Désactivé par défaut (_enabled = False)
  └── Limites par route :
        /v1/token            →  5 req / 60 s
        /v1/auth/refresh     → 10 req / 60 s
        /v1/payments/intent  →  3 req / 60 s
        (global)             → 120 req / 60 s
```

Activation en production via `RATE_LIMIT_ENABLED=true` (variable d'environnement → `settings.rate_limit_enabled`).

Réponse en cas de dépassement :
```json
HTTP 429 Too Many Requests
Retry-After: 42
{"detail": "Too many requests — please slow down"}
```

---

## Sécurité CI

Job `security-audit` ajouté dans `.github/workflows/ci.yml` (exécuté sur chaque PR et push sur `main`) :

| Outil | Scope | Seuil | Continue-on-error |
|-------|-------|-------|-------------------|
| `pip-audit` | `apps/api/requirements.txt` | CRITICAL | oui (warn only) |
| `bandit` | `apps/api/app/` | niveau -ll (medium+) | oui |
| `npm audit` | `web-customer` | high | oui |
| `npm audit` | `web-driver` | high | oui |
| `npm audit` | `web-admin` | high | oui |

---

## Couverture tests

| Fichier | Tests | Détail |
|---------|-------|--------|
| `tests/test_auth_refresh.py` | 12 | /v1/token inclut refresh_token + expires_in, refresh→200 + nouveau token pair, rotation invalide l'ancien→401, token inconnu→401, token vide→401, body absent→422, logout→204, logout révoque→401, cycle complet |
| `tests/test_rate_limit.py` | 4 | en dessous limite→200, à la limite→200, au-delà→429, Retry-After présent |
| `tests/test_documents.py` | +2 | upload-url customer→403, upload-url driver→200 avec upload_url + final_url |

**Total : 320 + 18 = 338 tests.**

---

## Critères de validation

- [x] `POST /v1/token` retourne `refresh_token` (non vide) et `expires_in` (> 0)
- [x] `POST /v1/auth/refresh` avec token valide → 200 + nouveau binôme
- [x] Ancien refresh token rejeté après rotation → 401
- [x] Token inconnu / vide → 401
- [x] `POST /v1/auth/logout` → 204, puis refresh → 401
- [x] Rate limiter : 429 après dépassement de seuil, header `Retry-After` présent
- [x] Rate limiter désactivé par défaut (tests existants non affectés)
- [x] `POST /v1/drivers/me/documents/upload-url` driver → 200 avec `upload_url` + `final_url`
- [x] Endpoint upload-url customer → 403
- [x] URL mock retournée en CI (`gcs_bucket_name` vide)

---

## GCP — déploiement en production

### 1. Provisionner les secrets

```bash
bash infra/gcp/secrets.sh YOUR_PROJECT_ID
```

Ce script crée ou met à jour dans Secret Manager :
- `ziza-database-url`
- `ziza-auth-dev-secret`
- `ziza-cinetpay-api-key`
- `ziza-cinetpay-site-id`
- `ziza-stripe-secret-key`
- `ziza-stripe-webhook-secret`

### 2. Mettre à jour Cloud Run

```bash
gcloud run services update ziza-api \
  --update-secrets DATABASE_URL=ziza-database-url:latest \
  --update-secrets AUTH_DEV_SECRET=ziza-auth-dev-secret:latest \
  --update-env-vars RATE_LIMIT_ENABLED=true \
  --update-env-vars GCS_BUCKET_NAME=ziza-driver-docs-prod \
  --update-env-vars JWT_ACCESS_TTL_MIN=15 \
  --update-env-vars JWT_REFRESH_TTL_DAYS=30
```

### 3. Appliquer Cloud Armor WAF

```bash
bash infra/gcp/cloud-armor.sh YOUR_PROJECT_ID ziza-api-backend
```

Ce script crée la politique `ziza-waf-policy` avec :
- Règle 900 : rate limit 5 req/60s par IP sur `/v1/token` → HTTP 429
- Règle 1000 : OWASP Top-10 managed rules (XSS, SQLi, RCE, LFI) → HTTP 403
- Règle 2147483647 : allow par défaut

Pour ajouter une liste blanche d'IPs admin (optionnel) :
```bash
gcloud compute security-policies rules create 800 \
  --security-policy=ziza-waf-policy \
  --expression="request.path.matches('/v1/admin/') && !inIpRange(origin.ip, 'YOUR_OFFICE_CIDR')" \
  --action=deny-403
```

### 4. Bucket GCS pour les documents conducteurs

```bash
gsutil mb -l europe-west1 gs://ziza-driver-docs-prod
gsutil iam ch serviceAccount:ziza-api-sa@YOUR_PROJECT.iam.gserviceaccount.com:roles/storage.objectAdmin \
  gs://ziza-driver-docs-prod
```

### 5. Accorder l'accès Secret Manager au service account

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member='serviceAccount:ziza-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com' \
  --role='roles/secretmanager.secretAccessor'
```
