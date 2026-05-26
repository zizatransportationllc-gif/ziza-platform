# Sprint 31 — Performance, SRE & General Availability

## Objectif

Préparer la plateforme Ziza pour le lancement en disponibilité générale (GA) : feature flags pour le déploiement progressif, codes d'invitation pour la bêta fermée, cache Redis pour les estimations, optimisations de connexion BDD, page d'atterrissage publique, monitoring/alerting GCP, SLO/SLA documentés, et gestion des rôles admin.

**Gaps adressés : #13, #14**  
**Origine roadmap : Phase 7, Sprint 15**

---

## Modèles de données

### Nouvelle table `feature_flags` (migration 0025)

| Champ | Type | Description |
|-------|------|-------------|
| `name` | String(64) PK | Identifiant du flag (ex: `payment_enabled`) |
| `enabled` | Boolean | Flag activé ou non |
| `rollout_pct` | Integer | Pourcentage de déploiement (0–100) |
| `description` | Text | Description humaine |
| `updated_at` | DateTime | Dernière mise à jour |

### Nouvelle table `invite_codes` (migration 0025)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `code` | String(64) UNIQUE | Code d'invitation |
| `max_uses` | Integer | Nombre d'utilisations max |
| `used_count` | Integer | Nombre d'utilisations actuelles |
| `created_at` | DateTime | Date de création |
| `expires_at` | DateTime? | Date d'expiration (optionnelle) |

### Flags par défaut seedés

| Flag | Activé | Rollout |
|------|--------|---------|
| `payment_enabled` | ✅ | 100% |
| `mobile_app_enabled` | ✅ | 100% |
| `driver_apply_enabled` | ✅ | 100% |
| `batch_payout_enabled` | ✅ | 100% |
| `beta_invite_only` | ❌ | 0% |

---

## Endpoints API

### Feature Flags (admin)
- `GET  /v1/admin/flags` — liste tous les flags (seeds defaults si vide)
- `PATCH /v1/admin/flags/{name}` — modifie un flag (enabled, rollout_pct, description)
- `GET  /v1/flags/{name}` — lecture publique d'un flag (sans auth)

### Invite Codes
- `POST /v1/admin/invite-codes` — crée un code (admin only)
- `POST /v1/invite-codes/use` — utilise un code (public); 422 si épuisé/inexistant

### Administration
- `GET  /v1/admin/drivers/live` — liste chauffeurs en ligne (join DriverLocation)
- `PATCH /v1/admin/users/{user_id}/role` — change le rôle d'un utilisateur (403 sur self-promotion)

---

## Cache Redis

### Module `app/cache.py`

- Wrapper async autour de `redis.asyncio`
- No-op quand Redis non configuré (`cache_enabled=False`)
- `set_test_client()` pour injecter `fakeredis` en tests
- `make_estimate_cache_key()` → SHA-256 deterministique
- `cache_delete_pattern("estimate:*")` → invalidation lors du changement de surge

### Configuration (`app/config.py`)

```python
redis_url: str = ""
cache_enabled: bool = False
estimate_cache_ttl_minutes: int = 15
dispatch_radius_km: float = 15.0
```

---

## Améliorations base de données

Pool de connexions PostgreSQL (Sprint 31 SRE hardening) :

```python
pool_size=10
max_overflow=20
pool_recycle=3600  # recycle toutes les heures
pool_pre_ping=True  # vérification avant chaque connexion
```

Uniquement appliqué pour les URLs PostgreSQL (pas SQLite pour les tests).

---

## Landing Page (`apps/web-landing/`)

Page d'atterrissage publique statique servie par Nginx :

- `index.html` — hero, fonctionnalités, catégories, CTA chauffeur, download
- `styles.css` — design system cohérent avec la marque Ziza
- `main.js` — compteurs animés, stats live depuis l'API (fallback 0)
- `Dockerfile` — Nginx alpine sur port 8080, headers sécurité, gzip

---

## Infra GCP (`infra/gcp/`)

| Script | Description |
|--------|-------------|
| `cdn.sh` | Cloud CDN + HTTPS LB + certificat SSL géré pour la landing |
| `uptime.sh` | Uptime checks Cloud Monitoring + alerting email/PagerDuty |
| `deploy-prod.sh` | Déploiement production avec min-instances=1, max=10 |

---

## Documentation SRE

| Document | Contenu |
|----------|---------|
| `docs/ops/slo.md` | SLOs : disponibilité 99.5%, latence p95, taux d'erreur |
| `docs/sla.md` | SLA v1.0 : disponibilité, support, crédits, maintenance |
| `docs/ops/runbooks/hotfix.md` | Procédure déploiement hotfix en production |
| `docs/ops/incidents/template.md` | Template post-mortem incident |

---

## Tests

| Fichier | Tests | Contenu |
|---------|-------|---------|
| `test_feature_flags.py` | 6 | GET list, GET single, PATCH enable/disable, guards |
| `test_invite_codes.py` | 4 | Créer+utiliser, épuisé, inexistant, admin only |
| `test_admin_live_drivers.py` | 4 | Liste vide, online visible, offline exclu, admin only |
| `test_admin_role_management.py` | 5 | Changer rôle, self-promo→403, rôle invalide, guards |
| `test_cache.py` | 8 | Miss, hit, delete pattern, disabled, clés déterministiques |
| `test_dispatch_radius.py` | 5 | Haversine: même point, distances connues, symétrie |
| `test_performance.py` | 4 | Latence estimate, 10 seq, location, trips disponibles |
| `mobile-customer/feature_flags.test.tsx` | 4 | Flags mobile E2E stubs |
| `mobile-driver/live_tracking.test.tsx` | 4 | Online/offline + location E2E stubs |

**Total Sprint 31 : 44 nouveaux tests**

---

## Résumé des fichiers modifiés/créés

```
apps/api/
  app/cache.py                           (NOUVEAU)
  app/config.py                          (modifié — redis_url, cache_enabled, dispatch_radius_km)
  app/db.py                              (modifié — pool_size, max_overflow, pool_recycle)
  app/models/flag.py                     (NOUVEAU)
  app/models/__init__.py                 (modifié — FeatureFlag, InviteCode)
  app/crud.py                            (modifié — feature flags, invite codes, live drivers, roles)
  app/main.py                            (modifié — endpoints Sprint 31)
  alembic/versions/0025_feature_flags.py (NOUVEAU)
  requirements.txt                       (modifié — redis, fakeredis)
  tests/test_feature_flags.py            (NOUVEAU)
  tests/test_invite_codes.py             (NOUVEAU)
  tests/test_admin_live_drivers.py       (NOUVEAU)
  tests/test_admin_role_management.py    (NOUVEAU)
  tests/test_cache.py                    (NOUVEAU)
  tests/test_dispatch_radius.py          (NOUVEAU)
  tests/test_performance.py             (NOUVEAU)

apps/web-admin/
  src/api.js                             (modifié — flags, live drivers, role management)
  src/App.jsx                            (modifié — LiveMapPanel, FlagsPanel, subtitle Sprint 31)
  src/styles.css                         (modifié — Sprint 31 CSS)

apps/web-customer/
  src/App.jsx                            (modifié — subtitle Sprint 31)

apps/web-driver/
  src/App.jsx                            (modifié — subtitle Sprint 31)

apps/web-landing/                        (NOUVEAU)
  index.html
  styles.css
  main.js
  Dockerfile

apps/mobile-customer/__tests__/feature_flags.test.tsx  (NOUVEAU)
apps/mobile-driver/__tests__/live_tracking.test.tsx    (NOUVEAU)

infra/gcp/
  cdn.sh                                 (NOUVEAU)
  uptime.sh                              (NOUVEAU)
  deploy-prod.sh                         (NOUVEAU)

docs/
  ops/slo.md                             (NOUVEAU)
  sla.md                                 (NOUVEAU)
  ops/runbooks/hotfix.md                 (NOUVEAU)
  ops/incidents/template.md              (NOUVEAU)
  agile/sprint-31.md                     (CE FICHIER)
```

---

*Sprint 31 terminé — 2026-05-26*
