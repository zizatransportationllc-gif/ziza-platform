# web-admin (Sprint 1 demo)

Standalone admin frontend. **No shared dependencies** with `web-customer` or `web-driver`.

## Local dev

```bash
npm install
VITE_API_URL=http://localhost:8000 npm run dev
# → http://localhost:3003
```

## Build & Docker

```bash
docker build --build-arg VITE_API_URL=http://localhost:8000 -t ziza-web-admin .
docker run --rm -p 3003:8080 ziza-web-admin
```

## Environment variables

| Variable        | Stage      | Description                              |
|-----------------|------------|------------------------------------------|
| `VITE_API_URL`  | build-time | Backend URL baked into the JS bundle     |
| `PORT`          | runtime    | nginx listening port (Cloud Run injects) |
