# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Build-time API URL (baked into the JS bundle by Vite)
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# --- Serve stage ---
FROM nginx:alpine AS serve

# Cloud Run uses $PORT (default 8080). nginx must listen on it.
ENV PORT=8080

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080

# nginx:alpine has envsubst-based template processing built in
CMD ["nginx", "-g", "daemon off;"]
