# ZIZA — Roadmap « Argent réel »

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | 2026-06-14 |
| **Auteur** | MOA / Product Owner — assisté Claude Code |
| **Objectif** | Faire passer la plateforme d'un argent **simulé (mock)** à des **flux financiers réels** : encaissement, wallet, reversement. |
| **Référence** | Complète `docs/go-live/2026-06-14-go-live-readiness.md` (écarts G1–G4). |

> « Argent réel » = un utilisateur paie réellement, un driver/pro est réellement
> payé, et chaque centime est traçable et réconcilié. Tant qu'un seul maillon est
> en `mock`, on n'est pas à argent réel.

## Décisions MOA actées (v1.1)

| Réf | Décision | Conséquence |
|---|---|---|
| **D1 — Devise** | **USD** comme base (conversions multi-devises plus tard) | Tous les montants en **USD cents** ; nommage `*_cents` (ambiguïté `*_xof` **levée — fait, PR #27**). |
| **D2 — Encaissement** | **Stripe** | `StripeAdapter` (déjà codé) devient le rail principal ; CinetPay/mobile money repoussés (option future marché FCFA). |
| **D3 — Reversement** | **Stripe (Connect)** | Payout marketplace via **Stripe Connect** (comptes connectés driver/pro) ; remplace le *stub* Orange Money. |

> ⚠️ **À valider (dépendance externe)** : la **couverture géographique de Stripe**
> pour l'encaissement **et surtout les payouts Connect** dépend du pays
> d'exploitation. Stripe ne reverse pas vers tous les pays/banques (Afrique de
> l'Ouest notamment limitée). Le choix Stripe implique soit un **marché supporté
> par Stripe**, soit un rail payout local à rajouter plus tard. À confirmer côté MOA.

---

## 1. État des lieux (ancré sur le code)

| Brique | Fichier | État |
|---|---|---|
| Interface paiement | `app/payment/base.py` | 🟢 `create_checkout` + `verify_webhook` |
| **Encaissement Stripe** (rail retenu) | `app/payment/stripe_adapter.py` | 🟢 **implémenté** (Checkout + `verify_webhook`) — à créditer/recetter |
| Encaissement CinetPay (option future) | `app/payment/cinetpay.py` | 🟢 codé, mis en réserve (marché FCFA) |
| Sélecteur de provider | `app/payment/__init__.py` + `config.payment_provider` | 🟢 `mock` \| `stripe` \| `cinetpay` (défaut **mock**) |
| Intent de paiement course | `crud.create_payment_intent`, modèle `PaymentIntent` (`amount_cents`) | 🟢 flux checkout course |
| **Topup wallet** | `crud.wallet_topup` | 🔴 **crédite en direct, sans encaisser** |
| **Payout (reversement)** | `app/payment/payout_adapter.py` | 🔴 `MockPayoutAdapter` OK ; pas d'adaptateur **Stripe Connect** ; `OrangeMoneyB2CAdapter` = *stub* |
| Batch de payout | `crud.run_payout_batch` | 🟢 logique OK, branchée sur l'adaptateur (donc mock aujourd'hui) |
| Ledger wallet | modèle `WalletTransaction` (`balance_after`, `amount_cents`) | 🟢 immuable, snapshot solde |
| Devise / nommage | **USD cents**, champs `*_cents` | 🟢 **clarifié (PR #27)** |

**Conclusion** : l'**encaissement Stripe** est codé (à recetter). Les vrais chantiers
restants sont **topup réel**, **payout via Stripe Connect**, et la **robustesse
financière** (idempotence, réconciliation, conformité).

---

## 2. Pré-requis restants (MOA)

| # | Élément | Impact |
|---|---|---|
| P1 | **Pays d'exploitation** compatible Stripe (encaissement + payout Connect) | Conditionne D2/D3 ; sinon rail payout local à prévoir |
| P2 | **Compte Stripe** (test + live) + activation Connect | Recette puis prod |
| P3 | **Plafonds & politique** : min/max retrait, plafond wallet, délais | Paramètres WS4/WS5 |
| P4 | **Modèle Connect** : Express (onboarding hébergé Stripe, KYC délégué) recommandé | Flux d'onboarding driver/pro |

---

## 3. Workstreams

Chaque WS : objectif · tâches · **critère d'acceptation**.

### WS0 — Devise & nommage 🟢 (fait)
- Base **USD cents** ; nommage `*_cents` sans ambiguïté (**PR #27**).
- Multi-devises / affichage FCFA = **différé** (i18n monétaire ultérieure).
- **Acceptation** : ✅ plus aucun champ ambigu ; un prix affiché = un montant débité, en USD cents.

### WS1 — Encaissement course réel (Stripe) 🟠
- Renseigner `stripe_secret_key` / `stripe_webhook_secret` (par env, Secret Manager).
- Finaliser le **webhook** `/v1/payments/webhook` : **vérif signature Stripe**, machine
  à états (`pending → paid | failed`), mise à jour `PaymentIntent` + post-paiement.
- **Idempotence** (clé d'idempotence Stripe + dédoublonnage des events webhook).
- **Acceptation** : une course payée en **test mode** Stripe passe `paid` via webhook,
  une seule fois ; le trip reflète le paiement.

### WS2 — Topup wallet réel 🔴
- Réécrire `wallet_topup` : ne plus créditer en direct → **Stripe Checkout**, rester
  `pending`, **créditer uniquement sur webhook confirmé** (metadata `kind=topup`).
- **Acceptation** : un topup test ne crédite le wallet **qu'après** confirmation Stripe ;
  un abandon ne crédite rien.

### WS3 — Payout réel via Stripe Connect 🔴
- **Onboarding Connect** : créer un compte connecté (Express) par driver/pro, lien
  d'onboarding hébergé (KYC/bank info gérés par Stripe), stocker l'`account_id`.
- **Adaptateur StripePayoutAdapter** : `transfer` vers le compte connecté (+ payout
  Stripe), statut `processing → processed | failed`, `provider_ref`, anti-double-versement.
- Gating : payout possible seulement si compte connecté **actif/vérifié**.
- **Acceptation** : un payout approuvé crée un transfer Stripe vers le compte connecté
  en test mode, statut fiable, rejouable sans doublon.

### WS4 — Robustesse & intégrité financière 🟠
- **Idempotence** bout-en-bout (intents, webhooks, payouts).
- **Remboursements / annulations** via Stripe Refunds (course annulée payée).
- **Réconciliation** : rapport quotidien **Stripe (balance/transactions) ↔ ledger
  interne**, alerte si écart ≠ 0.
- **Audit** des mouvements.
- **Acceptation** : réconciliation auto à zéro écart sur succès/échecs/remboursements.

### WS5 — Conformité & sécurité « money » 🔴
- **F1 (G4)** : KYC interne en lecture **privée** (URLs signées) — **indépendant de Stripe**.
- **KYC payees délégué à Stripe Connect** (Express) — réduit notre charge réglementaire.
- **Limites AML** : plafonds/seuils côté serveur (P3).
- **Secrets** Stripe par env (Secret Manager) + **signature webhook obligatoire** en prod.
- **Acceptation** : aucun doc KYC interne public ; webhook non signé rejeté ; plafonds appliqués.

### WS6 — Observabilité & exploitation financière 🟠
- Métriques succès/échec paiement & payout, latence webhook, volumes.
- **Alerting** : pics d'échecs, écart de réconciliation, payout `failed`, compte Connect non vérifié.
- Dashboard admin des transactions.
- **Acceptation** : un échec déclenche une alerte ; dashboard à jour.

### WS7 — Recette & sandbox 🟠
- Bout-en-bout en **Stripe test mode** (encaissement, topup, payout Connect, webhooks via Stripe CLI).
- Tests automatisés : idempotence, rejeu de webhook, échecs, remboursements.
- **Recette métier** signée MOA avant bascule live.
- **Acceptation** : suite « money » verte + recette signée.

---

## 4. Séquencement & jalons

```
M0  P1 (marché Stripe) confirmé + compte Stripe test + Connect activé
M1  WS0 ✅ (fait : USD cents, nommage clarifié)
M2  WS1 Encaissement course réel (Stripe test) + WS5(F1)     ── 1ère vraie collecte
M3  WS2 Topup wallet réel (Stripe test)
M4  WS3 Payout Stripe Connect (onboarding + transfer, test)  ── boucle argent complète
M5  WS4 Robustesse/réconciliation + WS6 observabilité
M6  WS7 Recette test complète + bascule clés LIVE            ── "argent réel" prêt
```

**Chemin critique** : M2 (encaissement+KYC) → M4 (payout Connect). Topup (M3) et
robustesse (M5) parallélisables.

---

## 5. Critères de sortie « Argent réel prêt » (Go)

- [x] WS0 : devise USD cents, nommage sans ambiguïté (PR #27)
- [ ] WS1 : encaissement course confirmé par webhook **signé** et idempotent (test → live)
- [ ] WS2 : topup wallet crédité **uniquement** sur paiement confirmé
- [ ] WS3 : payout Stripe Connect réel, compte connecté vérifié, anti-double-versement
- [ ] WS4 : réconciliation quotidienne à zéro écart + remboursements gérés
- [ ] WS5 : KYC interne privé (F1), webhooks signés, plafonds AML appliqués
- [ ] WS6 : alerting paiement/payout + dashboard
- [ ] WS7 : suite « money » verte + recette MOA signée
- [ ] Clés **LIVE** Stripe en Secret Manager ; pays d'exploitation compatible Stripe confirmé

Tant qu'un item est rouge → l'argent reste en **test/mock**.

---

## 6. Dépendances externes & risques spécifiques

| Élément | Détail |
|---|---|
| **Couverture Stripe** | Encaissement **et** payout Connect dépendent du pays. **À confirmer (P1)** — risque majeur si marché non supporté. |
| **Onboarding Connect** | Chaque driver/pro doit compléter l'onboarding (KYC/bank) avant d'être payable → friction à prévoir dans le parcours. |
| **Asynchronisme webhooks** | Confirmations & statuts via webhooks → machine à états + idempotence **non négociables**. |
| **Réconciliation** | Source de vérité = Stripe ; le ledger interne doit s'aligner, écart = incident. |
| **Double versement** | Risque majeur côté payout → idempotence + statut fiable + revue manuelle au pilote. |

---

## 7. Ce que je peux démarrer sans attendre le compte Stripe live

1. **WS5 — F1 (KYC interne privé)** — totalement indépendant de Stripe.
2. **WS1/WS2/WS3 en Stripe test mode** — coder les flux, la signature webhook, la
   machine à états, l'idempotence, l'onboarding Connect et la réconciliation contre
   le **mode test** Stripe ; ne basculer que les **clés** en live une fois P1/P2 confirmés.

> Recommandation : **WS5/F1** en premier (indépendant, sécurité), puis WS1 → WS3 en
> test mode. La confirmation du marché Stripe (P1) avance côté MOA en parallèle.

---

*Prochaine étape : confirmer P1 (marché compatible Stripe), puis plan d'implémentation
détaillé (task-planning) par workstream — démarrage proposé sur **WS5/F1**.*
