# Sprint 27 — Application Mobile Customer

**Durée :** ~1 semaine  
**Objectif :** Créer l'application mobile native du client Ziza (React Native 0.74 + Expo SDK 51 + TypeScript). Booking, tracking en temps réel, paiement WebView, FCM push, historique. Tests Jest TypeScript isolés du backend.  
**Gap adressé :** #14 — Application mobile customer absente (roadmap Phase 8)

---

## Livrables

| # | Livrable | Statut |
|---|---|---|
| 1 | `apps/mobile-customer/` — projet Expo 51 complet | ✅ |
| 2 | `src/api.ts` — client TypeScript isolé (30+ fonctions) | ✅ |
| 3 | `src/hooks/useTrip.ts` — polling statut toutes les 5 s | ✅ |
| 4 | `src/hooks/useTracking.ts` — polling GPS chauffeur, arrêt auto sur statut terminal | ✅ |
| 5 | `src/hooks/useNotifications.ts` — enregistrement token FCM | ✅ |
| 6 | `src/navigation/AppNavigator.tsx` — stack React Navigation 6 | ✅ |
| 7 | 9 écrans TypeScript (`Login`, `Home`, `Tracking`, `Payment`, `History`, `Assistance`, `Places`, `Profile`, `Notifications`) | ✅ |
| 8 | 6 composants TypeScript (`TripCard`, `EtaCard`, `TrackingMap`, `CategoryPicker`, `PromoInput`, `StarPicker`) | ✅ |
| 9 | `__tests__/` — 16 tests Jest + ts-jest | ✅ |
| 10 | CI : job `mobile-customer-build` (TypeScript check + Jest) | ✅ |
| 11 | Frontends web : subtitle mis à jour → `Sprint 27 — Application mobile` | ✅ |

---

## Structure du projet

```
apps/mobile-customer/
├── App.tsx                        # Entrée, auth gate, useNotifications
├── app.json                       # Config Expo
├── eas.json                       # Config EAS Build
├── babel.config.js
├── package.json                   # Expo 51, RN 0.74, ts-jest
├── tsconfig.json
├── __mocks__/
│   └── async-storage.ts           # Mock manuel pour tests
├── __tests__/
│   ├── auth.test.tsx              # 3 tests
│   ├── booking.test.tsx           # 7 tests
│   ├── tracking.test.tsx          # 4 tests
│   └── payment.test.tsx           # 2 tests
└── src/
    ├── api.ts                     # Client API TypeScript isolé
    ├── hooks/
    │   ├── useTrip.ts
    │   ├── useTracking.ts
    │   └── useNotifications.ts
    ├── navigation/
    │   └── AppNavigator.tsx
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── HomeScreen.tsx
    │   ├── TrackingScreen.tsx
    │   ├── PaymentScreen.tsx
    │   ├── HistoryScreen.tsx
    │   ├── AssistanceScreen.tsx
    │   ├── PlacesScreen.tsx
    │   ├── ProfileScreen.tsx
    │   └── NotificationsScreen.tsx
    └── components/
        ├── TripCard.tsx
        ├── EtaCard.tsx
        ├── TrackingMap.tsx        # react-native-maps
        ├── CategoryPicker.tsx
        ├── PromoInput.tsx
        └── StarPicker.tsx
```

---

## Stack technique

| Couche | Bibliothèque | Version |
|--------|-------------|---------|
| Runtime | React Native | 0.74.1 |
| Dev tools | Expo SDK | ~51.0.0 |
| Navigation | @react-navigation/native-stack | ^6.9.26 |
| Stockage | @react-native-async-storage | 1.23.1 |
| Cartographie | react-native-maps | 1.14.0 |
| WebView (paiement) | react-native-webview | 13.8.6 |
| Push notifications | expo-notifications | ~0.28.0 |
| Tests | jest + ts-jest | ^29.7 / ^29.1 |
| Langage | TypeScript | ~5.3.3 |

---

## Hooks

### `useTrip(token, tripId)`

```typescript
// Polling every 5 s, stops automatically on "completed" or "cancelled"
const { trip, loading, error, refresh } = useTrip(token, tripId);
```

### `useTracking(token, driverId, tripStatus)`

```typescript
// Active only when tripStatus ∈ {"accepted", "in_progress"}
// Stops polling on terminal status
const { position, error } = useTracking(token, trip.driver_id, trip.status);
```

### `useNotifications(token)`

```typescript
// Requests Expo push permission → registers expo push token via POST /v1/devices/register
useNotifications(token);
```

---

## Fonctions API (src/api.ts)

| Catégorie | Fonctions |
|-----------|----------|
| Auth | `login`, `logout`, `refreshAccessToken`, `storeToken`, `getStoredToken`, `clearToken` |
| Trajets | `getEstimate`, `listCategories`, `applyPromo`, `createTrip`, `cancelTrip`, `getTripStatus`, `listTripHistory` |
| Tracking | `getDriverPosition` |
| Paiement | `createPaymentIntent`, `getPaymentStatus` |
| Assistance | `requestAssistance`, `getActiveAssistance` |
| Lieux | `searchPlaces` |
| Notifications | `listNotifications`, `markAllNotificationsRead` |
| Appareils | `registerDeviceToken`, `deregisterDeviceToken` |

---

## Tests Jest TypeScript

| Fichier | Tests | Détail |
|---------|-------|--------|
| `__tests__/auth.test.tsx` | 3 | login stores token · getStoredToken null initial · clearToken removes token |
| `__tests__/booking.test.tsx` | 7 | estimate · categories · promo · createTrip pending · cancelTrip PATCH · getTripStatus · driver_id + ETA |
| `__tests__/tracking.test.tsx` | 4 | getDriverPosition lat/lng · repeated polls update coords · null on 404 · ETA in in_progress |
| `__tests__/payment.test.tsx` | 2 | intent → checkout_url · 400 throws error |

**Total Python :** 356 (inchangé)  
**Total TypeScript :** 16 nouveaux  
**Total global :** 356 + 16 = **372 tests**

### Setup des mocks

```typescript
// package.json jest config
"moduleNameMapper": {
  "^@react-native-async-storage/async-storage$": "<rootDir>/__mocks__/async-storage.ts"
}
// ts-jest override : "jsx": "react" pour exécution Node.js
```

---

## CI — nouveau job

```yaml
mobile-customer-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: "20" }
    - name: Install deps
      working-directory: apps/mobile-customer
      run: npm install
    - name: TypeScript check
      working-directory: apps/mobile-customer
      run: npx tsc --noEmit
    - name: Jest tests
      working-directory: apps/mobile-customer
      run: npx jest --passWithNoTests
```

---

## Mise à jour des frontends web

Les trois frontends web ont leur subtitle mis à jour vers **Sprint 27 — Application mobile** :

| Frontend | Avant | Après |
|----------|-------|-------|
| web-customer | Sprint 24 — Paiement client | Sprint 27 — Application mobile |
| web-driver | Sprint 22 — Localisation chauffeur & ETA | Sprint 27 — Application mobile |
| web-admin | Sprint 19 — Observabilité & filtres admin | Sprint 27 — Application mobile |

---

## Règle d'isolation frontend respectée

`apps/mobile-customer/src/api.ts` est indépendant des `api.js` web. Aucune importation croisée entre frontends.

---

## Critères de validation

- [x] `npx tsc --noEmit` passe sans erreur dans `apps/mobile-customer/`
- [x] 16 tests Jest passent (`npx jest --passWithNoTests`)
- [x] `useTrip` s'arrête de poller sur `completed` / `cancelled`
- [x] `useTracking` ne démarre que sur `accepted` / `in_progress`
- [x] `createPaymentIntent()` renvoie un `checkout_url`
- [x] Subtitles des 3 frontends web → `Sprint 27 — Application mobile`

---

## EAS Build — déploiement production

```bash
# Installer EAS CLI
npm install -g eas-cli

# Configurer le projet
cd apps/mobile-customer
eas build:configure

# Build Android (APK preview)
eas build --platform android --profile preview

# Build iOS (TestFlight)
eas build --platform ios --profile preview
```

Les variables d'environnement à configurer dans EAS :
- `EXPO_PUBLIC_API_URL` → `https://api.ziza.ci`
- `GOOGLE_MAPS_API_KEY` → clé Google Maps Android/iOS
