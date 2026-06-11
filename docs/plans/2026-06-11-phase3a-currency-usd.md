# Phase 3a — Devise USD / cents (backend)

- **Date** : 2026-06-11
- **Branche** : `phase3-currency-usd` (basée sur `main`)
- **Décision** : devise de base **USD**, montants en **cents entiers** ; **prix de base + prix par mile paramétrables depuis la console admin**.

## Contexte

Le backend pricait en **XOF** (base 500, 150/km) alors que les frontends affichent
`formatUSD(n) = n/100` : un fare de `500` s'affichait **$5.00** au lieu de ~$0.85.
Incohérence corrigée en canonisant toute la monnaie en **cents USD**.

## Fait (backend, vérifié)

- **`pricing.py`** : `calculate_fare(distance_km, base_fare_cents, per_mile_cents, surge)`
  → cents USD, **par mile** (`miles = km / 1.609344`).
- **`config.py`** : `fare_base_xof`/`fare_per_km_xof` → `fare_base_cents` (250 = $2.50) /
  `fare_per_mile_cents` (175 = $1.75). Ce sont des **défauts** ; l'admin les surcharge.
- **`crud.py`** : `get_pricing` / `set_pricing` via `platform_settings`
  (clés `base_fare_cents` / `per_mile_cents`), même pattern que `get/set_surge_multiplier`.
- **Endpoint admin** (ce que pilotera la console) :
  `GET/PATCH /v1/admin/settings/pricing` (rôle admin) → `{base_fare_cents, per_mile_cents, currency:"USD"}`.
- **`/v1/estimate`** : lit le pricing admin, renvoie `currency: "USD"`.
- **`models/payment.py`** : devise par défaut `USD`.
- Réponses API (`EstimateResponse`, `PaymentIntentResponse`) : `currency` par défaut `USD`.

**Vérification** : suite complète **453 passed** dans Docker (python:3.12). La maths
aval (commission = fare × rate%, wallet, payouts) est agnostique à l'unité → porte
désormais des cents sans changement de logique.

## Choix transitoire (important)

Les **noms de champs `*_xof`** sur le wire (`fare_xof`, `amount_xof`, …) sont
**conservés en 3a** pour ne pas casser les 9 frontends qui les lisent encore. Ils
portent désormais des **cents USD**. Le renommage `*_xof → *_cents` est coordonné
backend+frontends en **Phase 3b**.

## Follow-ups (Phase 3b)

- Renommer `*_xof → *_cents` côté backend **et** les 9 frontends, en une passe coordonnée.
- Frontends : `formatUSD` est déjà en `/100` → cohérent une fois le backend en cents.
  Vérifier l'affichage end-to-end (apps qui tournent).
- **Distance** : les frontends affichent "mi" mais le backend renvoie `distance_km`.
  Décider d'unifier (afficher des miles ou renvoyer des miles).
- **`payment/cinetpay.py`** envoie encore `currency: "XOF"` (provider régional) — hors
  scope USD-first ; à traiter si CinetPay reste utilisé (sinon Stripe pour l'USD).
- Console admin (web-admin) : ajouter l'écran de réglage base/par-mile (consomme
  `/v1/admin/settings/pricing`).
