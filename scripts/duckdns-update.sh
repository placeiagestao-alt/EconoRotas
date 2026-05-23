#!/usr/bin/env sh
set -eu

: "${DUCKDNS_DOMAIN:?Set DUCKDNS_DOMAIN without .duckdns.org, for example econorotas-anderson}"
: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN from your DuckDNS account}"

DUCKDNS_IP="${DUCKDNS_IP:-}"
DUCKDNS_LOG="${DUCKDNS_LOG:-./duckdns.log}"

response="$(
  curl -fsS \
    "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=${DUCKDNS_IP}"
)"

printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$response" >> "$DUCKDNS_LOG"

if [ "$response" != "OK" ]; then
  printf 'DuckDNS update failed: %s\n' "$response" >&2
  exit 1
fi
