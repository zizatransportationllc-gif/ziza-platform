# Stripe Issuing-on-Connect — backlog (remaining work)

**Date:** 2026-07-04
**Status:** Backlog (account type fixed in Sprint 71; the rest below is deferred)

## Context

The payee's debit card (phase E, PR #86) is issued via Stripe **Issuing**. Research
of the Stripe docs (`docs.stripe.com/issuing/connect`) surfaced that the initial
implementation is incomplete for real (LIVE/TEST) Stripe:

- Issuing requires **Custom** connected accounts (platform-controlled, platform
  owns requirement collection and **loss liability**). Express accounts cannot
  use Issuing.
- The connected account must request the **`card_issuing`** capability.
- The account must accept the **Issuing Terms of Service**
  (`settings.card_issuing.tos_acceptance`).
- The card spends from a **separate Issuing balance**, NOT the main Connect
  balance. The Issuing balance must be **funded** (moved from the account's main
  balance) before the card works.

## Done (Sprint 71)

- `stripe_connect.create_connected_account` now creates a **Custom** account
  (controller config: `stripe_dashboard.type=none`, `fees.payer=application`,
  `losses.payments=application`, `requirement_collection=application`) and
  requests `transfers` + `card_issuing`. Hosted onboarding (`create_account_link`)
  collects KYC + Issuing ToS.

## Remaining (deferred)

1. **Issuing balance funding** — the hard part. The split lands in the payee's
   **main** Connect balance; the card spends the **Issuing** balance. Options:
   - periodic sweep (main → Issuing balance) via the funding API, or
   - fund on demand around card usage.
   Until this exists, an issued card has a $0 Issuing balance and cannot spend.
   Refs: `docs.stripe.com/issuing/connect/funding`, `.../issuing/funding/balance`.

2. **ToS acceptance verification** — confirm hosted onboarding records
   `settings.card_issuing.tos_acceptance.date`; otherwise accept ToS via the
   Accounts update API before issuing a card. Re-check on the 29-day
   re-verification / ToS-cleared flow.

3. **Capability gating** — before issuing a card, confirm the account's
   `card_issuing` capability is `active` (it may be `pending`/`inactive` until
   KYC + ToS complete). Currently `stripe_issuing.issue_issuing_card` only checks
   `payouts_enabled`.

4. **Compliance / loss liability** — Custom accounts put dispute/fraud/negative-
   balance losses on Ziza. Define the operational process + real-time
   authorization controls (`spending_controls`).

5. **Cardholder KYC address** — `create_cardholder` currently sends a placeholder
   US billing address; wire the payee's real address (from profile / onboarding).

6. **Migration of existing Express accounts** — any connected accounts created
   before Sprint 71 are Express and cannot use Issuing; they must be recreated as
   Custom (Issuing does not work on existing Express accounts).
