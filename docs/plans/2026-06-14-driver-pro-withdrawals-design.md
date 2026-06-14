# Driver & Professional Withdrawals (balance-capped) — Design + Plan

**Date:** 2026-06-14
**Status:** Approved (Option B)

## Goal

Permettre aux **drivers** et aux **professionnels** de créer des demandes de retrait (withdrawal) de leurs gains, **plafonnées au solde disponible** (validation serveur), sur les 4 frontends : `web-driver`, `mobile-driver`, `web-craft`, `mobile-craft`.

## Decisions (validées avec l'utilisateur)

1. **Apps** : web-driver, mobile-driver, web-craft, mobile-craft.
2. **Plafond** : le montant demandé ne peut pas dépasser le **solde disponible** (HTTP 422 sinon). S'applique au driver **et** au pro. ⚠️ Change le comportement driver actuel (aujourd'hui non plafonné, `amount ≥ 1` seulement).
3. **Modèle de données — Option B** : nouvelle table `professional_payout_requests` dédiée, **isolée** du flux driver existant (zéro modification de `payout_requests`). Duplication assumée du CRUD/endpoints/UI pour ne prendre aucun risque sur le flux driver en place.
4. **Wallet customer** : hors périmètre (vérification uniquement — existe en backend + web-customer, absent de mobile-customer).

## Définition du « solde disponible »

```
disponible = gains − Σ(retraits non rejetés : pending + approved + processed)
```
Déduire aussi les retraits `pending`/`approved` (pas seulement `processed`) empêche d'empiler plusieurs demandes qui, cumulées, dépasseraient le solde.

- **Driver** : `gains = gains_bruts − commission` (logique existante de `crud` balance ; commission via `commission_settings`). On ajoute `disponible_xof` au payload balance.
- **Professionnel** : `gains = Σ(price_cents des bids acceptés)` (cohérent avec `admin_professional_summary`). Pas de commission craft aujourd'hui → net = brut. Nouveau endpoint balance.

## Architecture

- Backend FastAPI : nouvelle table + modèle `ProfessionalPayoutRequest`, migration `0035`, CRUD pro isolé, endpoints pro, plafond ajouté côté driver, `available_xof` exposé.
- Frontends : chaque app garde son propre `api`/composant (règle d'isolation — zéro code partagé).
- Tests : pytest (Docker), tsc+jest (mobiles), vite build (webs).

---

## Plan de tâches

### Task 1 — Modèle + migration `professional_payout_requests`
- **Create** `apps/api/app/models/professional_payout_request.py` : `ProfessionalPayoutRequest` (id, professional_id FK→professionals, amount_cents, status pending|approved|rejected|processed|failed, note_admin, processed_at, created_at, updated_at) — calqué sur `PayoutRequest`.
- **Modify** `apps/api/app/models/__init__.py` : enregistrer le modèle.
- **Create** `apps/api/alembic/versions/0035_professional_payouts.py` : `create_table` + index sur professional_id, `down_revision="0034"`.
- **Verify** : `alembic upgrade head` dans le runner Docker ne casse pas (migration ↑/↓).

### Task 2 — Solde disponible (driver + pro) dans le CRUD
- **Modify** `apps/api/app/crud.py` :
  - balance driver : calculer `disponible_xof = gains_bruts − commission − Σ(payout pending|approved|processed)` et l'ajouter au dict retourné.
  - `get_professional_balance(db, auth_user_id)` → `{ professional_id, gains_cents, retraits_cents, disponible_cents }`.
- **Test** (endpoint, style TestClient) : driver avec gains et retraits → disponible correct ; pro idem.

### Task 3 — Création withdrawal plafonnée (driver)
- **Modify** `crud.create_payout_request` : 422 si `amount_xof > disponible` (réutilise le calcul Task 2). Conserver 422 si `≤ 0`.
- **Test** : 201 si ≤ disponible, 422 si > disponible, 422 si ≤ 0.

### Task 4 — Endpoints pro (create/list/balance)
- **Modify** `apps/api/app/crud.py` : `create_professional_payout_request` (plafond), `list_professional_payout_requests`.
- **Modify** `apps/api/app/main.py` :
  - `POST /v1/craft/professionals/me/payout-requests` (role professional, 201)
  - `GET  /v1/craft/professionals/me/payout-requests`
  - `GET  /v1/craft/professionals/me/balance`
  - Pydantic `ProPayoutResponse` / `ProBalanceResponse`.
- **Test** : create plafonné (201/422), list, balance, 403 pour non-pro.

### Task 5 — web-driver : afficher disponible + brider + gérer 422
- **Modify** `apps/web-driver/src/api.js` (balance déjà présent → exposer disponible) et `App.jsx` `PayoutSection` : afficher le disponible, `max` sur l'input, message d'erreur 422.
- **Verify** : `vite build`.

### Task 6 — web-craft : section withdrawal + solde (nouveau)
- **Modify** `apps/web-craft/src/api.js` : `getProBalance`, `createProPayout`, `listProPayouts`.
- **Modify** `apps/web-craft/src/App.jsx` : nouvelle section « Withdrawals » (solde, formulaire plafonné, historique).
- **Verify** : `vite build`.

### Task 7 — mobile-driver : écran withdrawal + solde (nouveau)
- **Modify** `apps/mobile-driver/src/api.ts` : `getBalance`, `createPayout`, `listPayouts`.
- **Create** écran/section withdrawal (solde, formulaire plafonné, historique) + entrée de navigation.
- **Verify** : `tsc --noEmit` + `jest`.

### Task 8 — mobile-craft : écran withdrawal + solde (nouveau)
- **Modify** `apps/mobile-craft/src/api.ts` : `getProBalance`, `createProPayout`, `listProPayouts`.
- **Create** écran/section withdrawal + entrée de navigation.
- **Verify** : `tsc --noEmit` + `jest`.

### Vérification finale
- Suite pytest complète verte (Docker).
- Builds web + tsc/jest mobiles OK.
- PR unique vers `main`.
