# Ziza Platform — architecture overview

## Sprint 1 architecture (current)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   web-customer   │     │    web-driver    │     │    web-admin     │
│  React + Vite    │     │  React + Vite    │     │  React + Vite    │
│  nginx :8080     │     │  nginx :8080     │     │  nginx :8080     │
└─────────┬────────┘     └─────────┬────────┘     └─────────┬────────┘
          │                        │                        │
          └────────────┬───────────┴────────────┬───────────┘
                       │       HTTPS / CORS     │
                       ▼                        ▼
                 ┌─────────────────────────────────┐
                 │            api (FastAPI)        │
                 │            uvicorn :8000        │
                 │  - GET /health                  │
                 │  - GET /v1/demo                 │
                 └─────────────────────────────────┘

  Local:   docker compose
  GCP:     4× Cloud Run services in us-central1
           Images in Artifact Registry (repo "ziza")
```

**No database, no auth, no message bus in Sprint 1.** Those come later.

---

## Architectural decision records

### ADR-001 — Frontend isolation is non-negotiable

**Status:** Accepted (Sprint 1)

**Context.** Ziza needs three distinct web frontends (customer, driver, admin). The natural temptation in a monorepo is to share code through `packages/shared` or npm workspaces.

**Decision.** Each frontend is a **fully standalone package**:
- Its own `package.json` and `package-lock.json`
- Its own `node_modules` (no hoisting)
- Its own `Dockerfile`, `vite.config.js`, `nginx.conf.template`
- Its own `src/theme/tokens.css` (duplicated CSS variables are acceptable)
- Its own `api.js` client (duplicated `fetch` helpers are acceptable)
- **No relative imports** crossing the `apps/web-*/` boundary
- **No `packages/shared` directory** anywhere in the repo

CI enforces this with a job that fails the build on cross-frontend imports.

**Consequences.**
- ✅ Each frontend can be deployed, versioned, and rewritten independently
- ✅ A breaking change in one frontend cannot break another
- ✅ Each frontend can be assigned to a different team/agent
- ✅ Mobile apps will follow the same rule
- ❌ Some code (especially design tokens and API clients) is duplicated
- ❌ Visual consistency across frontends requires discipline, not tooling

**Rejected alternatives:**
- `npm workspaces` + `packages/shared` — fragile builds, hoisting surprises, accidental coupling
- `turborepo` / `nx` — overkill for 3 apps, locks us into a monorepo tool
- Component library as a published npm package — premature; revisit if/when 5+ frontends exist

**Revisit when:** the platform has more than 4 frontends AND a stable design system AND a dedicated platform team.

---

### ADR-002 — Auth abstraction deferred to Sprint 2

**Status:** Accepted (Sprint 1)

**Context.** Production will use Google Identity Platform / Firebase. Dev needs to be testable without cloud dependencies.

**Decision.** No auth code in Sprint 1. Sprint 2 introduces an `AuthAdapter` interface in the backend:
- DEV adapter: mock JWT or Keycloak in Docker
- PROD adapter: Google Identity Platform / Firebase
- Backend reads **normalized claims** (`user_id`, `email`, `role`, `provider`)
- No hardcoded Keycloak references in business logic

**Consequences.**
- ✅ Local tests stay simple
- ✅ Switching auth provider in prod is a config change, not a refactor
- ❌ One extra layer of indirection

---

### ADR-003 — Cloud Run as the runtime target

**Status:** Accepted (Sprint 1)

**Context.** We need a managed container runtime with HTTPS, autoscaling, low cost at idle.

**Decision.** Cloud Run for backend and all 3 frontends. Each frontend is a static SPA served by nginx in a container (same Cloud Run model as the API).

**Consequences.**
- ✅ One uniform deploy model (`gcloud run deploy`) for all 4 services
- ✅ Scale-to-zero → near-zero cost in dev
- ✅ Public HTTPS URLs out of the box
- ❌ Cold starts on first request (acceptable in dev, mitigate in prod with `min-instances=1`)
- ❌ `VITE_API_URL` baked at build time means frontends must be rebuilt when the API URL changes (documented in `gcp-dev.md`)

**Revisit when:** SPA serving cost becomes meaningful, in which case switch frontends to Cloud Storage + Load Balancer.

---

## Build-time vs runtime configuration

| Concern | Backend | Frontends |
|---|---|---|
| Listening port | `$PORT` runtime | `$PORT` runtime (nginx template) |
| API base URL | N/A | `VITE_API_URL` **build-time** (Vite limitation) |
| CORS origins | `CORS_ORIGINS_RAW` runtime | N/A |
| Environment name | `ENVIRONMENT` runtime | N/A in Sprint 1 |

The build-time nature of `VITE_API_URL` is the reason `gcp-dev.md` requires a two-step deploy on first install (deploy once, capture URLs, set GitHub vars, redeploy).

---

## Repo layout (current)

```
ziza-platform/
├── apps/
│   ├── api/                # FastAPI
│   │   ├── app/
│   │   ├── tests/
│   │   ├── requirements.txt
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   ├── web-customer/       # React + Vite — STANDALONE
│   ├── web-driver/         # React + Vite — STANDALONE
│   └── web-admin/          # React + Vite — STANDALONE
├── infra/
│   └── gcp/
│       └── bootstrap.sh
├── scripts/
│   ├── dev/{up,down}.sh
│   └── test/smoke.sh
├── docs/
│   ├── agile/sprint-1.md
│   ├── architecture/overview.md
│   └── deployment/gcp-dev.md
├── .github/workflows/
│   ├── ci.yml
│   └── deploy-dev.yml
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Future sprints will add:
- `apps/mobile-customer/`, `apps/mobile-driver/` (React Native or Flutter, TBD)
- Database migrations (Alembic) under `apps/api/`
- `infra/gcp/terraform/` if/when we outgrow shell scripts
- `docs/api/` (OpenAPI exported, ADRs for state machines)
