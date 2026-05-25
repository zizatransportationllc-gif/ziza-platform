# Sprint 19 — Observabilité & Filtres Admin

**Période** : Sprint 19  
**Statut** : ✅ Complété

---

## Objectifs

1. **Observabilité** — middleware de logging structuré JSON + endpoint `/health` enrichi
2. **Filtres admin courses** — filtrer par statut, email client, plage de dates
3. **Filtres admin utilisateurs** — filtrer par rôle, email (partiel insensible à la casse)
4. **Frontend web-admin** — barres de recherche/filtre dans les panneaux Courses et Utilisateurs
5. **Runbooks ops** — documentation monitoring et incident

---

## Fonctionnalités livrées

### Backend

#### Middleware de logging (`app/middleware/logging.py`)
- `RequestLoggingMiddleware` (Starlette `BaseHTTPMiddleware`)
- Log structuré JSON : `request_id`, `method`, `path`, `status_code`, `duration_ms`
- Header `X-Request-ID` injecté sur chaque réponse (UUID v4)

#### Endpoint `/health` enrichi
```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "db": "ok"
}
```
- Test de connectivité DB via `SELECT 1`
- `db` vaut `"ok"` ou `"error"`

#### Filtres `GET /v1/admin/trips`
| Paramètre | Type | Description |
|-----------|------|-------------|
| `status_filter` | string | Filtre exact sur le statut |
| `customer_email` | string | Correspondance partielle insensible à la casse |
| `date_from` | datetime (ISO) | Courses créées à partir de cette date |
| `date_to` | datetime (ISO) | Courses créées jusqu'à cette date |

#### Filtres `GET /v1/admin/users`
| Paramètre | Type | Description |
|-----------|------|-------------|
| `role` | string | Filtre exact : `admin`, `driver`, `customer` |
| `email` | string | Correspondance partielle insensible à la casse |

---

### Tests (18 nouveaux)

**`tests/test_health.py`** (6 tests) :
- `test_health_returns_ok`
- `test_health_returns_version`
- `test_health_returns_environment`
- `test_health_returns_db_field`
- `test_health_db_ok_with_test_db`
- `test_health_request_id_header`

**`tests/test_admin_filters.py`** (12 tests) :
- Courses : pas de filtre, filtre statut pending/completed, filtre email client, email inconnu → liste vide, accès interdit non-admin
- Utilisateurs : pas de filtre, filtre rôle customer/driver, filtre email partiel, email inconnu → liste vide, accès interdit non-admin

**Total** : 234 tests — 234 ✅

---

### Frontend web-admin

#### Panneau Courses — `TripFilterBar`
- Dropdown statut (Tous / En attente / Acceptée / En cours / Terminée / Annulée)
- Input email client (frappe + Entrée ou bouton 🔍)
- Sélecteurs date début / date fin
- Bouton réinitialiser ✕

#### Panneau Utilisateurs — barre de recherche
- Dropdown rôle (Tous / Admin / Chauffeur / Client)
- Input email (partiel, insensible à la casse)
- Bouton 🔍 + bouton ✕

#### Styles (`styles.css`)
- `.filter-bar`, `.filter-select`, `.filter-input`, `.filter-date`
- `.filter-search-btn`, `.filter-reset-btn`

---

### Documentation ops (`docs/ops/`)

- **`monitoring.md`** — Format des logs, health check, métriques GCP, alertes, commandes `gcloud`
- **`runbook-incident.md`** — Niveaux de sévérité P1/P2/P3, runbooks (API down, 5xx élevé, haute latence), template post-mortem

---

## Fichiers modifiés

| Fichier | Type |
|---------|------|
| `apps/api/app/middleware/__init__.py` | Nouveau |
| `apps/api/app/middleware/logging.py` | Nouveau |
| `apps/api/app/crud.py` | Modifié |
| `apps/api/app/main.py` | Modifié |
| `apps/api/tests/test_health.py` | Nouveau |
| `apps/api/tests/test_admin_filters.py` | Nouveau |
| `apps/api/tests/test_demo.py` | Modifié (compat health enrichi) |
| `apps/web-admin/src/api.js` | Modifié |
| `apps/web-admin/src/App.jsx` | Modifié |
| `apps/web-admin/src/styles.css` | Modifié |
| `docs/ops/monitoring.md` | Nouveau |
| `docs/ops/runbook-incident.md` | Nouveau |
| `docs/agile/sprint-19.md` | Nouveau |

---

## Décisions techniques

- **Middleware Starlette** : `BaseHTTPMiddleware` choisi pour sa simplicité ; le `request_id` est
  généré dans la couche middleware, pas dans chaque route.
- **`ilike()`** SQLAlchemy : utilisé pour la correspondance partielle insensible à la casse sur les
  emails, compatible SQLite et PostgreSQL.
- **Construction dynamique de la requête** : la fonction `admin_list_trips` construit la requête
  SQLAlchemy de façon conditionnelle — aucun paramètre optionnel n'est inclus s'il n'est pas fourni.
- **Filtres frontend** : les filtres sont appliqués à l'appui du bouton 🔍 ou de la touche Entrée
  (pas en temps réel) pour limiter les requêtes réseau.
