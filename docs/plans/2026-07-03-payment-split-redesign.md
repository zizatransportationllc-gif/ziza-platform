# Refonte du système de paiement — split à l'encaissement + Stripe Issuing

**Date :** 2026-07-03
**Statut :** Plan (à valider avant implémentation)
**Périmètre :** ride-share + road-side (craft), backend + frontends + Stripe live

## Objectif

Passer d'un modèle « la plateforme retient les fonds → demande de retrait → batch payout »
à un **split automatique au moment de l'encaissement** via Stripe Connect (destination
charges), puis équiper chaque driver/pro d'une **carte de débit Stripe Issuing** adossée
à son solde Connect pour dépenser ses gains.

## Décisions validées avec l'utilisateur

1. **Ride-share — 50/50.** Le split driver/Ziza est **toujours 50 %/50 %** sur le net (prix − frais Stripe). L'ancienne commission par catégorie (15/18/20 %) est **supprimée**.
2. **Catégories = niveaux de prix, pas de commission.** `economy` = prix de base ; `comfort`/`premium` sont des **majorations payées par le client** (multiplicateurs déjà en place : 1.0 / 1.4 / 2.0). Le split 50/50 s'applique quel que soit le prix.
3. **Road-side — pro = 100 % de l'enchère.** Le client paie `enchère + 10 % + taxe`. Ziza garde `10 % + taxe − frais Stripe`.
4. **Split à l'encaissement.** Destination charges Connect : la part du payee part vers son compte Connect dès le paiement. On **abandonne** `PayoutRequest`/batch pour le split.
5. **Taxes (configurables en console admin) :**
   - Ride-share : **0,50 $ fixe par course** (assimilé taxe/redevance TNC NJ).
   - Road-side : **6,625 %** (sales tax NJ), configurable.
6. **Frais Stripe estimés** au moment de la charge : **2,9 % + 0,30 $** (configurable), réconciliation ultérieure possible sur le `balance_transaction` réel.
7. **Stripe Issuing dans le périmètre** : émission d'une carte de débit par payee, adossée à son solde Connect.

## Formules de répartition

Notation : `D` = prix ride affiché HT (economy × multiplicateur) ; `B` = enchère gagnante ;
`T` = taxe ; `F` = frais Stripe estimés = `round(0,029 × total_client) + 30` cents.

### Ride-share
```
T            = 50                       # 0,50 $ fixe (config)
total_client = D + T
F            = round(0.029 * total_client) + 30
net          = D - F
driver_amt   = net // 2                 # 50 % (arrondi plancher)
platform_amt = total_client - driver_amt   # = D + T - driver_amt (dont T à reverser)
```
`application_fee_amount = platform_amt` ; `transfer_data.destination = driver.stripe_account_id`.

### Road-side (craft)
```
fee_pct      = 10                       # % config
T            = round(B * 0.06625)       # 6,625 % config
platform_fee = round(B * fee_pct / 100)
total_client = B + platform_fee + T
F            = round(0.029 * total_client) + 30
pro_amt      = B                        # 100 % de l'enchère
platform_amt = total_client - pro_amt   # = platform_fee + T (dont T à reverser ; F sort du solde Ziza)
```
`application_fee_amount = platform_amt` ; `transfer_data.destination = professional.stripe_account_id`.

> **Note frais Stripe.** En destination charge, Stripe prélève `F` sur le **solde plateforme (Ziza)**,
> pas sur le payee. Donc le payee reçoit exactement `driver_amt` / `pro_amt`, et la marge nette
> réelle de Ziza = `platform_amt − F − T_reversée`. C'est cohérent avec les règles ci-dessus.

### Exemple ride (economy D = 2000 ¢)
`T=50 → total=2050 ; F=round(59.45)+30=89 ; net=1911 ; driver=955 ; platform=1095`.
Client paie **20,50 $**, driver reçoit **9,55 $**, Ziza garde 10,95 $ (dont 0,50 taxe, 0,89 frais → net ≈ 9,56 $).

### Exemple craft (enchère B = 8000 ¢)
`fee=800 ; T=round(530)=530 ; total=9330 ; F=round(270.57)+30=301 ; pro=8000 ; platform=1330`.
Client paie **93,30 $**, pro reçoit **80,00 $**, Ziza garde 13,30 $ (dont 5,30 taxe, 3,01 frais → net ≈ 4,99 $).

## État actuel (rappel du code)

- **Ride :** `Trip.fare_cents` = prix client (majoration gamme déjà appliquée). Encaissement via `payment_intents` (FK `trip_id` UNIQUE) → Checkout Session Stripe. Commission 15/18/20 % via `commission_settings`. Retrait driver → `payout_requests` → batch (`/v1/admin/payouts/run`).
- **Craft :** **aucun encaissement client** (pas de payment intent craft). Gains pro = Σ `price_cents` des bids `accepted`. Retrait pro → `professional_payout_requests` → batch.
- **Connect :** drivers **et** pros ont `stripe_account_id` (Express), onboarding link + statut déjà codés (`stripe_connect.py`, `/v1/payouts/connect/*`).
- **Adapter Stripe :** `create_checkout` (Checkout Session, sans `transfer_data`) ; webhook `checkout.session.completed` → `paid`, pose `trips.paid_at`.

---

## Plan par phases

### Phase A — Fondations : config + moteur de calcul (backend pur, sans Stripe live)

**A1 — Paramètres de configuration**
- **Modify** `apps/api/app/config.py` : ajouter défauts
  - `ride_tax_flat_cents: int = 50`
  - `craft_tax_pct: float = 6.625`
  - `craft_platform_fee_pct: float = 10.0`
  - `stripe_fee_pct: float = 2.9`, `stripe_fee_fixed_cents: int = 30`
  - `ride_driver_split_pct: int = 50`
- **Modify** table/CRUD `platform_settings` (déjà utilisée pour le pricing via `PATCH /v1/admin/settings/pricing`) : persister ces valeurs pour override runtime admin.

**A2 — Endpoints admin (console)**
- **Modify** `apps/api/app/main.py` : `GET`/`PATCH /v1/admin/settings/payments` (taxes ride/craft, fee craft %, frais Stripe %, split %). Rôle admin. Réutilise le pattern `settings/pricing`.
- **Test** : lecture/écriture, validation bornes (0 ≤ pct ≤ 100 ; montants ≥ 0), 403 non-admin.

**A3 — Moteur de calcul isolé**
- **Create** `apps/api/app/payment/split.py` :
  - `compute_ride_split(fare_cents, cfg) -> RideSplit` (dataclass : `base, tax, total_client, stripe_fee_est, driver_amount, platform_amount`).
  - `compute_craft_split(bid_cents, cfg) -> CraftSplit` (`base, platform_fee, tax, total_client, stripe_fee_est, pro_amount, platform_amount`).
  - Fonctions **pures** (pas d'I/O) ; `cfg` lu depuis settings/platform_settings.
- **Test** `apps/api/tests/test_payment_split.py` : cas des exemples ci-dessus + arrondis + invariants (`driver_amount + platform_amount == total_client`, `pro_amount + platform_amount == total_client`, montants ≥ 0).

---

### Phase B — Encaissement ride via destination charge

**B1 — Adapter Stripe : porter transfer_data + application_fee**
- **Modify** `apps/api/app/payment/stripe_adapter.py` : `create_checkout(..., destination=None, application_fee_cents=None, breakdown_label=None)`. Ajoute au payload Checkout :
  - `payment_intent_data[application_fee_amount]`
  - `payment_intent_data[transfer_data][destination]`
  - lignes détaillées (prix + taxe) pour affichage.
- **Modify** `mock.py` : accepter/ignorer les nouveaux kwargs, retourner un ref déterministe.
- **Test** `test_stripe_adapter.py` : payload contient bien `application_fee_amount` et `transfer_data[destination]` quand fournis.

**B2 — Modèle PaymentIntent enrichi + migration**
- **Modify** `apps/api/app/models/payment.py` : ajouter `base_cents, tax_cents, stripe_fee_est_cents, payee_amount_cents, platform_amount_cents, payee_account_id`.
- **Create** `apps/api/alembic/versions/00XX_payment_split_fields.py` : `add_column` nullable (rétro-compatible), `down_revision` = dernière tête.
- **Verify** : `alembic upgrade head` / `downgrade` OK dans le runner Docker.

**B3 — create_payment_intent : split + garde onboarding**
- **Modify** `apps/api/app/crud.py::create_payment_intent` :
  - calcul via `compute_ride_split`.
  - **Garde** : driver doit avoir `stripe_account_id` + `payouts_enabled` (via `stripe_connect.get_account_status`) sinon **409** (« driver pas encore onboardé »).
  - passe `destination` + `application_fee_cents` à l'adapter ; persiste le breakdown.
  - montant chargé = `total_client` (et non plus `fare_cents` brut).
- **Test** `test_payments.py` : montant client = D+T ; `payee_amount` = 50 % du net ; 409 si driver non onboardé ; idempotence conservée.

**B4 — Retrait de la commission ride**
- **Modify** `crud.py` : `_driver_gains_and_payouts` / `get_driver_balance` ne déduisent plus `commission_settings` pour le ride (le split est déjà fait à l'encaissement). Voir Phase D pour la sémantique du solde.
- **Note** : `commission_settings` conservé en base (pas de drop destructif) mais **non appliqué** au ride ; documenté comme déprécié.

---

### Phase C — Encaissement craft (flux client nouveau)

**C1 — Modèle + migration `craft_payment_intents`** (isolé, pattern Option B)
- **Create** `apps/api/app/models/craft_payment.py` : `CraftPaymentIntent` (id, `craft_request_id` FK UNIQUE, `bid_id`, amounts breakdown craft, provider, provider_ref, status, checkout_url, payee_account_id, timestamps).
- **Modify** `models/__init__.py` ; **Create** migration `00XX_craft_payments.py`.
- **Verify** : migration ↑/↓.

**C2 — Endpoints paiement craft**
- **Modify** `apps/api/app/main.py` :
  - `POST /v1/craft/requests/{id}/payment/intent` (customer, après bid accepté) → crée l'intent, `compute_craft_split`, destination = pro, `application_fee`. **Garde** onboarding pro (409).
  - `GET /v1/craft/requests/{id}/payment` (statut).
  - Brancher le **webhook existant** `/v1/payments/webhook` pour marquer aussi les intents craft `paid` (dispatch trip vs craft selon le ref).
- **Modify** `crud.py` : `create_craft_payment_intent`, `get_craft_payment`, extension `confirm_payment` pour craft.
- **Test** `test_craft_payment.py` : montant = B + 10 % + taxe ; pro reçoit B ; platform = 10 %+taxe ; 409 pro non onboardé ; webhook → paid ; idempotence.

**C3 — Solde pro = reflet Connect**
- **Modify** `get_professional_balance` : voir Phase D (l'argent est déjà chez le pro).

---

### Phase D — Retrofit du solde et retrait

> Le split étant fait à l'encaissement, l'argent des payees est **dans leur solde Connect**,
> plus dans un ledger interne. Objectif : éviter de casser les écrans existants tout en
> reflétant la nouvelle réalité.

**D1 — Lecture du solde Connect**
- **Create** `stripe_connect.get_balance(account_id) -> {available, pending}` (fake déterministe en dev/CI).
- **Modify** `get_driver_balance` / `get_professional_balance` : exposer `connect_available_cents` / `connect_pending_cents` en plus des champs actuels ; marquer `disponible` legacy comme informatif.

**D2 — Dépréciation du batch pour le split**
- **Modify** `/v1/admin/payouts/run` : ne traite plus les gains split (déjà versés). Conserver la mécanique **uniquement** pour corrections manuelles/exceptionnelles, ou la marquer dépréciée.
- **Test** : batch n'émet aucun transfert pour des gains déjà versés à l'encaissement.

---

### Phase E — Stripe Issuing (cartes de débit)

**E1 — Activation & modèle**
- Pré-requis Stripe : Issuing activé sur la plateforme ; comptes Connect en `treasury`/`issuing` selon la config choisie (à cadrer avec Stripe : Issuing sur solde Connect Express US).
- **Create** `apps/api/app/payment/stripe_issuing.py` : `create_cardholder(account_id, name, email, address)`, `create_card(cardholder_id, account_id, spending_limit=None)`, `get_card(card_id)`, `set_card_status(card_id, active|inactive)`. Fakes déterministes sans `stripe_secret_key`.
- **Create** modèle `IssuingCard` (id, owner: driver_id|professional_id, stripe_cardholder_id, stripe_card_id, last4, status, created_at) + migration.

**E2 — Endpoints carte**
- **Modify** `main.py` :
  - `POST /v1/payouts/issuing/card` (driver/pro : émettre sa carte, après onboarding).
  - `GET /v1/payouts/issuing/card` (statut, last4).
  - `PATCH /v1/payouts/issuing/card/status` (activer/geler).
- **Test** `test_issuing.py` : émission, idempotence (une carte active par payee), gel/réactivation, 409 si non onboardé, fakes en CI.

**E3 — KYC / conformité**
- Vérifier exigences Issuing (cardholder KYC via Connect), documenter dans le runbook GCP/finance.

---

### Phase F — Frontends

**F1 — Customer (web + mobile) : détail du prix**
- Afficher au paiement le **breakdown** (prix, taxe, total). Craft : prix + frais 10 % + taxe.
- Apps : `web-customer`, `mobile-customer` (ride) ; parcours de paiement craft côté customer.

**F2 — Driver/Pro : gains auto-versés + carte**
- Écrans earnings/withdrawals : refléter « versé automatiquement », afficher solde Connect, retirer/adoucir le formulaire de retrait.
- Gestion de la carte Issuing (statut, last4, geler).
- Apps : `web-driver`, `mobile-driver`, `web-craft`, `mobile-craft`.

---

### Phase G — Réconciliation (post-lancement)

- Job/endpoint qui compare `stripe_fee_est_cents` au **frais réel** du `balance_transaction`, écrit un écart en compta, alerte si dérive. Étend `test_ws4_refunds_reconciliation` / `test_ws6_finance_observability`.

---

## Ordre recommandé & jalons

1. **A** (calcul + config admin) — fondation testable sans Stripe. **Jalon : moteur validé en TEST mode.**
2. **B** (ride destination charge) — première boucle argent réelle en TEST.
3. **C** (craft encaissement) — nouvelle source de revenu Ziza.
4. **D** (retrofit solde/retrait) — cohérence des écrans.
5. **E** (Issuing) — cartes de débit.
6. **F** (frontends) — en parallèle de B/C/D selon avancement.
7. **G** (réconciliation) — avant bascule LIVE.

## Points ouverts / risques

- **Onboarding obligatoire avant encaissement** : si un driver/pro accepte une course/enchère sans compte Connect actif, le paiement échoue (409). Prévoir le blocage en amont (empêcher d'accepter tant que non onboardé) — à décider.
- **Fiscalité** : 0,50 $/course et 6,625 % sont des hypothèses par défaut ; à valider avec le comptable (assujettissement réel du TNC vs réparation en NJ). Config admin déjà prévue.
- **Arrondis** : le split plancher (`// 2`) fait que Ziza absorbe le cent résiduel — acceptable, testé.
- **Issuing US** : le montage exact (Issuing adossé au solde Connect Express vs Treasury) doit être confirmé côté Stripe avant E.
- **Migration compta** : les gains historiques (pré-refonte) restent dans le ledger interne/retrait batch ; ne pas les re-verser. D2 doit les exclure.

## Vérification finale (par phase)

- Suite pytest complète verte (Docker runner) après chaque phase backend.
- Builds `vite` (webs) + `tsc --noEmit`/`jest` (mobiles) pour F.
- Boucle argent TEST bout-en-bout (`test_money_loop_e2e`) mise à jour pour le nouveau split.
- PR par phase vers `main`.
