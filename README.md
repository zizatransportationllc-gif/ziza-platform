# Ziza Platform

Ride-share & road-side assistance platform.
Built sprint-by-sprint, multi-agent agile workflow.

> **Sprint 1 status:** Demo Deployable Foundation — proves the GitHub → Docker → GCP delivery chain. **No business logic yet, on purpose.**

## Architecture (current)

```
ziza-platform/
├── apps/
│   ├── api/              # FastAPI backend (Python 3.12)
│   ├── web-customer/     # React + Vite — STANDALONE
│   ├── web-driver/       # React + Vite — STANDALONE
│   └── web-admin/        # React + Vite — STANDALONE
├── infra/gcp/            # GCP bootstrap scripts
├── scripts/              # dev / test / deploy helpers
├── docs/                 # architecture, agile, deployment
└── .github/workflows/    # CI + deploy
```

**Isolation rule (non-negotiable):** the 3 frontends share zero code, zero `node_modules`, zero CSS, zero npm workspace. Each builds independently. CI enforces this.

## Quickstart (local)

```bash
# Prereqs: Docker, docker compose, Node 20+, Python 3.12+ (optional for local dev)
git clone https://github.com/<you>/ziza-platform.git
cd ziza-platform

cp .env.example .env
./scripts/dev/up.sh                  # docker compose up --build
./scripts/test/smoke.sh              # smoke-test all 4 services
```

| Service        | Local URL              |
|----------------|------------------------|
| Backend API    | http://localhost:8000  |
| web-customer   | http://localhost:3001  |
| web-driver     | http://localhost:3002  |
| web-admin      | http://localhost:3003  |

API self-docs: `http://localhost:8000/docs`

## Deploy to GCP (dev)

See [`docs/deployment/gcp-dev.md`](docs/deployment/gcp-dev.md).
Summary:

```bash
# One-time bootstrap of GCP resources
GCP_PROJECT_ID=<your-project> ./infra/gcp/bootstrap.sh

# Configure GitHub repo settings (vars + secrets), then:
git push origin main    # triggers .github/workflows/deploy-dev.yml
```

## Roadmap

See [`docs/agile/sprint-1.md`](docs/agile/sprint-1.md) for the current sprint.
Future sprints (auth, ride-share state machine, payment, road-side, mobile, prod auth, hardening) are scaffolded in the project brief.

## License

Proprietary — Ziza Transportation. All rights reserved.
