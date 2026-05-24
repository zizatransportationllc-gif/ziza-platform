# Ziza API

Sprint 1 minimal FastAPI backend.

## Endpoints

| Method | Path       | Description           |
|--------|------------|-----------------------|
| GET    | `/health`  | Liveness probe        |
| GET    | `/v1/demo` | Sprint 1 demo payload |

## Local development

```bash
# 1. Install
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Run
uvicorn app.main:app --reload --port 8000

# 3. Test
pytest
```

## Docker

```bash
docker build -t ziza-api .
docker run --rm -p 8000:8000 ziza-api
curl http://localhost:8000/health
```

## Environment variables

| Variable        | Default                                                          | Description              |
|-----------------|------------------------------------------------------------------|--------------------------|
| `ENVIRONMENT`   | `dev`                                                            | Logical env name         |
| `CORS_ORIGINS_RAW` | `http://localhost:3001,http://localhost:3002,http://localhost:3003` | Comma-separated CORS list |
| `PORT`          | `8000`                                                           | Listening port (Cloud Run injects this) |
