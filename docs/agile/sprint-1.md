# Sprint 1 — Demo Deployable Foundation

**Duration:** 5–7 working days
**Goal:** Prove the **GitHub → Docker → GCP** delivery chain end-to-end **before adding any business logic**.

> If at the end of Sprint 1 the four services are deployed and reachable but the platform does nothing useful, **the sprint is a success**. The point is the pipeline, not the product.

---

## 1. Objectives

- Repo `ziza-platform` initialized with the target structure
- 1 backend (FastAPI) + 3 standalone frontends (React + Vite)
- Each app builds **independently** in Docker
- `docker compose up` runs the full stack locally
- GitHub Actions CI is green (lint + test + build all 4 apps + isolation guard)
- 4 Cloud Run services deployed to `us-central1` with public URLs
- Documentation complete and reproducible

**Explicit non-goals:** auth, database, state machines, ride-share logic, road-side logic, payment, mobile apps. None of that is touched in Sprint 1.

---

## 2. User stories

| ID | Story | Owner agent | Status |
|---|---|---|---|
| US-1.1 | Repo initialized with structure | Solution Architect | ☐ |
| US-1.2 | Backend API `/health` + `/v1/demo` | Backend | ☐ |
| US-1.3 | web-customer standalone | Frontend Customer | ☐ |
| US-1.4 | web-driver standalone | Frontend Driver | ☐ |
| US-1.5 | web-admin standalone | Frontend Admin | ☐ |
| US-1.6 | docker-compose local stack | DevOps | ☐ |
| US-1.7 | CI workflow (lint/test/build/isolation) | DevOps + QA | ☐ |
| US-1.8 | Deploy to Cloud Run dev | DevOps | ☐ |
| US-1.9 | Documentation (README + GCP + ADR) | Product Owner | ☐ |

---

## 3. Definition of Done (Sprint 1)

A story is Done **only if all boxes are checked**:

- [ ] Code merged to `main` via PR
- [ ] CI is green (backend tests + 4 Docker builds + isolation guard)
- [ ] `docker compose up` starts the stack with no error
- [ ] `./scripts/test/smoke.sh` passes locally
- [ ] No secret committed (`.env`, `*.json` keys, etc.)
- [ ] No cross-frontend imports (CI enforces)
- [ ] No `packages/shared` in any frontend
- [ ] README updated if behavior changed
- [ ] Environment variables documented

For Cloud Run deployment specifically:
- [ ] All 4 services respond with HTTP 200 at their public URLs
- [ ] Each frontend successfully fetches `/v1/demo` from the deployed API
- [ ] URLs documented in `docs/deployment/gcp-dev.md`

---

## 4. Acceptance criteria (sprint review)

Live demo agenda:

1. Open the GitHub repo → show structure and a green CI run
2. Local: `./scripts/dev/up.sh` → 4 containers up
3. Browse `localhost:3001`, `:3002`, `:3003` → 3 pages show "API reachable ✓" with JSON payload
4. Run `./scripts/test/smoke.sh` → all checks pass
5. Browse the 4 Cloud Run URLs → same behavior in the cloud
6. **Isolation proof:** delete `apps/web-driver/` entirely, rebuild `web-customer` Docker image → it still builds. Restore via `git checkout`.
7. Trigger a deliberate violation (add `import x from '../../web-driver/foo'` in `web-customer`), push to a branch → CI fails on the isolation guard job. Revert.

---

## 5. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GCP IAM misconfigured | High | Blocks deploy | `infra/gcp/bootstrap.sh` is idempotent and grants least-privilege roles explicitly |
| CORS mismatch between API and frontends in prod | Medium | Breaks demo | `ZIZA_CORS_ORIGINS` is a deploy var, set after first deploy when URLs are known. See post-deploy step in `gcp-dev.md` |
| `VITE_API_URL` baked into image at build time | High | Wrong URL → broken frontends | Documented: first deploy with placeholder, then redeploy frontends with actual API URL |
| Cross-frontend code sharing creep | High | Architectural debt | Frontend-isolation CI job runs on every PR |
| Cloud Run cold start surprises during demo | Medium | UX flicker | Acceptable for Sprint 1 dev env; revisit with `min-instances=1` in later sprints |
| Secret leaked via committed key file | Low | Critical | `.gitignore` excludes `*.key.json`, bootstrap script reminds to delete local key |
| `docker-compose` v1 vs v2 syntax confusion | Low | Local dev friction | Compose file uses v2 schema (no top-level `version:`) |

---

## 6. Sprint backlog by agent

### Product Owner
- Validate DoD with stakeholders
- Author this document + `gcp-dev.md` + `overview.md`
- Prepare sprint review script

### Solution Architect
- Validate repo structure
- Author ADR-001 (frontend isolation) in `docs/architecture/`
- Review every PR for architectural drift

### Backend Agent
- Implement `/health` + `/v1/demo`
- Configure CORS via env
- Write 3 pytest tests
- Author backend Dockerfile (non-root, `$PORT` honored)

### Frontend Customer / Driver / Admin Agents
- Each: standalone React + Vite app
- Each: own `package.json`, `package-lock.json`, `Dockerfile`, `nginx.conf.template`, `tokens.css`
- Each: fetch `/v1/demo` and render JSON
- **Forbidden:** any import from another frontend or `packages/shared`

### DevOps / GCP Agent
- `docker-compose.yml` (4 services, healthcheck on API)
- `.github/workflows/ci.yml` (matrix build + isolation guard)
- `.github/workflows/deploy-dev.yml` (build/push to Artifact Registry, deploy to Cloud Run)
- `infra/gcp/bootstrap.sh` (idempotent setup)
- Configure GitHub repo vars/secrets per `gcp-dev.md`

### QA Agent
- `scripts/test/smoke.sh` — works locally and against Cloud Run URLs
- Verify all 4 Docker builds pass in CI
- Manual smoke after each deploy

### Security Agent
- Audit `.gitignore` (no secret paths missed)
- Review bootstrap script: confirm only `artifactregistry.writer` + `run.admin` + `iam.serviceAccountUser` granted
- Confirm Cloud Run services run with default SA acceptable for Sprint 1 (revisit later)

### Scrum Master
- Daily standups
- Track blockers (especially GCP IAM)
- Prepare and run sprint review + retro

---

## 7. Sprint retrospective template (to fill at end)

### What went well
- _(fill in)_

### What didn't
- _(fill in)_

### What we'll change next sprint
- _(fill in)_

### Carry-over to Sprint 2
- _(fill in)_

---

## 8. What comes next (Sprint 2 preview)

**Sprint 2 — Auth DEV + role abstraction**
- Introduce `AuthAdapter` interface in backend
- Implement DEV adapter (mock JWT or Keycloak Docker)
- Add 3 seeded users: customer / driver / admin
- Add `/v1/me` endpoint returning normalized claims
- Backend tests: token generation, role-based access
- **Still no business logic.** Auth is plumbing for Sprint 3+.

We do **not** start Sprint 2 until Sprint 1's DoD is fully checked.
