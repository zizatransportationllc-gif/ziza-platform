# ZIZA — Recette « Argent réel » (Stripe test mode) — WS7

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-06-14 |
| **Objet** | Recette de bout en bout des flux financiers en **Stripe test mode**, avant bascule des clés en LIVE. |
| **Référence** | `docs/go-live/2026-06-14-real-money-roadmap.md` (WS0–WS7). |

> La boucle d'argent est **couverte par un test automatisé** :
> `apps/api/tests/test_money_loop_e2e.py` (mock providers). Ce document décrit la
> recette **manuelle équivalente en test mode Stripe**, qui valide en plus le
> runtime réel (Checkout, webhooks signés, Connect, transfers, refunds).

## 0. Pré-requis (config test)

- Compte **Stripe** en mode **test** ; **Connect (Express)** activé.
- Variables d'environnement (API) :
  - `payment_provider=stripe`, `payout_provider=stripe`
  - `stripe_secret_key=sk_test_…`, `stripe_webhook_secret=whsec_…`
- Webhook test branché sur `…/v1/payments/webhook` (events : `checkout.session.completed`,
  `payment_intent.payment_failed`, `checkout.session.expired`). En local : `stripe listen --forward-to localhost:8000/v1/payments/webhook`.
- Cartes de test Stripe (`4242 4242 4242 4242`), comptes Connect de test.

## 1. Scénarios de recette (cocher)

### Encaissement course (WS1)
- [ ] Réserver + compléter une course, lancer le paiement → **Checkout Stripe test** s'ouvre.
- [ ] Payer avec `4242…` → le webhook signé arrive → l'intent passe **paid**, `trip.paid_at` posé.
- [ ] **Rejouer** le webhook (Stripe CLI `--resend`) → **idempotent** (pas de double effet).
- [ ] Paiement échoué (`4000 0000 0000 0002`) → intent **failed**.

### Top-up wallet (WS2)
- [ ] Lancer un top-up → Checkout test → payer → **wallet crédité uniquement après webhook**.
- [ ] Abandonner le Checkout → **aucun crédit**.
- [ ] Rejeu webhook → **pas de double crédit**.

### Payout Connect (WS3)
- [ ] Driver/pro : **« Set up payouts »** → onboarding Connect Express test complété.
- [ ] `GET /v1/payouts/connect/status` → `payouts_enabled = true`.
- [ ] Créer une demande de withdrawal (≤ solde, ≤ plafonds) → admin **approve** → **run batch** → **transfer** Stripe test créé, statut **processed**.
- [ ] Driver/pro **non onboardé** → batch **failed** (pas de transfer).

### Remboursement + intégrité (WS4)
- [ ] `POST /v1/admin/payments/{id}/refund` sur un paiement payé → **refund Stripe test** créé, intent **refunded**, idempotent.
- [ ] `GET /v1/admin/finance/reconciliation` → **`balanced = true`**, totaux cohérents.

### Conformité (WS5)
- [ ] Top-up / withdrawal au-dessus des plafonds AML → **422**.
- [ ] (Staging prod) webhook avec `payment_provider=mock` → **503** (garde signature).

### Observabilité (WS6)
- [ ] `GET /v1/admin/finance/metrics` → taux de succès & compteurs cohérents.
- [ ] `GET /v1/admin/finance/transactions` → feed des mouvements récents.
- [ ] `GET /v1/admin/finance/alerts` → alertes attendues (payout échoué, etc.), pas de `ledger_imbalance`.

## 2. Critères Go (bascule LIVE)

- [ ] Tous les scénarios §1 verts en **test mode**
- [ ] `test_money_loop_e2e.py` vert (CI)
- [ ] Réconciliation `balanced = true` après la recette
- [ ] Webhooks **signés** vérifiés ; rejeu **idempotent** prouvé (paiement, top-up, payout)
- [ ] Clés **LIVE** Stripe en Secret Manager ; **Connect live** activé
- [ ] Pays d'exploitation **compatible Stripe** (encaissement + payout) confirmé (P1)
- [ ] Recette **signée par la MOA**

> Tant qu'un critère est rouge → on reste en **test mode**. La bascule LIVE ne
> change que les **clés** ; le code est identique.

## 3. Couverture automatisée (rappel)

| Flux | Test |
|------|------|
| Encaissement course + idempotence | `test_payments.py`, `test_stripe_adapter.py` |
| Top-up réel + idempotence | `test_wallet.py` |
| Payout Connect (driver + pro) | `test_connect_payouts.py`, `test_payout_batch.py` |
| Refund + réconciliation | `test_ws4_refunds_reconciliation.py` |
| Plafonds AML + garde webhook prod | `test_ws5_aml_webhook.py` |
| Observabilité | `test_ws6_finance_observability.py` |
| **Boucle complète** | `test_money_loop_e2e.py` |

---

*Avancement roadmap argent réel : WS0–WS7 couverts côté code. Reste : clés Stripe
LIVE + activation Connect live + confirmation du marché, puis go-live prod.*
