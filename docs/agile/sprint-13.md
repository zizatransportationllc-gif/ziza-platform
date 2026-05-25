# Sprint 13 — Trip History · Driver Online Presence · Admin Assistance Panel

**Status:** ✅ Done — 139/139 tests passing

---

## Objectifs

1. **Présence chauffeur** — `PUT /v1/drivers/me/online` (toggle en ligne/hors ligne) + `GET /v1/drivers/me/profile`.
2. **Historique des courses chauffeur** — `GET /v1/trips/driver/history` (paginé, terminées/annulées).
3. **Historique des courses client** — `GET /v1/trips` supporte désormais `limit`/`offset`.
4. **Admin : liste des assistances** — `GET /v1/admin/assistance` (paginé).
5. **Frontend web-driver** — toggle En ligne/Hors ligne + onglet Historique.
6. **Frontend web-customer** — onglet 📜 Mes trajets (liste paginée).
7. **Frontend web-admin** — onglet 🆘 Assistances (liste paginée).

---

## Endpoints ajoutés / modifiés

| Méthode | Route                       | Rôle     | Description                                        |
|---------|-----------------------------|----------|----------------------------------------------------|
| GET     | `/v1/drivers/me/profile`    | driver   | Profil + statut `is_online`                        |
| PUT     | `/v1/drivers/me/online`     | driver   | Basculer en ligne / hors ligne `{ "online": bool }`|
| GET     | `/v1/trips/driver/history`  | driver   | Courses terminées/annulées, paginées               |
| GET     | `/v1/trips`                 | customer | Ajout `limit` / `offset`                           |
| GET     | `/v1/admin/assistance`      | admin    | Toutes les demandes d'assistance, paginées         |

---

## Modèle de données

### `drivers` (modifiée)
- Ajout : `is_online BOOLEAN NOT NULL DEFAULT 0`
- Migration : `0008_add_driver_is_online.py`

---

## Tests (16 nouveaux — `test_history.py`)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_driver_set_online_true` | ✅ |
| 2 | `test_driver_set_online_false` | ✅ |
| 3 | `test_driver_online_requires_driver_role` | ✅ |
| 4 | `test_driver_online_requires_auth` | ✅ |
| 5 | `test_driver_get_profile_shape` | ✅ |
| 6 | `test_driver_profile_requires_driver_role` | ✅ |
| 7 | `test_driver_trip_history_empty` | ✅ |
| 8 | `test_driver_trip_history_after_complete` | ✅ |
| 9 | `test_driver_trip_history_pagination` | ✅ |
| 10 | `test_driver_trip_history_requires_driver_role` | ✅ |
| 11 | `test_admin_list_assistance_shape` | ✅ |
| 12 | `test_admin_list_assistance_after_request` | ✅ |
| 13 | `test_admin_list_assistance_pagination` | ✅ |
| 14 | `test_admin_list_assistance_requires_admin_role` | ✅ |
| 15 | `test_customer_trip_history_paginated` | ✅ |
| 16 | `test_customer_trip_history_requires_auth` | ✅ |

**Total cumulatif : 139/139**

---

## Frontends

### web-driver
- **Toggle en ligne/hors ligne** : bouton pill dans le dashboard (vert = En ligne, gris = Hors ligne). Quand hors ligne, le panneau Dispatch affiche une notice et cache les missions disponibles.
- **Onglet 📋 Historique** : liste paginée des courses terminées/annulées avec statut, montant, distance et date.
- Ajout de `getDriverProfile`, `setDriverOnline`, `listDriverTripHistory` dans `api.js`.

### web-customer
- **Onglet 📜 Mes trajets** : liste paginée des courses (toutes, ordre décroissant). Affiche statut, montant, distance, durée et date.
- Ajout de `listMyTrips` dans `api.js`.

### web-admin
- **Onglet 🆘 Assistances** : liste paginée de toutes les demandes d'assistance avec type, statut coloré, email client, ETA et note.
- Ajout de `adminListAssistance` dans `api.js`.

---

## Isolation frontends
Chaque frontend conserve son propre `api.js`, `App.jsx`, `styles.css`. Aucun code partagé.
