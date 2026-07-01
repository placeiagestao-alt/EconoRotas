#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${OSRM_DOMAIN:-osrm.econorotas.com}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@econorotas.com}"
ROOT_DIR="${OSRM_ROOT_DIR:-/opt/econorota-osrm}"
ACME_WEBROOT="${ACME_WEBROOT:-/var/www/letsencrypt}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo OSRM_DOMAIN=$DOMAIN LETSENCRYPT_EMAIL=$EMAIL bash infra/osrm/install-ubuntu.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release nginx certbot

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

mkdir -p "$ROOT_DIR/data" "$ACME_WEBROOT"
cp "$(dirname "$0")/docker-compose.yml" "$ROOT_DIR/docker-compose.yml"
cp "$(dirname "$0")/osrm-health.sh" "$ROOT_DIR/osrm-health.sh"
cp "$(dirname "$0")/prepare-brazil-map.sh" "$ROOT_DIR/prepare-brazil-map.sh"
chmod +x "$ROOT_DIR/osrm-health.sh" "$ROOT_DIR/prepare-brazil-map.sh"

cat >/etc/nginx/sites-available/econorota-osrm <<EOF
server {
  listen 80;
  server_name $DOMAIN;

  location ^~ /.well-known/acme-challenge/ {
    root $ACME_WEBROOT;
    default_type text/plain;
  }

  location / {
    return 200 "econorota-osrm-bootstrap\n";
  }
}
EOF

ln -sf /etc/nginx/sites-available/econorota-osrm /etc/nginx/sites-enabled/econorota-osrm
nginx -t
systemctl reload nginx || systemctl restart nginx

certbot certonly \
  --webroot \
  -w "$ACME_WEBROOT" \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL"

cat >/etc/nginx/sites-available/econorota-osrm <<EOF
server {
  listen 80;
  server_name $DOMAIN;

  location ^~ /.well-known/acme-challenge/ {
    root $ACME_WEBROOT;
    default_type text/plain;
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl;
  server_name $DOMAIN;

  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

  location = /health {
    proxy_pass http://127.0.0.1:5000/route/v1/driving/-51.407,-22.121;-51.406,-22.122?overview=false&alternatives=false&steps=false;
    proxy_set_header Host \$host;
    proxy_read_timeout 30s;
    proxy_connect_timeout 10s;
  }

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host \$host;
    proxy_read_timeout 120s;
    proxy_connect_timeout 30s;
  }
}
EOF

nginx -t
systemctl reload nginx || systemctl restart nginx

install -m 0755 -d /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-econorota-osrm-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-econorota-osrm-nginx.sh

ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

cat >/etc/systemd/system/econorota-osrm.service <<EOF
[Unit]
Description=EconoRota OSRM Brazil
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$ROOT_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable econorota-osrm.service

echo "Instalacao base concluida em $ROOT_DIR."
echo "Proximo passo: bash $ROOT_DIR/prepare-brazil-map.sh ou executar os comandos do README para baixar e processar o mapa."
