# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Build-time vars (baked into the JS bundle by Vite)
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}
# Target of the "Become a Driver" link → standalone web-driver app
ARG VITE_DRIVER_URL=http://localhost:3002
ENV VITE_DRIVER_URL=${VITE_DRIVER_URL}
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_MAPBOX_TOKEN=
ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
ENV VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}

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
