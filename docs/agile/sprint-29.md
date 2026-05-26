# Sprint 29 — Commission plateforme & batch payout

## Objectif

Mise en place de la gestion des taux de commission par catégorie de véhicule, du calcul du solde net chauffeur après déduction de commission, et d'un batch de paiement qui traite en lot toutes les demandes de retrait approuvées.

---

## Périmètre technique

### Backend — `apps/api`

#### Modèle `CommissionSetting`

Nouveau modèle SQLAlchemy dans `app/models/payout_request.py` :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `category` | String(32) UNIQUE | `economy`, `comfort`, `premium`, `assistance`, `default` |
| `rate_pct` | Integer | Taux de commission en % (0–100) |
| `effective_from` | DateTime TZ | Date d'entrée en vigueur |
| `created_by` | UUID FK nullable | Admin ayant créé le taux |

Colonnes ajoutées à `PayoutRequest` :

| Champ | Type | Description |
|-------|------|-------------|
| `commission_xof` | Integer nullable | Commission déduite calculée au moment du traitement |
| `net_amount_xof` | Integer nullable | Montant net versé (amount – commission) |
| `provider_ref` | String(128) nullable | Référence retournée par le provider de paiement |
| `processed_at` | DateTime TZ nullable | Horodatage du traitement |

#### Migration `0023_commission_payout_batch.py`

- Création de la table `commission_settings`
- Ajout des 4 nouvelles colonnes sur `payout_requests`
- `down_revision = "0022"`

#### `PayoutAdapter` — `app/payment/payout_adapter.py`

Protocol Python (structural typing) avec implémentation mock :

```python
class PayoutAdapter(Protocol):
    async def send_payout(self, phone: str, amount_xof: int, ref: str) -> str: ...

class MockPayoutAdapter:   # toujours succès, ref = "mock_payout_{ref}"
class OrangeMoneyB2CAdapter:  # placeholder — lève NotImplementedError
```

Sélection via `settings.payout_provider` (défaut : `"mock"`).

#### Nouveaux CRUD — `app/crud.py`

| Fonction | Description |
|----------|-------------|
| `_ensure_commission_defaults(db)` | Peuple les taux par défaut (economy 15%, comfort 18%, premium 20%, assistance 12%, default 15%) au premier appel |
| `get_commission_settings(db)` | Liste tous les taux ; déclenche `_ensure_commission_defaults` si vide |
| `set_commission(db, category, rate_pct, auth_user_id)` | Crée ou met à jour un taux |
| `_get_commission_rate(db, category)` | Taux pour une catégorie, fallback sur `default`, fallback hardcodé 15% |
| `get_driver_balance(db, auth_user_id)` | `gains_bruts – commission_total – retraits = solde_net` |
| `run_payout_batch(db)` | Traite toutes les demandes `approved`, appelle l'adaptateur, marque `processed` ou `failed` |

**Formule commission** : `math.floor(fare_xof * rate_pct / 100)` — arithmétique entière.

**Batch idempotent** : filtre strict sur `status == "approved"` ; les demandes déjà traitées sont ignorées.

#### Nouveaux endpoints — `app/main.py`

| Méthode | Route | Auth | Réponse |
|---------|-------|------|---------|
| `GET` | `/v1/drivers/me/balance` | driver | `DriverBalanceResponse` |
| `GET` | `/v1/admin/commission` | admin | `list[CommissionSettingResponse]` |
| `POST` | `/v1/admin/commission` | admin | `CommissionSettingResponse` |
| `POST` | `/v1/admin/payouts/run` | admin | `PayoutBatchResponse` |

#### `app/config.py`

Deux nouveaux paramètres :

```
payout_provider: str = "mock"
default_commission_pct: int = 15
```

---

### Frontend — `apps/web-driver`

#### `src/api.js`

Nouvelle fonction `getDriverBalance(token)` → `GET /v1/drivers/me/balance`

Réponse : `{ driver_id, gains_bruts_xof, commission_xof, retraits_xof, solde_net_xof }`

#### `src/App.jsx`

`EarningsCard` étendue pour afficher la décomposition du solde net :

- Gains bruts (total courses)
- Commission plateforme (déduite)
- Retraits effectués
- **Solde net disponible** (mis en évidence)

---

### Frontend — `apps/web-admin`

#### `src/api.js`

Trois nouvelles fonctions :

| Fonction | Endpoint |
|----------|----------|
| `getCommissionSettings(token)` | `GET /v1/admin/commission` |
| `setCommission(token, category, rate_pct)` | `POST /v1/admin/commission` |
| `runPayoutBatch(token)` | `POST /v1/admin/payouts/run` |

#### `src/App.jsx`

Nouveau composant `CommissionPanel` (onglet **💰 Commission**) :

- Tableau des taux actuels par catégorie (economy / comfort / premium / assistance / default)
- Formulaire inline pour modifier un taux — validation 0–100%
- Section **Batch payout** : bouton "🚀 Lancer batch payout" avec résultat détaillé (traitées / échouées / montant net total / commission totale)

Onze onglets après ajout (Stats, Courses, Assistances, Chauffeurs, Promos, Retraits, Avis, Documents, **Commission**, Paramètres, Utilisateurs).

---

## Tests

**Cible : +20 tests → total 407**

| Fichier | Tests | Couverture |
|---------|-------|-----------|
| `tests/test_balance.py` | 8 | Solde zéro sans course, après course economy, commission 15% déduite, commission premium 20%, après retrait traité, formule solde net, admin → 403, customer → 403 |
| `tests/test_payout_batch.py` | 8 | Batch vide (structure), traite une demande approuvée, provider_ref présent, compteurs processed/failed, idempotence sur re-run, totaux corrects, non-admin → 403, non-authentifié → 401 |
| `tests/test_commission.py` | 4 | GET retourne la liste avec les défauts, POST crée/met à jour comfort → 18%, taux différents par catégorie (economy ≠ premium), endpoints admin-only (driver + customer → 403) |

---

## Compteur de tests global

| Suite | Tests |
|-------|-------|
| Backend Python (pytest) | 376 |
| Mobile customer (Jest/TS) | 16 |
| Mobile driver (Jest/TS) | 15 |
| **Total** | **407** |

---

## Frontends web mis à jour

Sous-titres et footers mis à jour vers `Sprint 29 — Payout batch & commission` :
- `apps/web-customer/src/App.jsx`
- `apps/web-driver/src/App.jsx`
- `apps/web-admin/src/App.jsx`

---

## Points d'attention architecturaux

1. **Lazy seeding** : `_ensure_commission_defaults()` est appelé au premier accès aux taux — pas de script de migration séparé.
2. **Arithmétique entière** : `math.floor(fare_xof * rate / 100)` évite toute perte de précision flottante.
3. **Isolation adapter** : `PayoutAdapter` est un Protocol structurel — le backend ne dépend d'aucune lib tierce de paiement pour les tests.
4. **Batch non-bloquant** : chaque demande est commitée individuellement ; une erreur provider marque la demande `failed` sans interrompre les suivantes.
5. **Fallback commission** : si la catégorie n'a pas de taux configuré, on remonte sur `default`, puis sur la valeur hardcodée 15%.
