# ZIZA — Roadmap « Argent réel »

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-06-14 |
| **Auteur** | MOA / Product Owner — assisté Claude Code |
| **Objectif** | Faire passer la plateforme d'un argent **simulé (mock)** à des **flux financiers réels** : encaissement, wallet, reversement, en devise du marché. |
| **Référence** | Complète `docs/go-live/2026-06-14-go-live-readiness.md` (écarts G1–G4). |

> « Argent réel » = un utilisateur paie réellement, un driver/pro est réellement
> payé, et chaque centime est traçable et réconcilié. Tant qu'un seul maillon est
> en `mock`, on n'est pas à argent réel.

---

## 1. État des lieux (ancré sur le code)

| Brique | Fichier | État |
|---|---|---|
| Interface paiement | `app/payment/base.py` | 🟢 `create_checkout` + `verify_webhook` |
| **Encaissement CinetPay** (Afrique de l'Ouest) | `app/payment/cinetpay.py` | 🟢 **implémenté** (API v2, `notify_url` → `/v1/payments/webhook`) — à créditer/tester |
| Encaissement Stripe (cartes) | `app/payment/stripe_adapter.py` | 🟢 implémenté (rail secours) |
| Sélecteur de provider | `app/payment/__init__.py` + `config.payment_provider` | 🟢 `mock` \| `cinetpay` \| `stripe` (défaut **mock**) |
| Intent de paiement course | `crud.create_payment_intent`, modèle `PaymentIntent` | 🟢 flux checkout course |
| **Topup wallet** | `crud.wallet_topup` | 🔴 **crédite en direct, sans encaisser** |
| **Payout (reversement B2C)** | `app/payment/payout_adapter.py` | 🔴 `MockPayoutAdapter` OK ; `OrangeMoneyB2CAdapter` = *stub* (`NotImplementedError`) |
| Batch de payout | `crud.run_payout_batch` | 🟢 logique OK, branchée sur l'adaptateur (donc mock aujourd'hui) |
| Ledger wallet | modèle `WalletTransaction` (`balance_after`) | 🟢 immuable, snapshot solde |
| Devise | partout `amount_xof` mais **maths en USD** | 🔴 incohérence à lever |

**Conclusion** : la **collecte** est largement faite (CinetPay). Les vrais chantiers
sont **topup réel**, **payout réel**, **devise**, et la **robustesse financière**
(idempotence, réconciliation, conformité).

---

## 2. Pré-requis (décisions MOA — bloquent le démarrage)

| # | Décision | Impact |
|---|---|---|
| D1 | **Devise** : figer **XOF/FCFA** ? | Déclenche WS0 (conversion) |
| D2 | **Rail encaissement** : CinetPay (agrégateur : Orange/MTN/Moov Money + cartes) ? | Crédentials + recette WS1/WS2 |
| D3 | **Rail payout** : CinetPay *Transfer* B2C, ou Orange Money / Wave direct ? | Implémentation WS3 |
| D4 | **Limites & politique** : plafonds wallet, montants min/max retrait, délais | Paramètres WS4/WS5 |
| D5 | **Comptes PSP** : sandbox + prod (contrat, KYC entreprise) | Recette puis prod |

> Sans D1–D3, on peut quand même avancer en **mode sandbox / mock-réaliste** ;
> seul le passage en prod réelle exige les contrats PSP signés.

---

## 3. Workstreams

Chaque WS liste : objectif · tâches principales · **critère d'acceptation**.

### WS0 — Devise FCFA (fondation) 🔴
- Lever l'ambiguïté USD/XOF : maths entières en **centimes XOF** (ou unité XOF, sans
  décimale — le FCFA n'a pas de subdivision), arrondis, formatage.
- Harmoniser back (estimation, commission, payouts, wallet) **et** les 9 frontends.
- Migration éventuelle des données existantes (dev/pilote).
- **Acceptation** : un prix affiché = un montant débité = un montant réconcilié, en
  FCFA, sans conversion implicite ; tests de cohérence verts.

### WS1 — Encaissement course réel (CinetPay) 🟠
- Renseigner `cinetpay_api_key` / `cinetpay_site_id` / secret webhook (par env).
- Finaliser le **webhook** `/v1/payments/webhook` : vérif signature, **machine à
  états async** mobile money (`pending → paid | failed | expired`), mise à jour
  `PaymentIntent` + déclenchement post-paiement (course payée).
- **Idempotence** webhook (un même notify rejoué ne double pas).
- **Acceptation** : une course payée en sandbox CinetPay passe `paid` via webhook,
  une seule fois, et le trip reflète le paiement.

### WS2 — Topup wallet réel 🔴
- Réécrire `wallet_topup` : ne plus créditer en direct → **créer un checkout PSP**,
  rester `pending`, **créditer uniquement sur webhook confirmé**.
- Réutiliser le webhook WS1 (distinguer `topup` vs `trip` via metadata/reference).
- **Acceptation** : un topup sandbox ne crédite le wallet **qu'après** confirmation
  PSP ; un échec/abandon ne crédite rien.

### WS3 — Payout B2C réel 🔴
- Implémenter un **adaptateur de décaissement réel** (selon D3) : CinetPay Transfer
  ou Orange Money/Wave B2C — remplacer le *stub* `OrangeMoneyB2CAdapter`.
- Gérer l'**asynchronisme** (statut `processing → processed | failed`), le
  `provider_ref`, les **retries** et la reprise (le batch existe déjà).
- Vérifier le **solde disponible** au moment du décaissement (déjà plafonné côté demande).
- **Acceptation** : un payout approuvé est réellement envoyé en sandbox, statut final
  fiable, `provider_ref` stocké, rejouable sans double versement.

### WS4 — Robustesse & intégrité financière 🟠
- **Idempotence** de bout en bout (intents, webhooks, payouts) via clés uniques.
- **Remboursements / annulations** (course annulée payée, échec partiel).
- **Réconciliation** : rapport quotidien PSP ↔ ledger interne, **alerte si écart ≠ 0**.
- **Audit** : journal des mouvements (qui/quoi/quand/montant), conservation.
- **Acceptation** : rapport de réconciliation automatique à zéro écart sur un jeu de
  transactions de test incluant succès/échecs/remboursements.

### WS5 — Conformité & sécurité « money » 🔴
- **F1 (G4)** : KYC en lecture **privée** (URLs signées) — pré-requis avant payout réel.
- **Limites AML** : plafonds par utilisateur/jour, seuils de vigilance (D4).
- **Secrets** par environnement (clés PSP en Secret Manager), **rotation**.
- **Signature webhook** vérifiée et obligatoire en prod.
- **Acceptation** : aucun document KYC accessible publiquement ; webhook non signé
  rejeté ; plafonds appliqués côté serveur.

### WS6 — Observabilité & exploitation financière 🟠
- Métriques : taux de succès paiement/payout, latence webhook, volume, échecs.
- **Alerting** : pic d'échecs paiement, écart de réconciliation, payout en `failed`.
- Tableau de bord opérationnel (admin) des transactions.
- **Acceptation** : un échec de paiement/payout déclenche une alerte ; dashboard à jour.

### WS7 — Recette & sandbox 🟠
- Mode **sandbox** PSP de bout en bout (encaissement, topup, payout, webhook).
- Tests automatisés : idempotence, rejeu de webhook, échecs, remboursements.
- **Recette métier** (parcours réels) avant bascule prod.
- **Acceptation** : suite de tests « money » verte + recette signée par la MOA.

---

## 4. Séquencement & jalons

```
M0  Décisions D1–D3 figées + comptes PSP sandbox ouverts
M1  WS0 Devise FCFA livrée (fondation)                      ── bloque tout le reste
M2  WS1 Encaissement course réel (sandbox)  + WS5(F1)       ── 1ère vraie collecte
M3  WS2 Topup wallet réel (sandbox)
M4  WS3 Payout B2C réel (sandbox)                           ── boucle argent complète
M5  WS4 Robustesse/réconciliation + WS6 observabilité
M6  WS7 Recette sandbox complète + bascule clés PROD        ── "argent réel" prêt
```

**Chemin critique** : M1 (devise) → M2 (encaissement+KYC) → M4 (payout). Le topup
(M3) et la robustesse (M5) peuvent partiellement paralléliser.

---

## 5. Critères de sortie « Argent réel prêt » (Go)

- [ ] WS0 : devise FCFA cohérente bout-en-bout
- [ ] WS1 : encaissement course confirmé par webhook idempotent (sandbox → prod)
- [ ] WS2 : topup wallet crédité **uniquement** sur paiement confirmé
- [ ] WS3 : payout B2C réel, statut fiable, anti-double-versement
- [ ] WS4 : réconciliation quotidienne à zéro écart + remboursements gérés
- [ ] WS5 : KYC privé (F1), webhooks signés, plafonds AML appliqués
- [ ] WS6 : alerting paiement/payout + dashboard
- [ ] WS7 : suite « money » verte + recette MOA signée
- [ ] Clés **PROD** PSP en Secret Manager, contrats signés

Tant qu'un item est rouge → l'argent reste en **sandbox/mock**.

---

## 6. Dépendances externes & risques spécifiques

| Élément | Détail |
|---|---|
| **Contrats PSP** | CinetPay (+ rail payout) : KYC entreprise, délais d'activation — **démarrer maintenant** (chemin critique non-technique). |
| **Conformité** | Licence/partenariat money-transmission selon le cadre local (lié au dossier go-live G5). |
| **Asynchronisme mobile money** | Les confirmations arrivent par webhook, parfois différées → la machine à états et l'idempotence sont **non négociables**. |
| **Réconciliation** | Source de vérité = PSP ; le ledger interne doit s'aligner, écart = incident. |
| **Double versement** | Risque majeur côté payout → idempotence + statut fiable + revue manuelle au pilote. |

---

## 7. Ce que je peux démarrer sans attendre les contrats PSP

1. **WS0 (devise FCFA)** — purement interne, débloque le reste.
2. **WS1/WS2/WS3 en mode sandbox / mock-réaliste** — coder les flux, la machine à
   états, l'idempotence et la réconciliation contre le **mode test** des PSP, puis ne
   basculer que les **clés** en prod une fois les contrats signés.
3. **WS5 — F1 (KYC privé)** — indépendant des PSP.

> Recommandation : lancer **WS0** immédiatement (fondation), **WS5/F1** en parallèle,
> puis WS1→WS3 en sandbox. La signature des contrats PSP avance côté MOA en parallèle.

---

*Prochaine étape : valider D1–D3, puis je produis un plan d'implémentation détaillé
(task-planning) par workstream, en commençant par WS0.*
