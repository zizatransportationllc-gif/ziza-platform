# ---- Landing page — static Nginx ----
# Sprint 31: pure HTML/CSS/JS served by Nginx (no build step needed)
# Sprint 50: env-config.js generated at startup via envsubst so app URLs
#            work correctly in every environment without rebuilding the image.

FROM nginx:1.27-alpine

# Default app URLs (overridden by docker-compose env or Cloud Run env vars)
ENV ZIZA_DRIVER_URL=http://localhost:3002 \
    ZIZA_CUSTOMER_URL=http://localhost:3001 \
    ZIZA_CRAFT_URL=http://localhost:3004 \
    ZIZA_API_URL=http://localhost:8000 \
    ZIZA_FIREBASE_API_KEY= \
    ZIZA_FIREBASE_AUTH_DOMAIN= \
    ZIZA_FIREBASE_PROJECT_ID=

# Copy static files
COPY index.html            /usr/share/nginx/html/index.html
COPY styles.css            /usr/share/nginx/html/styles.css
COPY main.js               /usr/share/nginx/html/main.js
# Legal pages linked from the footer (were missing -> 404 fell back to index.html)
COPY terms.html            /usr/share/nginx/html/terms.html
COPY privacy.html          /usr/share/nginx/html/privacy.html
COPY legal.html            /usr/share/nginx/html/legal.html
COPY env-config.js.template /etc/nginx/env-config.js.template

# Override default Nginx config
RUN printf 'server {\n\
    listen 8080;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/html text/css application/javascript;\n\
    add_header X-Frame-Options "SAMEORIGIN";\n\
    add_header X-Content-Type-Options "nosniff";\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin";\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /health {\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

# Generate env-config.js from template (substituting the three URL vars),
# then hand off to nginx.  Using exec so nginx gets PID 1.
CMD ["/bin/sh", "-c", \
  "envsubst '$ZIZA_DRIVER_URL $ZIZA_CUSTOMER_URL $ZIZA_CRAFT_URL $ZIZA_API_URL $ZIZA_FIREBASE_API_KEY $ZIZA_FIREBASE_AUTH_DOMAIN $ZIZA_FIREBASE_PROJECT_ID' \
   < /etc/nginx/env-config.js.template \
   > /usr/share/nginx/html/env-config.js \
   && exec nginx -g 'daemon off;'"]
