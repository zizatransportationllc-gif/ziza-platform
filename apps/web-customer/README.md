# web-customer (Sprint 1 demo)

Standalone customer frontend. **No shared dependencies** with `web-driver` or `web-admin`.

## Local dev

```bash
npm install
VITE_API_URL=http://localhost:8000 npm run dev
# → http://localhost:3001
```

## Build & Docker

```bash
docker build --build-arg VITE_API_URL=http://localhost:8000 -t ziza-web-customer .
docker run --rm -p 3001:8080 ziza-web-customer
```

## Environment variables

| Variable        | Stage      | Description                              |
|-----------------|------------|------------------------------------------|
| `VITE_API_URL`  | build-time | Backend URL baked into the JS bundle     |
| `PORT`          | runtime    | nginx listening port (Cloud Run injects) |
