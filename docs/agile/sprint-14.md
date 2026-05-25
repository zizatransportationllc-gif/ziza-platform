# Sprint 14 — Codes Promo · Gestion du Statut des Chauffeurs

**Status:** ✅ Done — 156/156 tests passing

---

## Objectifs

1. **Système de codes promo** — création, liste, désactivation (admin) + validation + application au booking (client).
2. **Admin : gestion du statut des chauffeurs** — suspendre / réactiver via `PATCH /v1/admin/drivers/{id}/status`.
3. **Frontend web-customer** — saisie de code promo dans la carte de tarif avec affichage du prix réduit.
4. **Frontend web-admin** — onglet 🏷️ Promos + bouton Suspendre/Activer sur chaque chauffeur.

---

## Endpoints ajoutés / modifiés

| Méthode | Route                             | Rôle     | Description                                     |
|---------|-----------------------------------|----------|-------------------------------------------------|
| POST    | `/v1/admin/promos`                | admin    | Créer un code promo (201)                       |
| GET     | `/v1/admin/promos`                | admin    | Lister tous les codes promo                     |
| DELETE  | `/v1/admin/promos/{code}`         | admin    | Désactiver un code promo                        |
| POST    | `/v1/promos/validate`             | customer | Vérifier si un code est valide                  |
| POST    | `/v1/trips`                       | customer | Ajout champ optionnel `promo_code` — remise     |
| PATCH   | `/v1/admin/drivers/{id}/status`   | admin    | Mettre à jour le statut active/inactive/suspended|

---

## Modèle de données

### Table `promo_codes` (nouvelle)
| Colonne | Type | Notes |
|---------|------|-------|
| id | UUID | PK |
| code | VARCHAR(32) | Unique, index |
| discount_pct | INTEGER | 1–100 |
| max_uses | INTEGER | NULL = illimité |
| uses | INTEGER | Compteur (default 0) |
| active | BOOLEAN | default True |
| expires_at | DATETIME | NULL = sans expiration |
| created_at | DATETIME | |

### Table `trips` (modifiée)
- Ajout : `promo_code VARCHAR(32) NULL`
- Ajout : `discount_pct INTEGER NULL`
- Migration : `0009_add_promo_codes.py`

---

## Logique de remise
```
fare_after_promo = max(1, round(fare_xof * (1 - discount_pct / 100)))
```
- Code validé en amont via `POST /v1/promos/validate`
- Code appliqué atomiquement dans `create_trip` (vérif active/expiré/épuisé + incrément `uses`)
- Résultat stocké sur le trip : `promo_code`, `discount_pct`, `fare_xof` (réduit)

---

## Tests (17 nouveaux — `test_promos.py`)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_admin_create_promo` | ✅ |
| 2 | `test_admin_create_promo_duplicate_returns_409` | ✅ |
| 3 | `test_admin_create_promo_requires_admin` | ✅ |
| 4 | `test_admin_list_promos` | ✅ |
| 5 | `test_admin_list_promos_requires_admin` | ✅ |
| 6 | `test_admin_deactivate_promo` | ✅ |
| 7 | `test_admin_deactivate_nonexistent_promo_returns_404` | ✅ |
| 8 | `test_customer_validate_promo_valid` | ✅ |
| 9 | `test_customer_validate_promo_inactive` | ✅ |
| 10 | `test_customer_validate_promo_unknown` | ✅ |
| 11 | `test_trip_with_valid_promo_discounts_fare` | ✅ |
| 12 | `test_trip_without_promo_fare_unchanged` | ✅ |
| 13 | `test_trip_with_invalid_promo_returns_422` | ✅ |
| 14 | `test_admin_set_driver_status_suspended` | ✅ |
| 15 | `test_admin_set_driver_status_active` | ✅ |
| 16 | `test_admin_set_driver_status_invalid_status` | ✅ |
| 17 | `test_admin_set_driver_status_requires_admin` | ✅ |

**Total cumulatif : 156/156**

---

## Frontends

### web-customer
- **Champ code promo** dans la carte de tarif (après l'estimation) :
  - Input + bouton "Valider" → appel `POST /v1/promos/validate`
  - Si valide : badge vert + prix original barré + prix réduit affiché
  - Bouton "✕ Retirer le code" pour annuler
  - Code envoyé lors du booking (`POST /v1/trips`)
- Ajout de `validatePromo` dans `api.js`.
- `createTrip` accepte désormais un `promoCode` optionnel.

### web-admin
- **Onglet 🏷️ Promos** : formulaire de création (code, %, max utilisations) + liste avec statut, usage et bouton Désactiver.
- **Bouton Suspendre/Réactiver** sur chaque chauffeur dans l'onglet Chauffeurs.
- Ajout de `adminCreatePromo`, `adminListPromos`, `adminDeactivatePromo`, `adminSetDriverStatus` dans `api.js`.

---

## Isolation frontends
Chaque frontend conserve son propre `api.js`, `App.jsx`, `styles.css`. Aucun code partagé.
