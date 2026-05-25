# Sprint 16 — Profil utilisateur & Tarification dynamique

**Status:** ✅ Done — 189/189 tests passing

---

## Objectifs

1. **Profil utilisateur** — Chaque utilisateur authentifié peut lire et mettre à jour son nom d'affichage et son numéro de téléphone (`GET /v1/profile`, `PATCH /v1/profile`).
2. **Tarification dynamique (surge)** — L'admin contrôle le multiplicateur de tarification en temps réel via la table `platform_settings` ; l'endpoint `/v1/estimate` lit ce multiplicateur depuis la base de données.
3. **Frontend web-customer** — Onglet 👤 Profil avec formulaire nom/téléphone.
4. **Frontend web-admin** — Onglet ⚙️ Paramètres avec widget surge (lecture + modification en direct).

---

## Endpoints ajoutés / modifiés

| Méthode | Route                           | Rôle  | Description                                          |
|---------|---------------------------------|-------|------------------------------------------------------|
| GET     | `/v1/profile`                   | tous  | Lire le profil (email, rôle, nom, téléphone)         |
| PATCH   | `/v1/profile`                   | tous  | Mettre à jour nom et/ou téléphone                    |
| GET     | `/v1/admin/settings/surge`      | admin | Lire le multiplicateur de tarification actuel        |
| PATCH   | `/v1/admin/settings/surge`      | admin | Modifier le multiplicateur (1.0 – 5.0)               |
| POST    | `/v1/estimate`                  | tous  | **Mis à jour** : lit le surge depuis la DB (non statique) |

---

## Modèle de données

### Colonne ajoutées à `users`
| Colonne | Type         | Notes            |
|---------|--------------|------------------|
| name    | VARCHAR(128) | NULL = non défini |
| phone   | VARCHAR(32)  | NULL = non défini |

### Table `platform_settings` (nouvelle)
| Colonne    | Type        | Notes                                    |
|------------|-------------|------------------------------------------|
| key        | VARCHAR(64) | PK — ex. `surge_multiplier`             |
| value      | TEXT        | Valeur stockée en tant que chaîne        |
| updated_at | DATETIME    | Mis à jour à chaque écriture             |

Migration : `0011_add_profile_surge.py`

---

## Logique métier

### Profil utilisateur
- `GET /v1/profile` : retourne user_id, email, rôle, name, phone, created_at.
- `PATCH /v1/profile` : champs optionnels (`null` = ne pas modifier, chaîne vide = effacer).
- Validation Pydantic : `name` max 128 chars, `phone` max 32 chars.

### Tarification dynamique
- `get_surge_multiplier(db)` : lit `platform_settings WHERE key = 'surge_multiplier'` ; fallback sur `settings.fare_surge_multiplier` (1.0) si absent.
- `set_surge_multiplier(db, value)` : upsert ; valide 1.0 ≤ value ≤ 5.0 (422 sinon).
- `POST /v1/estimate` remplace `settings.fare_surge_multiplier` par `await crud.get_surge_multiplier(db)`.

---

## Tests (15 nouveaux)

### `test_profile.py` (8 tests)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_get_profile_returns_user_fields` | ✅ |
| 2 | `test_get_profile_requires_auth` | ✅ |
| 3 | `test_patch_profile_updates_name` | ✅ |
| 4 | `test_patch_profile_updates_phone` | ✅ |
| 5 | `test_patch_profile_updates_both` | ✅ |
| 6 | `test_patch_profile_requires_auth` | ✅ |
| 7 | `test_patch_profile_name_too_long_returns_422` | ✅ |
| 8 | `test_patch_profile_empty_body_is_noop` | ✅ |

### `test_surge.py` (7 tests)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_get_surge_default_is_1` | ✅ |
| 2 | `test_admin_get_surge_requires_admin` | ✅ |
| 3 | `test_admin_set_surge` | ✅ |
| 4 | `test_admin_set_surge_too_low_returns_422` | ✅ |
| 5 | `test_admin_set_surge_too_high_returns_422` | ✅ |
| 6 | `test_admin_patch_surge_requires_admin` | ✅ |
| 7 | `test_estimate_reflects_surge` | ✅ |

**Total cumulatif : 189/189** (174 Sprint 15 + 15 Sprint 16)

---

## Frontends

### web-customer
- **Onglet 👤 Profil** (5e onglet) : affiche l'email et le rôle ; formulaire pour saisir nom et téléphone.
- `getProfile` et `updateProfile` ajoutés dans `api.js`.

### web-admin
- **Onglet ⚙️ Paramètres** : affiche le multiplicateur actuel (coloré : vert/orange/rouge) ; champ numérique + bouton « Appliquer ».
- `adminGetSurge` et `adminSetSurge` ajoutés dans `api.js`.

---

## Isolation frontends
Chaque frontend conserve son propre `api.js`, `App.jsx`, `styles.css`. Aucun code partagé.
