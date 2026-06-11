#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${OSRM_BASE_URL:-http://127.0.0.1:5000}"

echo "Health:"
curl -fsS "$BASE_URL/route/v1/driving/-51.407,-22.121;-51.406,-22.122?overview=false&alternatives=false&steps=false" | head -c 500
echo

echo "Route:"
curl -fsS "$BASE_URL/route/v1/driving/-51.407,-22.121;-51.406,-22.122?overview=false" | head -c 500
echo

echo "Table:"
curl -fsS "$BASE_URL/table/v1/driving/-51.407,-22.121;-51.406,-22.122;-51.405,-22.123?annotations=duration,distance" | head -c 500
echo
