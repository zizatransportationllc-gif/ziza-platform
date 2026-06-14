# Mobile QA Checklist — Expo SDK 54 (runtime)

> Validation runtime des 3 apps mobiles après la montée **Expo SDK 51 → 54**
> (RN 0.81 / React 19). À exécuter dans **Expo Go SDK 54** (`npx expo start`,
> scan du QR ; `--tunnel` si le téléphone n'est pas sur le même Wi‑Fi).
>
> Légende : 🔴 = sensible à la New Architecture / module natif (priorité) ·
> 🆕 = fonctionnalité ajoutée récemment (chat, withdrawals, wallet).
>
> Les `.env` portent déjà `EXPO_PUBLIC_API_URL` (API dev) et les clés Firebase.

## 🟢 Smoke commun (les 3 apps)

- [ ] L'app démarre dans Expo Go SDK 54 **sans redbox** ni warning bloquant
- [ ] 🔴 Login **email/mot de passe** (Firebase) → écran principal
- [ ] 🔴 Login **Google** (Firebase OAuth) → session ouverte
- [ ] Navigation entre tous les écrans sans crash
- [ ] Kill + réouverture → session persistée (AsyncStorage 2.x)
- [ ] Logout → retour au Login

---

## 📱 mobile-customer

Compte test : `fbtest@ziza.dev` / `TestPass123`

- [ ] 🔴 **GPS pickup** : le bouton 📡 GPS remplit le départ (expo-location)
- [ ] **Recherche d'adresse** (écran Places) départ + arrivée
- [ ] Estimation (prix/ETA) puis **réservation** d'une course
- [ ] 🔴 **Tracking** : la **carte s'affiche**, position driver + ETA (react-native-maps — *point #1 New Arch*)
- [ ] 🆕 **Chat driver** (course accepted/in_progress) : envoi + réception (polling 3 s), bulles bien orientées
- [ ] 🔴 **Paiement** : l'écran **WebView** de checkout se charge (react-native-webview)
- [ ] 🆕 **Wallet** (bouton 💰 sur Home) : solde, **top-up**, historique des transactions
- [ ] **Craft** : poster une demande → voir les bids → en accepter une → 🆕 chat avec le pro
- [ ] Historique des courses
- [ ] Édition profil (nom/prénom/dob ; email non éditable)
- [ ] 🔴 **Documents KYC** : prise/sélection image (expo-image-picker) + upload (file-system `/legacy`)
- [ ] 🔴 **Notification** au premier plan → bannière visible (fix `shouldShowBanner`)

---

## 🚗 mobile-driver

Compte : compte driver de test

- [ ] Passer **online/offline** (switch)
- [ ] **Dispatch** : voir les courses dispo, en **accepter** une
- [ ] **Active trip** : 🔴 bouton **Navigate** (deep link Maps), **Start** puis **Complete**
- [ ] 🆕 **Chat customer** sur la course active
- [ ] 🔴 **Localisation en arrière-plan** : la position se met à jour (expo-task-manager) — vérifier côté tracking customer
- [ ] 🆕 **Earnings → Withdrawals** : solde « disponible », demande **plafonnée** (montant > solde refusé), historique
- [ ] Véhicule (ajout/édition)
- [ ] 🔴 **Documents KYC** : upload (image-picker + file-system `/legacy`)
- [ ] Profil
- [ ] 🔴 Notifications (bannière au premier plan)

---

## 🔧 mobile-craft (professionnel)

Compte : `professional@ziza.dev` (ou compte pro de test)

- [ ] 🔴 **Requests à proximité** : liste basée sur la localisation (expo-location)
- [ ] **Request detail** → **soumettre un bid**
- [ ] 🆕 **Chat customer** quand la demande est `assigned`/`in_progress`
- [ ] **My Bids** : statuts à jour
- [ ] 🆕 **Withdrawals** (bouton 💰 Withdraw / écran dédié) : solde = Σ bids acceptés, demande **plafonnée**, historique
- [ ] Profil + Skills
- [ ] 🔴 **Documents KYC** : upload (document-picker + file-system `/legacy`)
- [ ] 🔴 Notifications (bannière au premier plan)

---

## En cas d'échec — à remonter

1. **App + item** de la checklist
2. **Message d'erreur exact** (texte du redbox / logs `expo start`)
3. Module suspecté si visible (`react-native-maps`, `firebase`, `expo-location`, …)

**Suspects #1 sous New Architecture** : `react-native-maps` (tracking customer) et l'**upload KYC** (file-system). Une carte qui ne rend pas est le symptôme New Arch typique.

---

_Référence : montée SDK 54 — PR #23. Vérifié hors-ligne : expo-doctor 18/18, tsc clean, jest customer 20 / driver 19._
