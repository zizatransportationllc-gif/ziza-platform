# ---- Landing page — static Nginx ----
# Sprint 31: pure HTML/CSS/JS served by Nginx (no build step needed)

FROM nginx:1.27-alpine

# Copy static files
COPY index.html  /usr/share/nginx/html/index.html
COPY styles.css  /usr/share/nginx/html/styles.css
COPY main.js     /usr/share/nginx/html/main.js

# Override default Nginx config to:
#  - serve on port 8080 (Cloud Run convention)
#  - add security headers
#  - enable gzip
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
