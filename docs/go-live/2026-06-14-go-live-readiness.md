# ZIZA — Dossier de Go-Live Readiness

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-06-14 |
| **Auteur** | Maîtrise d'ouvrage (Product Owner) — assisté Claude Code |
| **Statut** | En revue |
| **Portée** | Plateforme ZIZA (Ride + Craft) — passage en production |

> Document vivant. Il fait foi pour la décision Go/No-Go. Toute affirmation de
> « prêt » doit être tracée par un critère de sortie coché (§7) avec preuve.

---

## 1. Synthèse exécutive (pour décision)

ZIZA est une **marketplace bi-verticale mobile-first** — **Ride** (VTC) et **Craft**
(assistance routière à la demande, modèle enchères) — backend FastAPI unique, 9
frontends isolés, GCP Cloud Run. Cible : **Afrique de l'Ouest francophone, paiement
mobile money**.

**Verdict de maturité : MVP/bêta solide côté logiciel, NON prêt comme marketplace
qui manipule de l'argent réel.**

- ✅ Le **socle produit et technique est là** et cohérent avec la vision (auth, Ride,
  Craft, wallet, messagerie, withdrawals, admin, KYC, CI/CD, **dev déployé**).
- 🔴 Les **flux d'argent ne sont pas réels** (paiement en `mock`, payout mobile money
  en *stub*). C'est le bloqueur n°1.
- 🔴 **Incohérence devise/marché** (USD dans le code vs FCFA/mobile money) à trancher.
- 🔴 **Conformité** : fuite potentielle des pièces KYC (lecture publique), cadre
  légal money-transmission / VTC non couvert.
- 🟠 **Exploitation** prod (Cloud SQL, observabilité) à finaliser.

**Recommandation MOA : lancement progressif** — pilote fermé 1 ville / 1 vertical
(Ride) avec rails de paiement réels, puis élargissement. **Pas de big-bang public.**

---

## 2. Périmètre & vision

| Vertical | Description | État logiciel |
|---|---|---|
| **Ziza Ride** | VTC : estimation, réservation, dispatch, tracking, paiement, notation, gains | Complet (MVP) |
| **Ziza Craft** | Assistance routière : demande → enchères des pros → sélection → intervention | Complet (MVP) |
| **Transverse** | Auth Firebase, wallet customer, withdrawals driver/pro, messagerie in-app, console admin (KYC, historiques, gains, conversations), notifications | Complet (MVP) |

**Applications (9)** : `web-customer`, `web-driver`, `web-admin`, `web-craft`,
`web-landing`, `mobile-customer`, `mobile-driver`, `mobile-craft` (+ backend `api`).

---

## 3. Évaluation de préparation par axe

Légende statut : 🟢 prêt · 🟡 partiel · 🔴 non prêt / bloquant.

| # | Axe | Statut | Constat (preuve) |
|---|---|:--:|---|
| A1 | **Fonctionnel produit** | 🟢 | Parcours Ride + Craft + transverses livrés ; 505 tests backend verts. |
| A2 | **Authentification** | 🟢 | Firebase token-exchange ; en prod seul `/v1/auth/firebase` actif (`/v1/token` = 404). |
| A3 | **Paiement (encaissement)** | 🔴 | `payment_provider="mock"` par défaut ; Stripe (cartes) réel mais hors-marché ; CinetPay à finaliser/tester. |
| A4 | **Reversement (payout)** | 🔴 | `payout_provider="mock"` ; `OrangeMoneyB2CAdapter` = *stub* qui lève `NotImplementedError`. |
| A5 | **Devise / marché** | 🔴 | Calculs en USD, mais écosystème FCFA / mobile money. À figer avant facturation. |
| A6 | **Sécurité données KYC (F1)** | 🔴 | Upload signé OK, mais **lecture** des pièces via URL **publique** (`final_url`). |
| A7 | **Conformité légale** | 🔴 | Money-transmission/AML (wallet+retraits), licences VTC, assurances, RGPD/local : non couverts. |
| A8 | **Infra prod** | 🟡 | `deploy-prod.yml` prêt (tag `v*`) ; secrets JWT/admin + budget créés ; **Cloud SQL prod non provisionné**. |
| A9 | **Observabilité / exploitation** | 🔴 | Seule une alerte budget ; pas de monitoring/alerting/APM, pas de SLO, pas de PRA formalisé. |
| A10 | **Performance / temps réel** | 🟡 | Tracking & chat en **polling** ; `min-instances=0` (cold start). Acceptable MVP. |
| A11 | **Mobile (distribution)** | 🟡 | Apps en **SDK 54** (testables Expo Go) ; **aucune présence stores** ; runtime non validé. |
| A12 | **Qualité / dette** | 🟡 | Montées de version résiduelles (pillow/starlette/pytest) ; domaine custom + HTTPS à faire. |

**Score de préparation au go-live « marketplace réelle » : ~50 %.** Le delta est
concentré sur **argent, conformité, exploitation** — pas sur le produit.

---

## 4. Registre des écarts (gap register)

| ID | Écart | Axe | Sévérité | Effort | Responsable | Bloque |
|---|---|---|:--:|:--:|---|---|
| G1 | Intégrer un **PSP réel d'encaissement** (CinetPay / mobile money) | A3 | 🔴 | L | Dev + PSP | Pilote |
| G2 | Implémenter le **payout mobile money réel** (Orange Money/Wave B2C) | A4 | 🔴 | L | Dev + PSP | Pilote |
| G3 | **Figer devise FCFA** + conversion USD→XOF bout-en-bout | A5 | 🔴 | M | MOA + Dev | Pilote |
| G4 | **F1** : bucket privé + **URLs signées en lecture** des KYC | A6 | 🔴 | M | Dev | Pilote |
| G5 | **Cadre légal** : entité, licence VTC, money-transmission/AML, assurances | A7 | 🔴 | L | MOA + Juriste | Pilote |
| G6 | **RGPD/local** : registre traitements, consentement, rétention, DPA | A7 | 🟠 | M | MOA + Juriste | Pilote |
| G7 | **Provisionner Cloud SQL prod** + secret `database-url` + repo vars | A8 | 🟠 | S | MOA (gcloud) | Pilote |
| G8 | **Observabilité** : logs structurés, alerting, dashboard SLO, uptime | A9 | 🟠 | M | Dev | Pilote |
| G9 | **Sauvegardes / PRA** Cloud SQL (backups auto, test de restore) | A9 | 🟠 | S | Dev | Pilote |
| G10 | **Smoke test prod** post-tag (login Firebase, réservation, gate admin) | A8 | 🟠 | S | Dev | Pilote |
| G11 | **Builds EAS** + soumission stores (Android puis iOS) | A11 | 🟡 | M | Dev + MOA | Phase C |
| G12 | **Validation runtime mobile** (checklist QA SDK 54) | A11 | 🟡 | S | QA | Phase C |
| G13 | Montées de version résiduelles + **domaine custom HTTPS** | A12 | 🟡 | S | Dev | Phase B |
| G14 | **Support & ops** : canal incident, runbook, on-call, CGU in-app | A9 | 🟠 | M | MOA + Ops | Pilote |

Effort : **S** ≈ <1 j, **M** ≈ quelques jours, **L** ≈ chantier (dépend de tiers/PSP/juriste).

---

## 5. Stratégie de go-live progressive (avec gates)

### Phase 0 — Fondations ✅ (fait)
Auth Firebase, CI/CD avec gates, dev déployé, workflow prod, secrets de base, SDK 54.

### Phase A — **Pilote fermé** (1 ville, vertical **Ride**, cohorte limitée)
**Objectif** : éprouver les flux d'argent réels sous contrôle.
**Critères de sortie (gate A → ouverture)** :
- [ ] G1 + G2 : encaissement **et** payout réels fonctionnels (mobile money) — testés bout-en-bout
- [ ] G3 : devise **FCFA** figée, prix cohérents
- [ ] G4 : KYC en lecture **privée** (URLs signées)
- [ ] G5 : entité + assurances + cadre PSP **signés** ; G6 : bases RGPD
- [ ] G7 + G9 + G10 : prod déployée, backups actifs, smoke test vert
- [ ] G8 : monitoring + alerting minimaux en place
- [ ] G14 : canal support + runbook incident
- [ ] Cohorte : ~20–50 drivers triés manuellement, clients sur invitation

### Phase B — **Ride ouvert + activation Craft** (même ville)
**Gate B** : KPIs pilote OK (taux de complétion course, échec paiement < seuil,
réconciliation financière à zéro écart), G13 (domaine custom), Craft re-testé bout-en-bout.

### Phase C — **Apps mobiles sur stores + 2ᵉ ville**
**Gate C** : G11 + G12 (stores + runtime validé), capacité scale (min-instances,
Cloud SQL tier) revue, observabilité éprouvée sous charge.

---

## 6. RACI (rôles)

Rôles : **MOA** (Product Owner / décision), **DEV** (ingénierie), **PSP** (prestataire
paiement), **JUR** (juridique/conformité), **OPS** (exploitation/support).

| Activité | MOA | DEV | PSP | JUR | OPS |
|---|:--:|:--:|:--:|:--:|:--:|
| Choix marché / devise / rails paiement | **A/R** | C | C | C | I |
| Intégration PSP encaissement + payout (G1,G2) | A | **R** | C | I | I |
| Conversion devise FCFA (G3) | A | **R** | I | I | I |
| Sécurisation KYC F1 (G4) | A | **R** | I | C | I |
| Cadre légal / licences / AML (G5,G6) | **A** | I | C | **R** | I |
| Provision infra prod (G7,G9) | **A** | R | I | I | C |
| Observabilité / SLO (G8) | A | **R** | I | I | C |
| Smoke test & Go/No-Go (G10) | **A** | R | I | I | C |
| Builds EAS / stores (G11,G12) | A | **R** | I | C | I |
| Support / incident (G14) | A | C | I | I | **R** |

(R = Responsable, A = Approbateur, C = Consulté, I = Informé.)

---

## 7. Registre des risques

| ID | Risque | Prob. | Impact | Mitigation | Resp. |
|---|---|:--:|:--:|---|---|
| R1 | Paiement/payout réel non prêt à temps (dépend du PSP) | H | Critique | Démarrer contrat PSP **maintenant** ; fallback adaptateur mock-réaliste pour répéter la chaîne | MOA |
| R2 | Fuite de pièces KYC (lecture publique) | M | Critique | G4 avant tout user réel ; audit bucket | DEV |
| R3 | Non-conformité réglementaire (wallet/AML, VTC) | M | Critique | Cadrage juridique avant pilote ; limiter le scope du wallet au pilote | JUR/MOA |
| R4 | Écart de réconciliation financière | M | Élevé | Ledger immuable déjà présent ; rapprochement quotidien + alerte écart | DEV/OPS |
| R5 | Panne prod non détectée (pas de monitoring) | H | Élevé | G8 obligatoire avant pilote ; uptime check + alerting | DEV |
| R6 | Rejet / incompat. runtime mobile (New Arch) | M | Moyen | Checklist QA SDK 54 avant stores ; tests device | QA |
| R7 | Coûts qui dérapent (scale, Cloud SQL) | L | Moyen | `min-instances=0`, tier micro, alerte budget déjà en place | MOA |
| R8 | Dépendance à un fournisseur unique (PSP/mobile money) | M | Moyen | Architecture adaptateur déjà multi-provider ; viser ≥2 rails | DEV |

---

## 8. Décisions MOA en attente (bloquent le plan)

1. **Marché & devise** : figer **FCFA + mobile money** ? (déclenche G3 + G1/G2)
2. **Rails de paiement** : CinetPay (agrégateur) seul, ou Orange Money/Wave direct + cartes secours ?
3. **Séquencement** : Ride d'abord (reco) ou Ride+Craft ensemble ?
4. **Périmètre 1er go-live** : pilote fermé (reco) vs ouvert ?
5. **Entité & licences** : qui porte la licence VTC / money-transmission ?
6. **Budget pilote** : enveloppe infra + frais PSP + juridique.

---

## 9. Critères Go/No-Go (checklist de décision — Phase A)

**GO uniquement si TOUS les éléments sont cochés :**
- [ ] Encaissement réel testé (G1) · [ ] Payout réel testé (G2)
- [ ] Devise FCFA figée (G3) · [ ] KYC privé (G4)
- [ ] Cadre légal & assurances signés (G5) · [ ] Bases RGPD (G6)
- [ ] Prod déployée + backups + smoke test vert (G7, G9, G10)
- [ ] Monitoring/alerting actifs (G8) · [ ] Support/incident prêt (G14)
- [ ] Cohorte pilote constituée et briefée

Tant qu'un seul item est rouge → **NO-GO** (ou go restreint documenté et assumé par la MOA).

---

## 10. Annexe — Preuves de l'existant (✅ acquis)

- **Tests** : 505 tests backend verts (Docker) ; mobile tsc clean, jest customer 20 / driver 19 ; expo-doctor 18/18.
- **Auth** : `/v1/auth/firebase` opérationnel (dev) ; projet Firebase `ziza-platform` (email/pw + Google).
- **CI/CD** : `deploy-dev.yml` (push main) et `deploy-prod.yml` (tag `v*`) avec test-gate ; dev déployé et fonctionnel.
- **Secrets prod** : `ziza-prod-jwt-secret`, `ziza-prod-admin-code` + alerte budget créés.
- **Migrations** : Alembic à 0035 (inclut messagerie + payouts pro).
- **Mobile** : Expo **SDK 54** (RN 0.81 / React 19) ; checklist QA dans `docs/qa/`.
- **Runbook infra prod** : `docs/plans/2026-06-11-phase2-prod-groundwork.md`.

---

*Prochaine revue de ce dossier : à chaque franchissement de gate (A/B/C) ou décision MOA.*
