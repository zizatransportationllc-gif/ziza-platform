# Sprint 15 — Demandes de retrait & Vue admin des avis

**Status:** ✅ Done — 174/174 tests passing

---

## Objectifs

1. **Demandes de retrait de gains** — driver soumet une demande (montant en XOF), admin approuve ou rejette avec note optionnelle.
2. **Vue admin des avis** — endpoint `GET /v1/admin/ratings` listant tous les avis avec email client et info chauffeur.
3. **Profil driver enrichi** — `avg_rating` + `total_ratings` exposés dans `GET /v1/drivers/me/profile` et `GET /v1/admin/drivers`.
4. **Frontend web-driver** — onglet 💰 Retraits avec formulaire de demande et liste des demandes.
5. **Frontend web-admin** — onglets 💸 Retraits (approuver/rejeter) et ⭐ Avis (liste paginée).

---

## Endpoints ajoutés / modifiés

| Méthode | Route                                       | Rôle     | Description                                      |
|---------|---------------------------------------------|----------|--------------------------------------------------|
| POST    | `/v1/drivers/me/payout-requests`            | driver   | Créer une demande de retrait (201)               |
| GET     | `/v1/drivers/me/payout-requests`            | driver   | Lister ses propres demandes                      |
| GET     | `/v1/admin/payout-requests`                 | admin    | Lister toutes les demandes (paginé)              |
| PATCH   | `/v1/admin/payout-requests/{id}/status`     | admin    | Approuver ou rejeter une demande                 |
| GET     | `/v1/admin/ratings`                         | admin    | Lister tous les avis clients (paginé)            |
| GET     | `/v1/drivers/me/profile`                    | driver   | Mis à jour : +avg_rating, +total_ratings         |
| GET     | `/v1/admin/drivers`                         | admin    | Mis à jour : +avg_rating, +total_ratings par chauffeur |

---

## Modèle de données

### Table `payout_requests` (nouvelle)
| Colonne      | Type         | Notes                        |
|--------------|--------------|------------------------------|
| id           | UUID         | PK                           |
| driver_id    | UUID         | FK → drivers.id (CASCADE)    |
| amount_xof   | INTEGER      | ≥ 1                          |
| status       | VARCHAR(16)  | pending / approved / rejected |
| note_admin   | TEXT         | NULL = sans note             |
| created_at   | DATETIME     |                              |
| updated_at   | DATETIME     | mis à jour lors du changement de statut |

Migration : `0010_add_payout_requests.py`

---

## Logique métier

### Demande de retrait
- Driver crée une demande pour n'importe quel montant ≥ 1 XOF (pas de vérification du solde — admin vérifie manuellement).
- Admin approuve (`approved`) ou rejette (`rejected`) avec note optionnelle.
- Statuts cibles du PATCH limités à `approved | rejected` (Pydantic `Literal`).

### Vue admin des avis
- Joint `ratings` + `users` pour exposer `customer_email`.
- Paginé (limit/offset, max 200).

### Profil driver enrichi
- `avg_rating` : `round(AVG(stars), 2)` — `null` si aucun avis.
- `total_ratings` : `COUNT(*)` — 0 si aucun avis.
- Calculé à la volée (pas de cache sur le modèle Driver).

---

## Tests (17 nouveaux)

### `test_payouts.py` (12 tests)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_driver_create_payout_request` | ✅ |
| 2 | `test_driver_create_payout_zero_amount_returns_422` | ✅ |
| 3 | `test_driver_create_payout_negative_returns_422` | ✅ |
| 4 | `test_driver_create_payout_requires_driver_role` | ✅ |
| 5 | `test_driver_create_payout_requires_auth` | ✅ |
| 6 | `test_driver_list_payout_requests` | ✅ |
| 7 | `test_driver_list_payout_requires_auth` | ✅ |
| 8 | `test_admin_list_payout_requests` | ✅ |
| 9 | `test_admin_list_payout_requires_admin` | ✅ |
| 10 | `test_admin_approve_payout` | ✅ |
| 11 | `test_admin_reject_payout_with_note` | ✅ |
| 12 | `test_admin_payout_invalid_status_returns_422` | ✅ |
| 13 | `test_admin_payout_not_found_returns_404` | ✅ |

Wait — 13 tests dans test_payouts.py.

### `test_admin_ratings.py` (5 tests)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_admin_list_ratings_empty_initially` | ✅ |
| 2 | `test_admin_list_ratings_after_rating` | ✅ |
| 3 | `test_admin_list_ratings_requires_admin` | ✅ |
| 4 | `test_driver_profile_includes_avg_rating` | ✅ |
| 5 | `test_admin_drivers_list_includes_avg_rating` | ✅ |

**Total cumulatif : 174/174** (156 Sprint 14 + 18 Sprint 15)

---

## Frontends

### web-driver
- **Onglet 💰 Retraits** (3e onglet après Dispatch et Historique) :
  - Formulaire : saisie du montant + bouton "Demander le retrait"
  - Liste des demandes avec badge statut coloré (jaune/vert/rouge) + note admin si présente
- `createPayoutRequest` et `listPayoutRequests` ajoutés dans `api.js`.

### web-admin
- **Onglet 💸 Retraits** : liste paginée des demandes avec champ note + boutons Approuver/Rejeter (masqués si déjà traité).
- **Onglet ⭐ Avis** : liste paginée des avis avec étoiles colorées, email client, date.
- 3 nouvelles fonctions dans `api.js` : `adminListPayouts`, `adminUpdatePayoutStatus`, `adminListRatings`.
- `avg_rating` visible sur chaque chauffeur dans l'onglet Chauffeurs (champ retourné par l'API).

---

## Isolation frontends
Chaque frontend conserve son propre `api.js`, `App.jsx`, `styles.css`. Aucun code partagé.
