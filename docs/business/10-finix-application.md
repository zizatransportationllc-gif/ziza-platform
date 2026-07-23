# Dossier de candidature Finix — ZIZA

> **But** : obtenir l'approbation *underwriting* de Finix comme plateforme de
> paiement marketplace (encaissement + split + versement aux dépanneurs), après
> le blocage Stripe pour « activité jugée trop risquée ». Ce dossier sert à
> préparer la candidature **et** à faire passer l'underwriting du premier coup.
>
> Règle d'or : Stripe nous a classés « à risque ». Finix fait **sa propre**
> souscription — on ne subit donc pas la décision de Stripe, mais il faut
> présenter l'activité comme ce qu'elle est : un **service automobile légitime**
> à faible litige, pas une place de marché opaque.

---

## 1. Positionnement à présenter à l'underwriting

| Élément | Valeur à soumettre |
|---|---|
| Nature de l'activité | Mise en relation + paiement pour **assistance/dépannage routier** (roadside assistance) aux États-Unis (NJ). |
| Modèle | Marketplace : le client paie ZIZA, ZIZA reverse au dépanneur, garde une commission + taxe. |
| **MCC visé** | **7549 – Motor Vehicle Towing / Automotive Services** (surtout **pas** un code urgence/hors-catégorie). |
| Ticket moyen | À renseigner (ex. ~$110 par intervention). |
| Ticket max | À renseigner (plafonner via `max_transaction_amount`). |
| Volume mensuel prévu (6 mois) | **< 20 000 $/mois** au démarrage. |
| Zone | États-Unis, New Jersey d'abord. |
| Site / app | app.ziza.live (client), pro.ziza.live (dépanneur). |
| Modèle de délivrance | Service rendu **immédiatement** (intervention sur place) → faible risque de litige « non reçu ». |

**Narratif anti-risque (à mettre en avant, 3–4 phrases) :**
> ZIZA connecte des automobilistes en panne à des dépanneurs professionnels
> vérifiés. Le service est rendu sur place et confirmé par le client, ce qui
> réduit fortement les litiges. Les dépanneurs sont vérifiés (KYC Finix +
> contrôle interne) avant de pouvoir recevoir des paiements. Politique de
> remboursement claire et support réactif.

---

## 2. Documents & informations à réunir (KYC entreprise)

- [ ] **Raison sociale exacte** : Zizatransportation LLC (à confirmer) + adresse légale.
- [ ] **EIN** (numéro fiscal fédéral).
- [ ] **Certificate of Formation / Articles of Organization** (LLC NJ).
- [ ] **Bénéficiaires effectifs** : chaque personne détenant **≥ 25 %** (nom, date de naissance, SSN, adresse, % détenu).
- [ ] **Représentant de contrôle** (dirigeant signataire).
- [ ] **Compte bancaire pro** de règlement : nom du titulaire, routing + numéro de compte (ou relevé/void check).
- [ ] **Pièce d'identité** du dirigeant (permis / passeport).
- [ ] **URL du site** avec, visibles publiquement :
  - [ ] Politique de **remboursement / annulation**
  - [ ] **CGU** (Terms of Service) — Finix la demande (`terms_of_service_url`)
  - [ ] Coordonnées de contact / support
- [ ] **Historique de traitement** si disponible (relevés Stripe des derniers mois : volume, taux de litige). *Un faible taux de chargeback est un argument fort.*
- [ ] **Estimation de volume** : mensuel moyen + ticket moyen + ticket max.

---

## 3. Réponses aux questions type d'underwriting (à préparer)

| Question probable | Réponse à tenir |
|---|---|
| Que vend exactement l'entreprise ? | Service de dépannage routier rendu sur place par des pros vérifiés. |
| Quand le service est-il livré vs facturé ? | **Immédiatement** (à l'intervention). Pas de pré-vente longue → peu de litiges. |
| Politique de remboursement ? | Publiée sur le site ; remboursement si intervention non réalisée. |
| Taux de chargeback historique ? | Fournir le chiffre Stripe s'il est bas ; sinon indiquer les contrôles mis en place. |
| Gérez-vous des fonds de tiers (payout) ? | Oui : split au moment du paiement, versement au dépanneur via sa Merchant Finix. |
| Comment vérifiez-vous les dépanneurs ? | Onboarding Finix (KYC) **+** contrôle interne avant activation des paiements. |
| Tickets élevés ? | Plafond configuré ; validation manuelle au-dessus d'un seuil. |

---

## 4. Points de dé-risquage à traiter AVANT / PENDANT la candidature

Ce sont les leviers qui font basculer de « à risque » vers « standard » :

1. **MCC 7549** — insister dessus dès l'onboarding.
2. **Repenser l'empreinte carte au bid** (`hold` à la sélection du devis). Les
   autorisations/holds sur des clients en urgence gonflent le profil de litige.
   Cible : **wallet/top-up + capture à la fin d'intervention** plutôt que hold
   ouvert. → *Chantier code séparé, déjà identifié.*
3. **Politique de remboursement + CGU en ligne** (prérequis Finix).
4. **Vetting dépanneurs documenté** (procédure écrite = argument underwriting).
5. **Plafond de transaction** (`max_transaction_amount`) cohérent avec le ticket réel.

---

## 5. Prêt côté technique (à mentionner à Finix)

L'intégration **sandbox est déjà codée** derrière notre abstraction de paiement :

- Encaissement hébergé : **Payment Links** (`link_url`) → `FinixAdapter.create_checkout`.
- Split marketplace : `merchant_id` = dépanneur, `fee` = commission ZIZA.
- Webhooks : **Basic-auth** + `Finix-Signature` → `FinixAdapter.verify_webhook`.
- Remboursement : reversal de Transfer.
- Onboarding vendeur : **Onboarding Forms** → `finix_connect.create_onboarding_link`.
- Versement : CREDIT Transfer → `FinixPayoutAdapter`.

*(Fichiers : `apps/api/app/payment/finix_adapter.py`, `finix_connect.py`,
`payout_adapter.py`. Bascule via `PAYMENT_PROVIDER=finix`.)*

---

## 6. Checklist d'action

- [ ] Créer le compte **Finix Sandbox** → récupérer API user + password.
- [ ] Renseigner les secrets sandbox (voir `docs/business/README` / env ci-dessous).
- [ ] Tester en sandbox : create → paiement → webhook → refund.
- [ ] Publier **politique de remboursement + CGU** sur app.ziza.live.
- [ ] Réunir les documents KYC (section 2).
- [ ] Lancer la **candidature Live** (underwriting) avec le narratif section 1.
- [ ] En parallèle : chantier « hold-at-bid → capture-à-la-fin ».
- [ ] Récupérer les fonds retenus par Stripe + export PCI des moyens de paiement.

---

### Config sandbox (env)

```
PAYMENT_PROVIDER=finix
FINIX_API_BASE=https://finix.sandbox-payments-api.com
FINIX_USERNAME=<API user USsr…>
FINIX_PASSWORD=<API password>
FINIX_VERSION=2022-02-01
FINIX_PLATFORM_MERCHANT_ID=<Merchant id ZIZA sandbox>
FINIX_WEBHOOK_USERNAME=<choisi par nous>
FINIX_WEBHOOK_PASSWORD=<choisi par nous>
```

> Côté Finix : configurer le webhook vers `https://<api>/v1/payments/webhook`
> avec `Authentication.type = BASIC` et les mêmes user/password que
> `FINIX_WEBHOOK_*`.
