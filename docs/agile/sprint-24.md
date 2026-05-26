# Sprint 24 — Paiement client

**Durée :** ~1 semaine  
**Objectif :** Le client peut payer un trajet terminé via un prestataire adapté au marché ivoirien (CinetPay) ou international (Stripe). Le paiement est tracé en base de données et confirmé via webhook.  
**Gap adressé :** #8 — Paiement client absent (roadmap Phase 5, Sprint 11)

---

## Livrables

| # | Livrable | Statut |
|---|---|---|
| 1 | `app/models/payment.py` — modèle `PaymentIntent` | ✅ |
| 2 | `app/models/trip.py` — colonne `paid_at` | ✅ |
| 3 | `app/payment/` — package adaptateurs (base, mock, cinetpay, stripe) | ✅ |
| 4 | `app/config.py` — settings paiement (`payment_provider`, clés CinetPay/Stripe) | ✅ |
| 5 | `app/crud.py` — `create_payment_intent`, `confirm_payment`, `get_payment_intent`, `get_trip_payment` | ✅ |
| 6 | `POST /v1/payments/intent` — crée / retourne un intent pour un trip `completed` | ✅ |
| 7 | `GET /v1/payments/{intent_id}` — statut d'un intent | ✅ |
| 8 | `POST /v1/payments/webhook` — callback prestataire (confirme ou rejette) | ✅ |
| 9 | `GET /v1/trips/{trip_id}/payment` — raccourci statut paiement du trip | ✅ |
| 10 | `TripResponse.paid_at` — champ ISO-8601 null jusqu'à confirmation | ✅ |
| 11 | `AdminStats.payments` — total_paid + total_paid_xof | ✅ |
| 12 | Migrations Alembic `0019_payment_intents`, `0020_trip_paid_at` | ✅ |
| 13 | web-customer : `PaymentSection` — bouton Payer + simulation mock + badge "✅ Payé" | ✅ |
| 14 | Tests : 20 tests (15 + 3 + 2) → **320 tests au total** | ✅ |

---

## Modèle de données

### Table `payment_intents` (migration 0019)

```
id              UUID        PK
trip_id         UUID        FK trips.id  UNIQUE
amount_xof      INTEGER     NOT NULL
currency        VARCHAR(8)  default "XOF"
provider        VARCHAR(32) -- "cinetpay" | "orange_money" | "stripe" | "mock"
provider_ref    VARCHAR(128) NULL  -- ID transaction externe (indexé)
status          VARCHAR(32) -- pending | paid | failed | refunded
checkout_url    TEXT        NULL  -- URL de paiement renvoyée au client
created_at      DATETIME(tz)
updated_at      DATETIME(tz)
```

### Colonne `trips.paid_at` (migration 0020)

```
paid_at  DATETIME(tz)  NULL  -- NULL jusqu'à confirmation webhook
```

---

## Endpoints API

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/payments/intent` | customer | Crée un intent + URL de paiement (idempotent) |
| `GET` | `/v1/payments/{intent_id}` | customer | Statut de l'intent |
| `POST` | `/v1/payments/webhook` | system | Callback prestataire → confirme ou rejette |
| `GET` | `/v1/trips/{trip_id}/payment` | customer | Raccourci : état de paiement du trip |

**Règles métier :**
- Trip doit être `completed` (422 sinon)
- Un seul intent par trip (idempotence — retourne l'existant si déjà créé)
- Webhook avec payload JSON invalide → 400
- Webhook avec `provider_ref` inconnu → 404
- Après confirmation webhook → `trips.paid_at` = now, `payment_intents.status = paid`
- `TripResponse` inclut `paid_at` (null jusqu'à confirmation)

---

## Adaptateur de paiement

```
PaymentAdapter (Protocol)
├── MockPaymentAdapter   — dev / CI, pas de signature, URL localhost
├── CinetPayAdapter      — CinetPay (leader Afrique de l'Ouest), HMAC-SHA256
└── StripeAdapter        — cartes internationales, Stripe-Signature header
```

Sélection via `settings.payment_provider` ("mock" par défaut).

---

## web-customer — PaymentSection

```
trip.status === "completed"
  ↓
PaymentSection:
  ┌── intent inexistant ─────────────────────────────────┐
  │  Bouton "💳 Payer {fare_xof} XOF"                    │
  └──────────────────────────────────────────────────────┘
  ┌── intent.status = pending ───────────────────────────┐
  │  Carte "Paiement en attente {amount_xof} XOF"        │
  │  [mock] Bouton "🧪 Simuler le paiement (dev)"        │
  │  [prod] Lien "Payer sur cinetpay"                    │
  │  → polling GET /v1/trips/{id}/payment toutes les 5s  │
  └──────────────────────────────────────────────────────┘
  ┌── intent.status = paid ──────────────────────────────┐
  │  Badge "✅ Payé {amount_xof} XOF"                    │
  └──────────────────────────────────────────────────────┘
```

---

## Couverture tests

| Fichier | Tests | Détail |
|---------|-------|--------|
| `tests/test_payments.py` | 15 | intent création, trip non completed → 422, mauvais customer → 403, trip inconnu → 404, webhook confirm → paid, webhook invalid JSON → 400, provider_ref inconnu → 404, intent idempotent, GET statut, trip payment shortcut, paid_at set |
| `tests/test_trips.py` | +3 | paid_at null à la création, paid_at null après completion (avant webhook), paid_at renseigné après webhook |
| `tests/test_admin_stats.py` | +2 | payments section présente, total_paid + total_paid_xof incrémentés après webhook |

**Total : 300 + 20 = 320 tests.**

---

## Critères de validation

- [x] `POST /v1/payments/intent` sur un trip `completed` → 201 avec `checkout_url`
- [x] Double appel → retourne l'intent existant (idempotence)
- [x] Webhook mock confirme → `trip.paid_at` renseigné
- [x] Webhook payload JSON invalide → 400
- [x] Webhook `provider_ref` inconnu → 404
- [x] Trip non `completed` → 422
- [x] `TripResponse.paid_at` = null avant paiement
- [x] `AdminStats.payments` inclut `total_paid` et `total_paid_xof`
- [x] Frontend affiche bouton "Payer" après statut `completed`
- [x] Frontend affiche "✅ Payé" après confirmation
- [x] Bouton "🧪 Simuler" en mode mock

---

## GCP — activation paiement en production

1. Configurer les secrets dans Secret Manager :
   ```bash
   echo -n "CINETPAY_API_KEY_VALUE" | gcloud secrets create cinetpay-api-key --data-file=-
   echo -n "CINETPAY_SITE_ID_VALUE" | gcloud secrets create cinetpay-site-id --data-file=-
   ```
2. Mettre à jour le déploiement Cloud Run :
   ```bash
   gcloud run services update ziza-api \
     --update-env-vars PAYMENT_PROVIDER=cinetpay \
     --update-secrets CINETPAY_API_KEY=cinetpay-api-key:latest \
     --update-secrets CINETPAY_SITE_ID=cinetpay-site-id:latest
   ```
3. Enregistrer l'URL webhook `https://api.ziza.ci/v1/payments/webhook` dans le backoffice CinetPay.
