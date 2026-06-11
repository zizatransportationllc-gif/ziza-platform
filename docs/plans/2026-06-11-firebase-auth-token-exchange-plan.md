# Firebase Auth via Token Exchange — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Faire de Firebase le fournisseur d'identité des 9 apps, échangé une fois au login contre le JWT maison existant, avec rôles attribués en DB à la création.

**Architecture:** Firebase vérifie l'identité au login (endpoint `POST /v1/auth/firebase`, via `firebase-admin`). Le backend crée/retrouve le `User` (rôle en DB, source de vérité unique), puis émet l'access JWT HS256 + refresh token existants. Toutes les requêtes suivantes sont authentifiées par le JWT maison — en dev **et** en prod. Les custom claims Firebase ne sont pas utilisés.

**Tech Stack:** FastAPI, SQLAlchemy async, firebase-admin 6.5.0, PyJWT (HS256), bcrypt, pytest ; React/Vite (web), React Native/Expo + firebase JS SDK (mobile).

**Référence design :** `docs/plans/2026-06-11-firebase-auth-token-exchange-design.md`

---

## Périmètre

Backend (Tasks 1–6) entièrement spécifié. Frontend : `web-customer` servi de référence complète (Task 7), les 6 autres apps répètent le même patron (Tasks 8–13). Migration des comptes (Task 14). Câblage env/déploiement prod = **hors Phase 0** (Phase 1/2).

Convention projet rappelée : statut validation = `HTTP_422_UNPROCESSABLE_ENTITY` ; UI anglais ; isolation frontends (zéro code partagé).

---

## Task 1 : Renommer DevAdapter → SessionJwtAdapter (sans changement de comportement)

**Files:**
- Modify: `apps/api/app/auth/dev_adapter.py`
- Test: `apps/api/tests/test_auth.py` (existant — doit rester vert)

**Step 1 : Ajouter l'alias canonique en bas de `dev_adapter.py`**

```python
# Sprint 66 — l'adaptateur sert désormais de couche SESSION en dev ET en prod
# (le JWT maison authentifie chaque requête). Le nom « Dev » est conservé comme
# alias rétro-compatible pour les imports existants.
SessionJwtAdapter = DevAdapter
```

**Step 2 : Lancer la suite auth pour vérifier l'absence de régression**

Run: `cd apps/api && pytest tests/test_auth.py tests/test_token_refresh.py tests/test_auth_refresh.py -q`
Expected: PASS (aucun comportement modifié).

**Step 3 : Commit**

```bash
git add apps/api/app/auth/dev_adapter.py
git commit -m "refactor(auth): alias SessionJwtAdapter sur DevAdapter (couche session prod)"
```

---

## Task 2 : Durcir la config (secret obligatoire en prod, plus de défaut public)

**Files:**
- Modify: `apps/api/app/config.py`
- Test: Create `apps/api/tests/test_config_prod_guard.py`

**Step 1 : Écrire le test d'échec**

```python
# apps/api/tests/test_config_prod_guard.py
import importlib
import pytest


def _reload_settings(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import app.config as cfg
    return importlib.reload(cfg)


def test_prod_requires_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "ziza-prod")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("AUTH_DEV_SECRET", raising=False)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        _reload_settings(monkeypatch)


def test_prod_requires_firebase_project_id(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    with pytest.raises(ValueError, match="FIREBASE_PROJECT_ID"):
        _reload_settings(monkeypatch)


def test_dev_uses_defaults(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "dev")
    cfg = _reload_settings(monkeypatch)
    assert cfg.settings.jwt_secret  # default acceptable en dev
```

**Step 2 : Vérifier l'échec**

Run: `cd apps/api && pytest tests/test_config_prod_guard.py -q`
Expected: FAIL (`jwt_secret` n'existe pas encore, pas de garde prod).

**Step 3 : Modifier `config.py`**

- Renommer `auth_dev_secret` → `jwt_secret` (garder l'env var `AUTH_DEV_SECRET` ET `JWT_SECRET` acceptées via alias).
- Ajouter un validateur `model_post_init` qui lève `ValueError` en prod si `jwt_secret` vaut le défaut public, est vide, ou si `firebase_project_id` est vide.

```python
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "dev"
    # ... champs existants ...

    jwt_secret: str = Field(
        default="dev-secret-change-in-env",
        validation_alias=AliasChoices("JWT_SECRET", "AUTH_DEV_SECRET"),
    )
    firebase_project_id: str = ""

    def model_post_init(self, __context) -> None:
        if self.environment == "prod":
            if not self.jwt_secret or self.jwt_secret == "dev-secret-change-in-env":
                raise ValueError("JWT_SECRET must be set to a non-default value in prod")
            if not self.firebase_project_id:
                raise ValueError("FIREBASE_PROJECT_ID is required in prod")
```

- Dans `dev_adapter.py`, remplacer `settings.auth_dev_secret` → `settings.jwt_secret` (2 occurrences : `_build_token`, `verify`).

**Step 4 : Vérifier le passage des tests**

Run: `cd apps/api && pytest tests/test_config_prod_guard.py tests/test_auth.py -q`
Expected: PASS.

**Step 5 : Commit**

```bash
git add apps/api/app/config.py apps/api/app/auth/dev_adapter.py apps/api/tests/test_config_prod_guard.py
git commit -m "feat(config): JWT_SECRET et FIREBASE_PROJECT_ID obligatoires en prod (fail-fast)"
```

---

## Task 3 : Découpler `get_auth_adapter` de l'environnement (session JWT partout)

**Files:**
- Modify: `apps/api/app/auth/dependencies.py:19-25`
- Test: Create `apps/api/tests/test_session_adapter.py`

**Step 1 : Écrire le test**

```python
# apps/api/tests/test_session_adapter.py
from app.auth.dependencies import get_auth_adapter
from app.auth.dev_adapter import DevAdapter

def test_session_adapter_is_jwt_in_all_envs(monkeypatch):
    monkeypatch.setattr("app.config.settings.environment", "prod")
    assert isinstance(get_auth_adapter(), DevAdapter)  # JWT maison, pas Firebase
```

**Step 2 : Vérifier l'échec**

Run: `cd apps/api && pytest tests/test_session_adapter.py -q`
Expected: FAIL (renvoie FirebaseAdapter en prod aujourd'hui).

**Step 3 : Modifier `dependencies.py`**

```python
def get_auth_adapter() -> AuthAdapter:
    """Session auth: le JWT maison authentifie chaque requête en dev ET prod.

    Firebase n'est utilisé qu'au login, dans POST /v1/auth/firebase, pas ici.
    """
    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415
    return DevAdapter()
```

**Step 4 : Vérifier le passage + non-régression globale**

Run: `cd apps/api && pytest tests/test_session_adapter.py tests/ -q`
Expected: PASS.

**Step 5 : Commit**

```bash
git add apps/api/app/auth/dependencies.py apps/api/tests/test_session_adapter.py
git commit -m "refactor(auth): session JWT pour toutes les requêtes (Firebase au login uniquement)"
```

---

## Task 4 : Helper CRUD `upsert_firebase_user`

**Files:**
- Modify: `apps/api/app/crud.py` (à la suite de `create_local_user`, ~ligne 331)
- Test: Create `apps/api/tests/test_crud_firebase_user.py`

**Step 1 : Écrire le test**

```python
# apps/api/tests/test_crud_firebase_user.py
import pytest
from app import crud

@pytest.mark.asyncio
async def test_upsert_creates_then_preserves_role(db_session):
    u1, created1 = await crud.upsert_firebase_user(
        db_session, uid="fb_123", email="a@x.io", role="driver",
        first_name="A", last_name="B", date_of_birth="1990-01-01", phone=None, name=None,
    )
    assert created1 is True and u1.role == "driver" and u1.provider == "firebase"
    # 2e appel avec rôle escaladé → ignoré, rôle DB conservé
    u2, created2 = await crud.upsert_firebase_user(
        db_session, uid="fb_123", email="a@x.io", role="admin",
        first_name="A", last_name="B", date_of_birth="1990-01-01", phone=None, name=None,
    )
    assert created2 is False and u2.role == "driver"
```

> `db_session` : réutiliser la fixture DB existante de `conftest.py` (vérifier son nom exact avant d'écrire ; adapter si besoin).

**Step 2 : Vérifier l'échec**

Run: `cd apps/api && pytest tests/test_crud_firebase_user.py -q`
Expected: FAIL (`upsert_firebase_user` inexistant).

**Step 3 : Implémenter dans `crud.py`**

```python
async def upsert_firebase_user(
    db: AsyncSession, *, uid: str, email: str, role: str,
    first_name: str | None = None, last_name: str | None = None,
    date_of_birth: str | None = None, phone: str | None = None, name: str | None = None,
) -> tuple[User, bool]:
    """Crée (rôle demandé) ou retrouve (rôle DB conservé) un user Firebase.

    Retourne (user, created). Anti-escalade : sur un user existant, le rôle
    fourni par le client est ignoré.
    """
    existing = await _get_user_by_auth_id(db, uid)
    if existing is None and email:
        existing = await get_user_by_email(db, email)
    if existing is not None:
        return existing, False

    user = User(
        user_id=uid, email=email, role=role, provider="firebase",
        name=name, phone=phone, first_name=first_name,
        last_name=last_name, date_of_birth=date_of_birth,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user, True
```

**Step 4 : Vérifier le passage**

Run: `cd apps/api && pytest tests/test_crud_firebase_user.py -q`
Expected: PASS.

**Step 5 : Commit**

```bash
git add apps/api/app/crud.py apps/api/tests/test_crud_firebase_user.py
git commit -m "feat(crud): upsert_firebase_user (rôle DB autoritaire, anti-escalade)"
```

---

## Task 5 : Endpoint `POST /v1/auth/firebase`

**Files:**
- Modify: `apps/api/app/main.py` (après `signup_create`, ~ligne 475)
- Test: Create `apps/api/tests/test_firebase_auth.py`

**Step 1 : Écrire les tests (ID token mocké)**

```python
# apps/api/tests/test_firebase_auth.py
import pytest
from app.auth.base import Claims

@pytest.fixture(autouse=True)
def _mock_firebase(monkeypatch):
    def _fake_verify(self, token):
        # token == "valid:<email>" → identité simulée
        email = token.split(":", 1)[1]
        return Claims(user_id=f"fb_{email}", email=email, role="customer", provider="firebase")
    monkeypatch.setattr("app.auth.firebase_adapter.FirebaseAdapter.verify", _fake_verify)
    monkeypatch.setattr("app.auth.firebase_adapter.FirebaseAdapter.__init__", lambda self: None)

def test_new_driver_gets_role(client):
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:d@x.io", "role": "driver"})
    assert r.status_code == 200
    assert r.json()["access_token"]

def test_admin_requires_code(client):
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:a@x.io", "role": "admin"})
    assert r.status_code == 403

def test_admin_with_code_ok(client):
    r = client.post("/v1/auth/firebase",
                    json={"id_token": "valid:a@x.io", "role": "admin", "admin_code": "ZIZA-ADMIN-2024"})
    assert r.status_code == 200

def test_existing_user_role_not_escalated(client):
    client.post("/v1/auth/firebase", json={"id_token": "valid:c@x.io", "role": "customer"})
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:c@x.io", "role": "admin"})
    assert r.status_code == 200  # login ok, mais rôle reste customer (vérif via /v1/me)
```

> `client` : réutiliser la fixture TestClient de `conftest.py` (vérifier le nom exact).

**Step 2 : Vérifier l'échec**

Run: `cd apps/api && pytest tests/test_firebase_auth.py -q`
Expected: FAIL (endpoint 404).

**Step 3 : Implémenter l'endpoint dans `main.py`**

```python
class FirebaseTokenRequest(BaseModel):
    id_token: str
    role: str = "customer"            # customer | driver | professional | admin
    admin_code: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    phone: str | None = None
    name: str | None = None


@app.post("/v1/auth/firebase", tags=["auth"],
          summary="Exchange a Firebase ID token for a Ziza JWT + refresh token")
async def auth_firebase(
    body: FirebaseTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Vérifie l'ID token Firebase, upsert le User (rôle en DB), émet le JWT maison."""
    _ALLOWED_ROLES = {"customer", "driver", "professional", "admin"}
    if body.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"role must be one of: {', '.join(sorted(_ALLOWED_ROLES))}",
        )
    if body.role == "admin" and body.admin_code != settings.admin_signup_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin registration code",
        )

    from app.auth.firebase_adapter import FirebaseAdapter  # noqa: PLC0415
    identity = FirebaseAdapter().verify(body.id_token)   # 401 si invalide

    user, _ = await crud.upsert_firebase_user(
        db, uid=identity.user_id, email=identity.email, role=body.role,
        first_name=body.first_name, last_name=body.last_name,
        date_of_birth=body.date_of_birth, phone=body.phone, name=body.name,
    )

    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415
    access_token = DevAdapter().issue_raw(user.email, user.user_id, user.role)
    raw_refresh, _ = await crud.create_refresh_token(db, user.user_id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_min * 60,
        refresh_token=raw_refresh,
    )
```

**Step 4 : Vérifier le passage + suite complète**

Run: `cd apps/api && pytest tests/test_firebase_auth.py tests/ -q`
Expected: PASS (4 nouveaux tests verts, 52 fichiers existants verts).

**Step 5 : Commit**

```bash
git add apps/api/app/main.py apps/api/tests/test_firebase_auth.py
git commit -m "feat(auth): POST /v1/auth/firebase — échange ID token Firebase contre JWT maison"
```

---

## Task 6 : Garde de cohérence — `/v1/token` reste 404 en prod (test de régression)

**Files:**
- Test: Create `apps/api/tests/test_prod_login_surface.py`

**Step 1 : Test**

```python
def test_token_endpoint_404_in_prod(client, monkeypatch):
    monkeypatch.setattr("app.config.settings.environment", "prod")
    r = client.post("/v1/token", json={"email": "admin@ziza.dev", "password": "ziza2024"})
    assert r.status_code == 404

def test_signup_endpoint_404_in_prod(client, monkeypatch):
    monkeypatch.setattr("app.config.settings.environment", "prod")
    r = client.post("/v1/auth/signup", json={"email": "x@y.io", "password": "secret123"})
    assert r.status_code == 404
```

**Step 2 : Run**

Run: `cd apps/api && pytest tests/test_prod_login_surface.py -q`
Expected: PASS (comportement déjà en place — c'est un verrou de non-régression).

**Step 3 : Commit**

```bash
git add apps/api/tests/test_prod_login_surface.py
git commit -m "test(auth): verrou — /v1/token et /v1/auth/signup restent 404 en prod"
```

---

## Task 7 : Intégration frontend de référence — `web-customer`

**Files:**
- Modify: `apps/web-customer/src/auth.js` (ajouter email/password Firebase)
- Modify: `apps/web-customer/src/api.js` (remplacer `/v1/token` par `/v1/auth/firebase`)
- Modify: `apps/web-customer/src/App.jsx` (brancher login email/password + Google sur le nouveau flux)
- Modify: `apps/web-customer/.env.example` (documenter `VITE_FIREBASE_*`)

**Step 1 : Étendre `auth.js`** — ajouter signup/login email-password Firebase qui renvoient un ID token :

```javascript
export async function signUpEmail(email, password) {
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

export async function signInEmail(email, password) {
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}
```

**Step 2 : Dans `api.js`**, remplacer la fonction de login pour échanger l'ID token :

```javascript
export async function exchangeFirebaseToken(idToken, { role = "customer", firstName, lastName, dob, phone } = {}) {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken, role,
      first_name: firstName, last_name: lastName, date_of_birth: dob, phone,
    }),
  });
  if (!res.ok) throw new Error("Authentication failed");
  return res.json(); // { access_token, refresh_token, expires_in }
}
```

**Step 3 : Dans `App.jsx`**, sur submit du formulaire login/signup : appeler `signInEmail`/`signUpEmail` (ou `signInWithGoogle`) → `exchangeFirebaseToken(idToken, { role: "customer", ... })` → stocker `access_token`/`refresh_token` comme aujourd'hui. Le rôle est **fixé en dur** à `"customer"` pour cette app.

**Step 4 : Vérifier le build**

Run: `cd apps/web-customer && npm install && npm run build`
Expected: build Vite OK, aucune erreur.

**Step 5 : Vérification manuelle locale** (avec un projet Firebase de test + `VITE_FIREBASE_API_KEY` défini, API locale en dev) : signup email/password → reçoit un JWT → `/v1/me` renvoie `role: customer`. Tester aussi le bouton Google.

**Step 6 : Commit**

```bash
git add apps/web-customer/src/auth.js apps/web-customer/src/api.js apps/web-customer/src/App.jsx apps/web-customer/.env.example
git commit -m "feat(web-customer): login via Firebase (email/password + Google) → échange JWT"
```

---

## Tasks 8–13 : Répliquer l'intégration sur les autres apps

Pour **chaque** app ci-dessous, appliquer **exactement le patron de la Task 7**, en respectant l'isolation (copier le code dans les fichiers propres à l'app, jamais d'import croisé). Seuls le **rôle** et le **SDK** changent :

| Task | App | Rôle fixé | SDK |
|---|---|---|---|
| 8 | `apps/web-driver` | `driver` | `firebase` (déjà présent) |
| 9 | `apps/web-admin` | `admin` (+ saisie `admin_code` dans le form) | `firebase` (déjà présent) |
| 10 | `apps/web-craft` | `professional` | **ajouter** `firebase` à `package.json` |
| 11 | `apps/mobile-customer` | `customer` | **ajouter** `firebase` (JS SDK, compatible Expo) ; Google via `expo-auth-session` |
| 12 | `apps/mobile-driver` | `driver` | idem mobile |
| 13 | `apps/mobile-craft` | `professional` | idem mobile |

**Spécificités :**
- **web-admin (Task 9)** : ajouter un champ `admin_code` au formulaire et le passer dans `exchangeFirebaseToken(idToken, { role: "admin", adminCode })` ; étendre le body avec `admin_code`.
- **Mobile (Tasks 11–13)** : créer `auth.ts` (équivalent TS de `auth.js`), brancher dans `AuthContext.tsx`, stocker le JWT via AsyncStorage comme aujourd'hui. Vérif CI : `npx tsc --noEmit` + `npx jest`.

**Pour chaque task** : Build/typecheck (`npm run build` web, `npx tsc --noEmit` mobile) → vérif manuelle login → commit `feat(<app>): login via Firebase → échange JWT`.

---

## Task 14 : Script de migration des comptes bcrypt → Firebase

**Files:**
- Create: `apps/api/scripts/migrate_bcrypt_to_firebase.py`
- Create: `apps/api/scripts/README_migration.md`

**Step 1 : Écrire le script** — exporte les users `provider="local"` (avec `password_hash`) au format `firebase auth:import`, puis documente la commande :

```python
# apps/api/scripts/migrate_bcrypt_to_firebase.py
"""Exporte les comptes locaux (bcrypt) vers un JSON importable par Firebase.

Usage:
    python -m scripts.migrate_bcrypt_to_firebase > users_export.json
    firebase auth:import users_export.json \
        --hash-algo=BCRYPT --project <PROJECT_ID>

Firebase recalcule le hash bcrypt natif → mots de passe inchangés pour l'user.
"""
import asyncio, json, sys
from app.db import async_session
from app import crud  # ajouter crud.list_local_users si absent

async def main() -> None:
    async with async_session() as db:
        users = await crud.list_local_users(db)  # provider == "local" AND password_hash IS NOT NULL
    payload = {"users": [
        {"localId": u.user_id, "email": u.email, "passwordHash": u.password_hash}
        for u in users
    ]}
    json.dump(payload, sys.stdout)

if __name__ == "__main__":
    asyncio.run(main())
```

> Note : `firebase auth:import` attend le hash en base64url ; vérifier le format bcrypt stocké et convertir si nécessaire (documenter dans le README). Les `user_id` (`usr_*`/`fb_*`) restent les `localId` Firebase → cohérence avec `User.user_id` côté DB.

**Step 2 : Ajouter `crud.list_local_users`** si absent (`select(User).where(User.provider == "local", User.password_hash.isnot(None))`).

**Step 3 : Dry-run local** sur la base de dev : `python -m scripts.migrate_bcrypt_to_firebase | python -m json.tool | head` → JSON valide.

**Step 4 : Commit**

```bash
git add apps/api/scripts/migrate_bcrypt_to_firebase.py apps/api/scripts/README_migration.md apps/api/app/crud.py
git commit -m "feat(scripts): export comptes bcrypt → format firebase auth:import"
```

---

## Validation finale

- `cd apps/api && pytest -q` → **tous** les tests verts (52 existants + nouveaux).
- CI verte (`ci.yml` : backend-test, docker-build, mobile builds, frontend-isolation).
- Vérif manuelle login sur chaque app (email/password + Google web).
- Suivre `godmode:completion-gate` avant de déclarer terminé : exécuter les commandes et lire leur sortie avant toute affirmation de succès.

## Hors périmètre (Phases suivantes)

- `deploy-prod.yml`, `ENVIRONMENT=prod`, secrets via Secret Manager, `VITE_FIREBASE_*` injectés au build → **Phase 1/2**.
- Exécution réelle de `firebase auth:import` en prod → fenêtre de migration au go-live.
