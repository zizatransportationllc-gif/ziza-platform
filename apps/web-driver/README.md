# web-driver (Sprint 1 demo)

Standalone driver frontend. **No shared dependencies** with `web-customer` or `web-admin`.

## Local dev

```bash
npm install
VITE_API_URL=http://localhost:8000 npm run dev
# → http://localhost:3002
```

## Build & Docker

```bash
docker build --build-arg VITE_API_URL=http://localhost:8000 -t ziza-web-driver .
docker run --rm -p 3002:8080 ziza-web-driver
```

## Environment variables

| Variable        | Stage      | Description                              |
|-----------------|------------|------------------------------------------|
| `VITE_API_URL`  | build-time | Backend URL baked into the JS bundle     |
| `PORT`          | runtime    | nginx listening port (Cloud Run injects) |
