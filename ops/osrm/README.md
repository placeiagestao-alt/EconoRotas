# OSRM proprio para EconoRota

Objetivo: tirar a roteirizacao do `router.project-osrm.org` e usar uma instancia
controlada pelo EconoRota. Isso reduz fallback, melhora previsibilidade e evita
dependencia de um servico publico sem SLA.

## Requisitos

- VM Linux com Docker.
- Pelo menos 4 vCPU e 8 GB RAM para recorte Brasil em teste.
- Disco com 30 GB livres para baixar e preparar o mapa.
- Porta publica HTTPS via proxy reverso, por exemplo:
  `https://osrm.econo-rotas.com`.

## Preparar dados

Rode dentro de `ops/osrm` no servidor:

```bash
mkdir -p data
cd data
wget https://download.geofabrik.de/south-america/brazil-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" osrm/osrm-backend:v5.27.0 \
  osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" osrm/osrm-backend:v5.27.0 \
  osrm-partition /data/brazil-latest.osrm
docker run --rm -t -v "$PWD:/data" osrm/osrm-backend:v5.27.0 \
  osrm-customize /data/brazil-latest.osrm
```

## Subir OSRM

```bash
cd ops/osrm
docker compose up -d
curl "http://127.0.0.1:5000/route/v1/driving/-51.407,-22.121;-51.406,-22.122?overview=false"
```

Se o retorno tiver `code: Ok`, coloque um proxy HTTPS na frente.

## Configurar Vercel

Depois do OSRM proprio estar respondendo via HTTPS:

```text
OSRM_ENABLED=true
OSRM_BASE_URL=https://seu-osrm-proprio.example.com
OSRM_PROFILE=driving
OSRM_REQUEST_TIMEOUT_MS=8000
OSRM_HEALTH_TIMEOUT_MS=3000
OSRM_MAX_TABLE_NODES=100
OSRM_REQUIRED=true
```

`OSRM_REQUIRED=true` e proposital: se o motor por ruas cair, o backend bloqueia a
otimizacao em vez de salvar uma rota por estimativa geografica.

## Validacao

- `/api/health` deve retornar `osrm.reachable: true`,
  `osrm.providerType: "self_hosted"` e `osrm.productionReady: true`.
- `/api/monitor/ping` deve retornar 200.
- O painel Operacao deve mostrar taxa de fallback OSRM caindo para perto de 0%.
- Se desligar o OSRM com `OSRM_REQUIRED=true`, o health deve retornar 500 e a
  otimizacao deve ser bloqueada.

## Observacao operacional

O mapa do Brasil muda. Reprocesse o `.osm.pbf` periodicamente, por exemplo uma
vez por mes, e suba uma nova instancia antes de trocar o proxy.
