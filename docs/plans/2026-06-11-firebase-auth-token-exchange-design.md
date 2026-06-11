# Phase 0 — Auth Firebase via échange de token (design)

- **Date** : 2026-06-11
- **Statut** : validé (en attente d'implémentation)
- **Stratégie retenue** : Firebase partout (option C), via échange de token (approche 1)
- **Décisions actées** : rôles attribués à la création selon l'app ; gate admin via `admin_signup_code` conservé ; migration des comptes existants par import bcrypt vers Firebase.

## Contexte

Aujourd'hui :
- Les 9 frontends s'authentifient en email/password via `POST /v1/token`, qui retourne **404 en prod** (`main.py:272`).
- Firebase est un demi-pont : SDK câblé mais dormant sur `web-customer`/`web-driver`/`web-admin` uniquement (gate `VITE_FIREBASE_API_KEY` non fourni) ; **absent** de `web-craft` et des 3 apps mobiles.
- Backend : `firebase-admin==6.5.0` installé, `FirebaseAdapter` capable de vérifier un ID token, sélectionné par `get_auth_adapter()` **seulement si `environment == "prod"`** — mais le déploiement force `ENVIRONMENT=dev` (`deploy-dev.yml:178`).

Conséquence : le service déployé tourne en `DevAdapter` avec des comptes seedés à identifiants publics (`admin@ziza.dev` / `ziza2024`). Basculer naïvement `ENVIRONMENT=prod` casserait toute l'authentification (mobiles + craft sans Firebase, email/password en 404).

## 1. Principe directeur

Firebase = **fournisseur d'identité** (prouve « qui tu es »). Le backend reste **maître de la session et des rôles**. L'ID token Firebase n'est vérifié **qu'une fois, au login** ; tout le trafic suivant continue d'utiliser le JWT maison + refresh tokens existants.

## 2. Flux de login (les 9 apps)

```
1. App → Firebase SDK : signup/login (email+password OU Google)
2. App reçoit un Firebase ID token
3. App → POST /v1/auth/firebase
        { id_token, role, [admin_signup_code], first_name, last_name, date_of_birth, phone }
4. Backend vérifie l'ID token (firebase-admin), crée/retrouve le User,
   renvoie { access_token, refresh_token, expires_in }
5. App stocke le JWT maison → Bearer sur TOUS les appels suivants (comme aujourd'hui)
```

Expiration de l'access token → `POST /v1/auth/refresh` (existant, **inchangé**).

## 3. Deux couches d'auth distinctes (changement clé)

| Couche | Quand | Vérifié par |
|---|---|---|
| **Identité** | login uniquement, dans `/v1/auth/firebase` | `firebase-admin` (FirebaseAdapter existant) |
| **Session** | chaque requête (`get_current_user`) | **JWT HS256 maison**, en dev **et** en prod |

`get_auth_adapter()` ne renvoie plus `FirebaseAdapter` pour les requêtes : il renvoie toujours l'adaptateur de session JWT maison (l'actuel `DevAdapter.verify`, renommé `SessionJwtAdapter`). `require_role`, `Claims`, la rotation des refresh tokens : **aucun changement**.

## 4. Attribution des rôles (à la création)

- Le rôle vit **en DB** (`User.role`) — **source de vérité unique**. Les **custom claims Firebase ne sont PAS utilisés** (on évite leurs pièges de propagation/refresh).
- `/v1/auth/firebase` reçoit le `role` envoyé par l'app (web-driver → `driver`, mobile-customer → `customer`, etc.) et le **valide** :
  - `customer` / `driver` / `professional` : auto-attribution autorisée (KYC en aval).
  - `admin` : créé **uniquement** si `admin_signup_code` correct.
  - **User déjà existant** : le rôle envoyé par le client est **ignoré** (anti-escalade de privilèges) ; le rôle stocké est conservé.

## 5. Impacts backend

- **Nouveau** : `POST /v1/auth/firebase` — vérif ID token + upsert `User` + émission JWT/refresh.
- **Renommage** : `DevAdapter` → `SessionJwtAdapter` (garde `verify` / `issue_raw` / `issue_for_user_id` comme adaptateur de session prod ; le nom « dev » devient trompeur).
- **Config** :
  - `auth_dev_secret` → `jwt_secret`, **obligatoire en prod** (échec au boot si absent — plus de défaut public).
  - `firebase_project_id` **requis** en prod.
  - Suppression des défauts publics restants (`admin_signup_code` doit aussi venir de l'env en prod).
- `/v1/token` (seeded + bcrypt) : reste **404 en prod**, actif en dev/CI pour les tests.

## 6. Impacts frontend

- **web-craft + 3 mobiles** : ajouter le SDK Firebase (absent aujourd'hui).
  - Web : SDK `firebase` JS.
  - Mobile (Expo) : SDK `firebase` JS (compatible Expo) + Google via `expo-auth-session`.
- **web-customer / web-driver / web-admin** : finir le câblage (`auth.js` existe déjà), ajouter le login email/password Firebase, remplacer l'appel `/v1/token` par `/v1/auth/firebase`.

## 7. Migration des comptes existants

**Retenu** : importer les users bcrypt en base vers Firebase Auth via `firebase auth:import` (supporte les hash BCRYPT avec rounds/salt) → reconnexion avec le **même mot de passe**, rôle DB préservé. Script de migration one-shot à écrire et à exécuter avant le go-live.

## 8. Tests

- Backend : nouveau `test_firebase_auth.py` (ID token mocké → upsert + attribution rôle + gate admin + anti-escalade sur user existant). Les 52 fichiers de tests existants restent verts (session JWT inchangée).
- Vérification end-to-end dédiée du flux Google web (jamais exécuté en conditions réelles).

## 9. Suivi / durcissement avant go-live (découvert pendant l'implémentation)

- **✅ Sécurité — match par email non vérifié (RÉSOLU, commit `2f78cad`).** `POST /v1/auth/firebase` résout désormais l'identité par `uid` (autoritaire) ; en cas de collision d'email (email unique en DB), il ne lie le compte que si Firebase atteste l'email (`email_verified`), sinon **403** propre. Bloque la prise de contrôle de compte et évite la violation de contrainte unique (500). `email_verified` est exposé dans `Claims`/`FirebaseAdapter.verify`. Couvert par `test_unverified_email_collision_rejected` + `test_verified_email_links_existing_account`.
- **Flux Google web** : jamais exécuté en conditions réelles → vérification end-to-end dédiée avec un vrai projet Firebase.

## 10. Hors périmètre Phase 0 (phases suivantes)

- Frontend : intégration Firebase des 9 apps (web-craft + 3 mobiles n'ont aucun SDK aujourd'hui) — nécessite un projet Firebase de test.
- Pipeline de déploiement prod (`deploy-prod.yml`, `ENVIRONMENT=prod`, Secret Manager) — Phase 1/2.
- Réconciliation devise XOF/USD — Phase 3.
- Observabilité, backups, stores mobiles — Phases 4-6.

## État d'implémentation (backend) — 2026-06-11

Branche `phase0-firebase-auth-design`. Backend Phase 0 **terminé et vérifié** (suite complète : **462 passed** dans Docker python:3.12) :
- `23c22bf` alias SessionJwtAdapter · `c08d980` config fail-fast prod · `041a98b` session JWT découplée de l'env · `2166bcd` endpoint `/v1/auth/firebase` · `990994f` verrou 404 prod + fix contamination · `2a0f27d` script migration bcrypt→Firebase.
- **Reste** : intégration frontend (Tasks 7-13, dépend d'un projet Firebase) + durcissement `email_verified` ci-dessus.
