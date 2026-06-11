# OSRM Enterprise - EconoRota

Objetivo: hospedar OSRM proprio para remover dependencia do `router.project-osrm.org`.

## Provisionamento Automatizado

1. Criar servidor com pelo menos:
   - 4 vCPU minimo, 8 vCPU recomendado
   - 16 GB RAM runtime, 32 GB RAM recomendado para preprocessamento
   - 80 GB disco minimo
2. Apontar DNS:

`osrm.econorotas.com` -> IP publico do servidor.

3. Copiar esta pasta para o servidor e executar:

```bash
sudo OSRM_DOMAIN=osrm.econorotas.com LETSENCRYPT_EMAIL=admin@econorotas.com bash install-ubuntu.sh
```

4. Processar mapa:

```bash
sudo bash /opt/econorota-osrm/prepare-brazil-map.sh
```

## Provisionamento Manual

Baixar mapa do Brasil:

```bash
mkdir -p data
curl -L -o data/brazil-latest.osm.pbf https://download.geofabrik.de/south-america/brazil-latest.osm.pbf
```

Preprocessar:

```bash
docker run --rm -t -v "$PWD/data:/data" osrm/osrm-backend:latest osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf
docker run --rm -t -v "$PWD/data:/data" osrm/osrm-backend:latest osrm-partition /data/brazil-latest.osrm
docker run --rm -t -v "$PWD/data:/data" osrm/osrm-backend:latest osrm-customize /data/brazil-latest.osrm
```

Subir OSRM:

```bash
docker compose up -d
```

Configurar proxy HTTPS:

`https://osrm.econorotas.com` -> `http://127.0.0.1:5000`

Configurar na aplicacao:

```env
OSRM_BASE_URL=https://osrm.econorotas.com
OSRM_REQUIRED=true
OSRM_ENABLED=true
OSRM_REQUEST_TIMEOUT_MS=8000
OSRM_HEALTH_TIMEOUT_MS=3000
OSRM_REQUIRED_MIN_STOPS=101
```

## Healthcheck

```bash
curl "https://osrm.econorotas.com/route/v1/driving/-51.407,-22.121;-51.406,-22.122?overview=false"
bash /opt/econorota-osrm/osrm-health.sh
```

Resposta esperada: `code: "Ok"`.

Na API do EconoRota, `/api/health` deve mostrar `osrm.reachable: true`.

## Benchmark Oficial

Depois de configurar `OSRM_BASE_URL=https://osrm.econorotas.com` no ambiente local/worker:

```bash
pnpm run benchmark:osrm-enterprise -- 250
pnpm run benchmark:osrm-enterprise -- 500
pnpm run benchmark:osrm-enterprise -- 1000
pnpm run benchmark:osrm-enterprise -- 2000
```

Critérios:

- 250 paradas < 15s
- 500 paradas < 30s
- 1000 paradas < 60s
- 2000 paradas < 180s
- falha OSRM < 1%
