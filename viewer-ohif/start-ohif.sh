#!/bin/sh
set -eu

# Ensure mounted runtime config files are used instead of stale precompressed build artifacts.
rm -f /usr/share/nginx/html/app-config.js.gz /usr/share/nginx/html/app-config.js.br
rm -f /usr/share/nginx/html/orthanc-standalone.json.gz /usr/share/nginx/html/orthanc-standalone.json.br

# Avoid service worker MIME issues in Electron/dev runtime.
cat >/usr/share/nginx/html/init-service-worker.js <<'EOF'
export {};
EOF

# Proxy DICOMweb to Orthanc through same origin to avoid browser CORS failures.
cat >/etc/nginx/conf.d/default.conf <<'EOF'
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html index.htm;
  gzip_static always;
  gzip_proxied expired no-cache no-store private auth;
  gunzip on;

  # Serve module files with JS MIME and avoid rewriting missing files to index.html.
  location ~* \.mjs$ {
    default_type application/javascript;
    try_files $uri =404;
  }

  # Static assets should 404 when missing (not return index.html).
  location ~* \.(?:js|css|map|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$ {
    try_files $uri =404;
  }

  location /dicom-web/ {
    proxy_pass http://host.docker.internal:8042/dicom-web/;
    proxy_http_version 1.1;
    proxy_set_header Host host.docker.internal:8042;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /wado {
    proxy_pass http://host.docker.internal:8042/wado;
    proxy_http_version 1.1;
    proxy_set_header Host host.docker.internal:8042;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }

  error_page 500 502 503 504 /50x.html;
  location = /50x.html {
    root /usr/share/nginx/html;
  }
}
EOF

exec nginx -g 'daemon off;'
