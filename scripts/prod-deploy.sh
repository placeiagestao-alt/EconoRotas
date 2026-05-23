#!/usr/bin/env sh
set -eu

COMPOSE_FILES="-f docker-compose.prod.yml -f docker-compose.public.yml"
ENV_FILE="${ENV_FILE:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing %s. Copy .env.production.example and fill production values first.\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

: "${PUBLIC_DOMAIN:?Set PUBLIC_DOMAIN in .env.production}"
: "${PUBLIC_APP_URL:?Set PUBLIC_APP_URL in .env.production}"
: "${DATABASE_URL:?Set DATABASE_URL in .env.production}"
: "${JWT_SECRET:?Set JWT_SECRET in .env.production}"

if [ "${VITE_ENABLE_DEV_LOGIN:-false}" = "true" ]; then
  printf 'VITE_ENABLE_DEV_LOGIN cannot be true in production.\n' >&2
  exit 1
fi

if [ -n "${DUCKDNS_DOMAIN:-}" ] && [ -n "${DUCKDNS_TOKEN:-}" ]; then
  ./scripts/duckdns-update.sh
fi

docker compose --env-file "$ENV_FILE" $COMPOSE_FILES up -d --build
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml run --rm app pnpm run db:migrate

printf 'Waiting for HTTPS health check at %s/api/health...\n' "$PUBLIC_APP_URL"
for attempt in $(seq 1 30); do
  if curl -fsS "$PUBLIC_APP_URL/api/health" >/tmp/econorotas-health.json 2>/tmp/econorotas-health.err; then
    cat /tmp/econorotas-health.json
    printf '\nProduction deploy finished.\n'
    exit 0
  fi

  printf 'Health check attempt %s/30 failed; retrying...\n' "$attempt"
  sleep 5
done

printf 'Health check failed. Caddy logs:\n' >&2
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES logs --tail=120 caddy >&2
exit 1
