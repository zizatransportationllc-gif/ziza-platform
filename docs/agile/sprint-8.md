# Sprint 8 — Rating System

**Date:** 2026-05-25
**Status:** Done

## Objectif

Permettre aux clients de noter leur chauffeur après chaque trajet terminé,
et aux chauffeurs de consulter leur note moyenne sur leur tableau de bord.

## Travail réalisé

### Backend (`apps/api`)

| Fichier | Changement |
|---|---|
| `app/models/rating.py` | Nouveau modèle `Rating` (id, trip_id, driver_id, customer_id, stars 1-5, comment, created_at) |
| `app/models/__init__.py` | Export du modèle `Rating` |
| `alembic/versions/0004_add_ratings.py` | Migration : table `ratings` + index `trip_id`, `driver_id` |
| `app/crud.py` | `create_rating()`, `get_trip_rating()`, `get_driver_rating_stats()` |
| `app/main.py` | 3 nouveaux endpoints : `POST /v1/trips/{id}/rate`, `GET /v1/trips/{id}/rating`, `GET /v1/drivers/me/rating` |

### Endpoints

| Méthode | URL | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/trips/{id}/rate` | customer | Soumettez une note 1-5 + commentaire optionnel |
| `GET` | `/v1/trips/{id}/rating` | customer | Récupère la note d'un trajet (404 si non noté) |
| `GET` | `/v1/drivers/me/rating` | driver | Statistiques : moyenne + total avis |

### Règles métier

- Seul le client du trajet peut noter (403 sinon)
- Le trajet doit être en statut `completed` (422 sinon)
- Un seul avis par trajet – contrainte `UNIQUE(trip_id)` en DB (409 si doublon)
- `stars` : entier entre 1 et 5 inclus (422 si hors plage via validation Pydantic)

### Tests (`tests/test_ratings.py`) — 13 tests

- `test_rate_completed_trip` — 201 avec rating_id, trip_id, stars, comment
- `test_rate_without_comment` — comment nullable
- `test_rate_duplicate_returns_409`
- `test_rate_pending_trip_returns_422`
- `test_rate_wrong_user_returns_403` — chauffeur ne peut pas noter
- `test_rate_stars_below_minimum_returns_422` — stars=0
- `test_rate_stars_above_maximum_returns_422` — stars=6
- `test_rate_requires_auth`
- `test_get_rating_after_submitting` — GET 200 avec données correctes
- `test_get_rating_unrated_trip_returns_404`
- `test_driver_rating_stats_no_ratings` — total >= 0, average None ou float
- `test_driver_rating_stats_after_rating` — total >= 1, average entre 1.0 et 5.0
- `test_driver_rating_customer_role_forbidden` — 403 pour un customer

**Suite complète : 71/71 tests passent.**

### Frontend `web-customer`

- Composant `RatingForm` affiché après la completion du trajet
  - Sélecteur d'étoiles interactif (hover + clic)
  - Champ commentaire optionnel (500 char max)
  - Soumission via `POST /v1/trips/{id}/rate`
  - Affichage d'un message de succès après notation
- `api.js` : ajout de `rateTrip()` et `getTripRating()`
- `styles.css` : `.rating-form`, `.star-picker`, `.star`, `.star.filled`, `.rating-success`

### Frontend `web-driver`

- Composant `RatingStats` : note moyenne (étoiles colorées + valeur numérique) + total d'avis
- Affiché en haut du tableau de bord, rechargé après chaque course terminée
- `api.js` : ajout de `getMyRating()`
- `styles.css` : `.rating-stats-card`, `.stat-star`, `.rating-avg`

## Critères d'acceptation

- [x] POST /v1/trips/{id}/rate → 201 pour un trajet completed
- [x] Doublon → 409
- [x] Mauvais utilisateur → 403
- [x] Trajet non terminé → 422
- [x] Stars hors 1-5 → 422
- [x] GET /v1/trips/{id}/rating → 200 ou 404
- [x] GET /v1/drivers/me/rating → stats pour chauffeur, 403 pour customer
- [x] Frontend customer : formulaire de notation post-trajet
- [x] Frontend driver : affichage note moyenne + total avis
- [x] 71/71 tests verts en CI
