# OSRM Enterprise - EconoRota

Objetivo: hospedar OSRM proprio para remover dependencia do `router.project-osrm.org`.

## Ambiente Local - Presidente Prudente

O recorte local usa dados oficiais do Sudeste, Sul e Centro-Oeste. Ele cobre
todo o raio operacional de 200 km a partir de `-51.407,-22.121`, incluindo o
oeste paulista, o norte do Parana e o leste de Mato Grosso do Sul.

O processamento usa 20 km de margem para nao cortar estradas junto a borda. O
retangulo de extracao e `-53.540317,-24.097285,-49.273683,-20.144715`. O
arquivo processado se chama `presidente-prudente-200km-latest.osrm` e usa o
perfil de carro (`car.lua`).

Arquivos de mapa e artefatos processados ficam em `infra/osrm/data` e nao sao
versionados. Para subir o conjunto ja preparado no Windows/PowerShell:

```powershell
docker run -d `
  --name econorota-osrm-presidente-prudente-200km `
  --restart unless-stopped `
  -p 127.0.0.1:5000:5000 `
  -v "${PWD}/infra/osrm/data:/data:ro" `
  osrm/osrm-backend:latest `
  osrm-routed --algorithm mld /data/presidente-prudente-200km-latest.osrm
```

O bind em `127.0.0.1` e intencional: a porta 5000 nao deve ficar exposta na
rede. Para reiniciar um container ja criado:

```powershell
docker restart econorota-osrm-presidente-prudente-200km
```

Como alternativa ao `docker run`, o compose aceita o recorte sem alterar o
padrao Brasil usado no servidor. Use apenas uma das duas formas para criar o
container:

```powershell
$env:OSRM_DATASET = "presidente-prudente-200km-latest"
$env:OSRM_CONTAINER_NAME = "econorota-osrm-presidente-prudente-200km"
docker compose -f infra/osrm/docker-compose.yml up -d
```

As fontes usadas para recriar esse recorte sao:

```text
https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf
https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf
https://download.geofabrik.de/south-america/brazil/centro-oeste-latest.osm.pbf
```

Valide os arquivos `.md5` publicados pela Geofabrik antes de processar. Depois,
recorte cada fonte com `osmium extract --strategy=complete_ways`, usando o
retangulo acima, mescle os tres resultados com `osmium merge` e execute:

```powershell
docker run --rm -t -v "${PWD}/infra/osrm/data:/data" osrm/osrm-backend:latest `
  osrm-extract -p /opt/car.lua /data/presidente-prudente-200km-latest.osm.pbf
docker run --rm -t -v "${PWD}/infra/osrm/data:/data" osrm/osrm-backend:latest `
  osrm-partition /data/presidente-prudente-200km-latest.osrm
docker run --rm -t -v "${PWD}/infra/osrm/data:/data" osrm/osrm-backend:latest `
  osrm-customize /data/presidente-prudente-200km-latest.osrm
```

Validar os quatro servicos usados pelo motor:

```powershell
curl.exe "http://127.0.0.1:5000/nearest/v1/driving/-51.407,-22.121?number=1"
curl.exe "http://127.0.0.1:5000/route/v1/driving/-51.407,-22.121;-51.395,-22.125?overview=false"
curl.exe "http://127.0.0.1:5000/table/v1/driving/-51.407,-22.121;-51.406,-22.122;-51.395,-22.125?annotations=distance,duration"
curl.exe "http://127.0.0.1:5000/match/v1/driving/-51.406371,-22.120858;-51.403876,-22.123135;-51.400302,-22.124113;-51.395005,-22.124998?overview=false&tidy=true"
```

Para apontar uma execucao local do backend para esse motor:

```env
OSRM_ENABLED=true
OSRM_BASE_URL=http://127.0.0.1:5000
OSRM_REQUIRED=true
```

Esse endereco funciona somente neste computador. A Vercel exige uma instancia
OSRM em servidor proprio, acessivel por HTTPS; `localhost` nunca deve ser
configurado como `OSRM_BASE_URL` de producao.

## Provisionamento Automatizado

1. Criar servidor com pelo menos:
   - 4 vCPU minimo, 8 vCPU recomendado
   - 16 GB RAM runtime, 32 GB RAM recomendado para preprocessamento
   - 80 GB disco minimo
2. Liberar portas publicas:

   - `22/tcp` para instalacao via SSH.
   - `80/tcp` e `443/tcp` para Nginx/Certbot.
   - nao exponha `5000/tcp`; o OSRM fica atras do proxy.

Validar antes do deploy:

```powershell
pnpm run osrm:preflight
```

Se `readyForOsrmDeploy=false`, corrija os `blockers` antes de rodar a
instalacao. No ambiente local validado em 2026-06-30, o DNS estava correto para
`econorotas.duckdns.org -> 187.73.199.64`, mas o computador estava atras de NAT
em `192.168.5.10`, gateway `192.168.5.2`, roteador ZTE F8040, sem UPnP e com
`22/80/443` fechadas. Nesse cenario, criar redirecionamento de portas no
roteador/firewall e obrigatorio.

3. Apontar DNS:

`osrm.econorotas.com` -> IP publico do servidor.

Para usar DuckDNS temporariamente:

`econorotas.duckdns.org` -> IP publico do servidor.

4. Do Windows, executar o deploy automatizado:

```powershell
pnpm run osrm:deploy-server
```

Ou com parametros explicitos:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-osrm-server.ps1 `
  -ServerHost econorotas.duckdns.org `
  -Domain econorotas.duckdns.org `
  -LetsEncryptEmail admin@econorotas.com
```

Esse script envia os arquivos de `infra/osrm`, instala Docker/Nginx/Certbot,
processa o mapa do Brasil e valida `route` e `table` no endpoint HTTPS.

5. Ativar Vercel somente depois do OSRM responder:

```powershell
pnpm run osrm:activate-vercel
```

Esse segundo script valida o endpoint, configura:

```env
OSRM_ENABLED=true
OSRM_BASE_URL=https://econorotas.duckdns.org
OSRM_REQUEST_TIMEOUT_MS=8000
OSRM_HEALTH_TIMEOUT_MS=3000
OSRM_MAX_TABLE_NODES=100
OSRM_REQUIRED=true
OSRM_REQUIRED_MIN_STOPS=101
```

e publica novo deploy de producao.

## Provisionamento Manual

Copiar esta pasta para o servidor e executar:

```bash
sudo OSRM_DOMAIN=osrm.econorotas.com LETSENCRYPT_EMAIL=admin@econorotas.com bash install-ubuntu.sh
```

Processar mapa:

```bash
sudo bash /opt/econorota-osrm/prepare-brazil-map.sh
```

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
