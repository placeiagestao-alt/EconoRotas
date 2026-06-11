#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${OSRM_ROOT_DIR:-/opt/econorota-osrm}"
DATA_DIR="$ROOT_DIR/data"
MAP_URL="${OSRM_BRAZIL_PBF_URL:-https://download.geofabrik.de/south-america/brazil-latest.osm.pbf}"
MAP_FILE="$DATA_DIR/brazil-latest.osm.pbf"
META_FILE="$DATA_DIR/brazil-map-meta.json"

mkdir -p "$DATA_DIR"

echo "Baixando mapa Brazil: $MAP_URL"
curl -L --fail --retry 3 -o "$MAP_FILE" "$MAP_URL"

echo "Executando osrm-extract..."
docker run --rm -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf

echo "Executando osrm-partition..."
docker run --rm -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest \
  osrm-partition /data/brazil-latest.osrm

echo "Executando osrm-customize..."
docker run --rm -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest \
  osrm-customize /data/brazil-latest.osrm

cat >"$META_FILE" <<EOF
{
  "mapUrl": "$MAP_URL",
  "mapFile": "$MAP_FILE",
  "mapImportedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "mapSizeBytes": $(stat -c%s "$MAP_FILE"),
  "osrmImage": "osrm/osrm-backend:latest"
}
EOF

systemctl restart econorota-osrm.service || docker compose -f "$ROOT_DIR/docker-compose.yml" up -d

echo "Mapa processado. Metadados:"
cat "$META_FILE"
