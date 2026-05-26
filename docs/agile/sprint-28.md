# Sprint 28 — Application mobile driver

## Objectif

Livraison de l'application mobile chauffeur (React Native 0.74 + Expo SDK 51 + TypeScript) avec géolocalisation GPS en arrière-plan, dispatch des courses et assistances en temps réel, et gestion complète du cycle de vie des missions.

---

## Périmètre technique

### Application `apps/mobile-driver`

| Composant | Description |
|-----------|-------------|
| `App.tsx` | Point d'entrée : import du task manager au niveau module, gate d'auth (token AsyncStorage) |
| `src/api.ts` | Client API isolé — 30+ fonctions, types TypeScript, utilitaires purs (`buildNavigationUrl`, `calculateDistanceKm`) |
| `src/background/LocationTask.ts` | Tâche `expo-task-manager` pour envoi GPS en arrière-plan via `updateDriverLocation` |
| `src/hooks/useDispatch.ts` | Polling toutes les 10 s — `listAvailableTrips` + `listAvailableAssistance` (Promise.all) |
| `src/hooks/useBackgroundLocation.ts` | Démarre/arrête `expo-location` background selon l'état `isOnline` du chauffeur |
| `src/navigation/AppNavigator.tsx` | Stack Navigator typé : Dispatch, ActiveTrip, Location, Earnings, History, Documents, Profile, Notifications |

### Écrans (9)

| Écran | Fonctionnalité |
|-------|----------------|
| `LoginScreen` | Authentification chauffeur |
| `DispatchScreen` | Toggle en ligne/hors ligne, FlatList des courses et assistances disponibles |
| `ActiveTripScreen` | Boutons lifecycle (démarrer/terminer), deep link Google Maps navigation |
| `LocationScreen` | Affichage position GPS en temps réel |
| `EarningsScreen` | Graphique recettes avec `EarningsChart` |
| `HistoryScreen` | Historique des courses terminées |
| `DocumentsScreen` | Upload pièces justificatives (KYC) |
| `ProfileScreen` | Profil chauffeur et note moyenne |
| `NotificationsScreen` | Liste des notifications push |

### Composants (4)

| Composant | Description |
|-----------|-------------|
| `TripDispatchCard` | Carte course avec badge catégorie coloré (economy/comfort/premium) et prix XOF |
| `AssistanceDispatchCard` | Carte assistance avec icône par type (🛞🔧🚨🚛⛽🔑🆘) |
| `ActiveTripActions` | Boutons contextuels selon statut : `accepted` → Démarrer, `in_progress` → Terminer, `completed` → bannière |
| `EarningsChart` | Graphique barres pur React Native Views (sans librairie tierce) — aujourd'hui/semaine/total |

---

## Configuration mobile

### `app.json`
- Permissions iOS : `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationWhenInUseUsageDescription`
- Permissions Android : `ACCESS_BACKGROUND_LOCATION`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`
- Plugins Expo : `expo-notifications`, `expo-location`, `expo-task-manager`

### `tsconfig.json`
- `"jsx": "react-native"` — pour `tsc --noEmit`
- `"skipLibCheck": true`, `"strict": false` — compatibilité React Native

---

## Tests

**Cible : +15 tests → total 387**

| Fichier | Tests | Couverture |
|---------|-------|-----------|
| `__tests__/auth.test.tsx` | 3 | `login()` stocke le token, `getStoredToken()` null à froid, `clearToken()` supprime |
| `__tests__/dispatch.test.tsx` | 5 | `listAvailableTrips`, `acceptTrip`, 409 concurrent, champs badge, tri proximité `calculateDistanceKm` |
| `__tests__/lifecycle.test.tsx` | 4 | `startTrip` → `in_progress`, `completeTrip` → `completed`, séquence accept→start→complete, `buildNavigationUrl` |
| `__tests__/location.test.tsx` | 3 | `updateDriverLocation` corps PUT, réponse LocationResponse, `getDriverLocation` null sur 404 |
| **Total** | **15** | |

### Stratégie de test

- Tous les tests importent uniquement depuis `src/api.ts` (pas de modules natifs à mocker)
- `AsyncStorage` mocké via `__mocks__/async-storage.ts` (store en mémoire + `jest.fn()`)
- `global.fetch` mocké avec `jest.fn()` + `mockResolvedValueOnce`
- `buildNavigationUrl()` et `calculateDistanceKm()` sont des fonctions pures — aucun mock requis
- ts-jest configuré avec `"jsx": "react"` en override inline (Node.js ne comprend pas `"react-native"`)

---

## CI/CD

Nouveau job `mobile-driver-build` dans `.github/workflows/ci.yml` :
1. `npm install` (pas de lock file en phase de bootstrap)
2. `npx tsc --noEmit` — vérification types TypeScript
3. `npx jest --passWithNoTests` — exécution des 15 tests

---

## Compteur de tests global

| Suite | Tests |
|-------|-------|
| Backend Python (pytest) | 356 |
| Mobile customer (Jest/TS) | 16 |
| Mobile driver (Jest/TS) | 15 |
| **Total** | **387** |

---

## Frontends web mis à jour

Les 3 frontends web ont leur sous-titre mis à jour vers `Sprint 28 — Application mobile driver` :
- `apps/web-customer/src/App.jsx`
- `apps/web-driver/src/App.jsx`
- `apps/web-admin/src/App.jsx`

---

## Dépendances clés

```json
{
  "expo-location": "~17.0.1",
  "expo-task-manager": "~11.8.2",
  "@react-native-async-storage/async-storage": "1.23.1"
}
```

---

## Points d'attention architecturaux

1. **Import module-level** : `LocationTask.ts` doit être importé avant tout montage de composant dans `App.tsx` (obligation `expo-task-manager`)
2. **Isolation frontend** : `src/api.ts` de mobile-driver est complètement indépendant — aucun code partagé avec web-customer, web-driver, web-admin ou mobile-customer
3. **Polling séparé** : dispatch 10 s (trips + assistances), différent du polling statut 5 s de mobile-customer
4. **Formule Haversine** : `calculateDistanceKm()` exportée depuis `api.ts` permet un tri côté client des offres de dispatch par proximité
