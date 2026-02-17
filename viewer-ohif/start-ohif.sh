#!/bin/sh
set -eu

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

  # Ensure .mjs modules are served as JavaScript.
  types { application/javascript mjs; }

  location / {
    try_files $uri $uri/ /index.html;
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

  error_page 500 502 503 504 /50x.html;
  location = /50x.html {
    root /usr/share/nginx/html;
  }
}
EOF

exec nginx -g 'daemon off;'
