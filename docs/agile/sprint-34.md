# Sprint 34 — Analytics avancées & rapport opérationnel

## Objectif

Fournir à l'équipe opérationnelle un tableau de bord analytique complet pour piloter la croissance de la plateforme. Les données couvrent les revenus, les performances des chauffeurs, la répartition par catégorie, la demande horaire et les meilleurs clients. Aucun nouveau modèle de données — tout est calculé en temps réel sur les données existantes.

**Gaps adressés : #17**  
**Origine roadmap : Phase 8, Sprint 18**

---

## Endpoints API (admin seulement)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/admin/analytics/kpis` | KPIs plateforme (utilisateurs, chauffeurs, courses, revenus, note) |
| `GET /v1/admin/analytics/revenue?period=day` | Revenu agrégé par période (day/week/month) |
| `GET /v1/admin/analytics/drivers?limit=20` | Classement chauffeurs (courses, revenus, note) |
| `GET /v1/admin/analytics/categories` | Répartition par catégorie (economy, comfort, van, premium) |
| `GET /v1/admin/analytics/hourly` | Demande par heure du jour (0–23, toujours 24 entrées) |
| `GET /v1/admin/analytics/top-customers?limit=10` | Top clients par courses et dépenses |

Tous les endpoints retournent 403 pour les non-admins.

---

## Logique d'agrégation

### Python-side grouping (SQLite + PostgreSQL compat)
Pour `get_revenue_by_period`, le regroupement se fait en Python après fetch. Cela garantit la compatibilité avec SQLite (tests) et PostgreSQL (production) sans fonctions SQL spécifiques.

### Hourly demand always returns 24 entries
`get_hourly_demand` initialise un dictionnaire `{0: 0, 1: 0, …, 23: 0}` avant d'y accumuler les courses, assurant 24 entrées même sans données.

### KPIs en une seule requête parallèle
`get_platform_kpis` utilise plusieurs `await db.scalar()` séquentiels (async). Compatible SQLite.

---

## Frontend web-admin

### AnalyticsPanel (nouveau)
- **KPI grid**: 7 métriques clés (cartes avec icônes)
- **Revenue chart**: sélecteur jour/semaine/mois, liste des périodes avec revenus
- **Category breakdown**: liste avec nombre de courses et tarif moyen
- **Hourly demand**: mini graphique en barres (0–23h)
- **Top customers**: classement avec dépenses
- **Driver performance**: classement avec note moyenne
- Onglet "📈 Analytics" dans la navigation web-admin

### CSS Sprint 34
- `.kpi-grid` / `.kpi-card`: grille responsive de KPIs
- `.analytics-section`: sections avec arrière-plan surface
- `.hourly-chart` / `.hourly-bar`: mini graphique en barres CSS
- `.period-tab`: sélecteur période (jour/semaine/mois)

---

## Tests (10 nouveaux)

| Test | Description |
|------|-------------|
| `test_platform_kpis_returns_all_fields` | 8 champs présents dans la réponse |
| `test_platform_kpis_user_count_is_positive` | ≥ 1 utilisateur après inscription |
| `test_revenue_by_day_returns_list` | Liste (vide possible) |
| `test_revenue_invalid_period_returns_422` | period=decade → 422 |
| `test_driver_performance_returns_list` | Liste (vide possible) |
| `test_category_breakdown_returns_list` | Liste (vide possible) |
| `test_hourly_demand_returns_24_entries` | Exactement 24 entrées, heures 0–23 |
| `test_top_customers_returns_list` | Liste (vide possible) |
| `test_non_admin_cannot_access_analytics` | 403 sur tous les 6 endpoints |
| `test_revenue_by_month_returns_list` | period=month → liste |

---

## Résumé des fichiers modifiés/créés

```
apps/api/
  app/crud.py     (modifié — Sprint 34 analytics CRUD: 6 fonctions)
  app/main.py     (modifié — Sprint 34 Pydantic models + 6 endpoints)
  tests/test_analytics.py (NOUVEAU — 10 tests)

apps/web-admin/
  src/App.jsx     (modifié — AnalyticsPanel, KPICard, 📈 onglet, subtitle Sprint 34)
  src/api.js      (modifié — 6 fonctions analytics)
  src/styles.css  (modifié — Sprint 34 analytics CSS)

apps/web-customer/src/App.jsx  (subtitle + footer Sprint 34)
apps/web-driver/src/App.jsx    (subtitle + footer Sprint 34)

docs/agile/sprint-34.md  (CE FICHIER)
```

---

## Total tests accumulés (estimation)

| Sprint | Nouveaux tests | Cumul |
|--------|---------------|-------|
| Sprint 1–30 | 427 | 427 |
| Sprint 31 | 44 | 471 |
| Sprint 32 | 18 | 489 |
| Sprint 33 | 10 | 499 |
| Sprint 34 | 10 | 509 |

---

*Sprint 34 terminé — 2026-05-26*
