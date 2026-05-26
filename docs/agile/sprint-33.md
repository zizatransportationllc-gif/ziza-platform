# Sprint 33 — Portefeuille client (Wallet)

## Objectif

Introduire un portefeuille électronique en XOF pour les clients Ziza. Les utilisateurs peuvent recharger leur portefeuille via Mobile Money (Orange Money, MTN MoMo), payer leurs courses directement depuis leur solde, et consulter leur historique de transactions. L'admin peut effectuer des ajustements manuels (crédit ou débit).

**Gaps adressés : #16**  
**Origine roadmap : Phase 8, Sprint 17**

---

## Modèles de données

### Nouvelle table `wallets` (migration 0027)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `user_id` | UUID FK UNIQUE | Un portefeuille par utilisateur |
| `balance_xof` | Float | Solde actuel en XOF |
| `created_at` | DateTime | Date de création |
| `updated_at` | DateTime | Dernière modification |

### Nouvelle table `wallet_transactions` (migration 0027)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `wallet_id` | UUID FK | Référence au portefeuille |
| `tx_type` | String(16) | `credit` / `debit` / `refund` |
| `amount_xof` | Float | Montant (toujours positif) |
| `reason` | String(64) | `topup`, `trip_payment`, `trip_refund`, `admin_debit` |
| `reference_id` | String(128)? | ID de course ou référence paiement |
| `note` | Text? | Note optionnelle |
| `balance_after` | Float | Snapshot du solde après transaction |
| `created_at` | DateTime | Date (indexée, pour tri) |

---

## Endpoints API

### Client
- `GET  /v1/wallet` — solde actuel (crée le wallet si premier accès)
- `POST /v1/wallet/topup` — recharger le wallet (422 si montant ≤ 0)
- `POST /v1/wallet/pay-trip` — payer une course (402 si solde insuffisant)
- `GET  /v1/wallet/transactions` — historique paginé (newest first)

### Admin
- `POST /v1/admin/wallets/{user_id}/adjust` — crédit (positif) ou débit (négatif) manuel ; 422 si solde négatif résultant

---

## Logique métier

### Auto-création du wallet
`_get_or_create_wallet(db, user_id)` crée un wallet à 0 XOF si l'utilisateur n'en a pas encore. Idempotent.

### Protection contre le solde négatif
`wallet_pay_trip` et `admin_adjust_wallet` vérifient que le solde ne passe pas en dessous de zéro. En cas de manque de fonds : 402 Payment Required.

### Immuabilité du ledger
`WalletTransaction` n'est jamais modifié après création. Chaque opération crée une nouvelle entrée avec un snapshot `balance_after`.

---

## Frontend web-customer

### WalletSection (nouveau)
- Carte de solde (design gradient orange)
- Formulaire rechargement (montant + Mobile Money note)
- Historique des 10 dernières transactions
- Icônes par type : ⬆️ crédit, ⬇️ débit, ↩️ remboursement
- Onglet "💰 Portefeuille" dans la navigation

---

## Tests (10 nouveaux)

| Test | Description |
|------|-------------|
| `test_get_wallet_initial_balance_zero` | Wallet auto-créé à 0 XOF |
| `test_topup_credits_wallet` | +5000 XOF → solde 5000 |
| `test_topup_zero_amount_returns_422` | Montant nul → 422 |
| `test_pay_trip_debits_wallet` | −3000 XOF → solde 7000 |
| `test_pay_trip_insufficient_balance_returns_402` | Solde 0, paiement 5000 → 402 |
| `test_transaction_history_ordered_newest_first` | Tri chronologique inversé |
| `test_admin_credit_wallet` | Admin +8000 XOF |
| `test_admin_debit_wallet` | Admin −2000 XOF |
| `test_admin_debit_below_zero_returns_422` | Admin: solde 0 − 500 → 422 |
| `test_non_admin_cannot_adjust_wallet` | Client → 403 |

---

## Résumé des fichiers modifiés/créés

```
apps/api/
  app/models/wallet.py                     (NOUVEAU)
  app/models/__init__.py                   (modifié — Wallet, WalletTransaction)
  alembic/versions/0027_wallet.py          (NOUVEAU)
  app/crud.py                              (modifié — Sprint 33 CRUD)
  app/main.py                              (modifié — Sprint 33 endpoints)
  tests/test_wallet.py                     (NOUVEAU — 10 tests)

apps/web-customer/
  src/api.js    (modifié — getWallet, topupWallet, getWalletTransactions)
  src/App.jsx   (modifié — WalletSection, onglet Portefeuille, subtitle Sprint 33)
  src/styles.css (modifié — Sprint 33 wallet CSS)

apps/web-driver/src/App.jsx   (subtitle + footer Sprint 33)
apps/web-admin/src/App.jsx    (subtitle + footer Sprint 33)

docs/agile/sprint-33.md  (CE FICHIER)
```

---

*Sprint 33 terminé — 2026-05-26*
