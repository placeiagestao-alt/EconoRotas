# EconoRotas em producao

Este modo remove a dependencia do Windows local. O Android passa a chamar um backend publico HTTPS, e o backend roda em Linux/Docker com MySQL persistente.

## 1. Dominio gratis com DuckDNS

Use DuckDNS para obter um subdominio gratis, por exemplo:

```text
econorotas-anderson.duckdns.org
```

No site do DuckDNS:

1. Acesse `https://www.duckdns.org`.
2. Entre com uma conta.
3. Crie um dominio, sem `.duckdns.org`, por exemplo `econorotas-anderson`.
4. Copie o `token`.

No servidor Linux, configure o atualizador de IP:

```bash
chmod +x scripts/duckdns-update.sh
DUCKDNS_DOMAIN=econorotas-anderson DUCKDNS_TOKEN=seu_token ./scripts/duckdns-update.sh
```

Para atualizar automaticamente a cada 5 minutos:

```bash
crontab -e
```

Adicione:

```cron
*/5 * * * * cd /caminho/do/econorotas && DUCKDNS_DOMAIN=econorotas-anderson DUCKDNS_TOKEN=seu_token ./scripts/duckdns-update.sh >/dev/null 2>&1
```

## 2. Servidor Linux/Docker

No servidor:

```bash
cp .env.production.example .env.production
```

Edite `.env.production` e preencha, no minimo:

- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET`
- `OWNER_EMAIL`
- `PUBLIC_DOMAIN`
- `PUBLIC_APP_URL`
- `ALLOWED_ORIGINS`
- `DUCKDNS_DOMAIN`
- `DUCKDNS_TOKEN`

Para dominio DuckDNS, use por exemplo:

```env
PUBLIC_DOMAIN=econorotas-anderson.duckdns.org
PUBLIC_APP_URL=https://econorotas-anderson.duckdns.org
ALLOWED_ORIGINS=https://econorotas-anderson.duckdns.org
DUCKDNS_DOMAIN=econorotas-anderson
DUCKDNS_TOKEN=seu_token
```

Suba o backend, banco e HTTPS publico com Caddy:

```bash
chmod +x scripts/*.sh
./scripts/prod-deploy.sh
```

Se o Docker local falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE` durante download de pacote, o problema e a cadeia de certificados do Docker/empresa. Para teste local temporario:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build --build-arg NPM_CONFIG_STRICT_SSL=false
```

Em servidor de producao, prefira corrigir a CA do Docker e manter `NPM_CONFIG_STRICT_SSL=true`.

Teste o backend:

```bash
curl https://econorotas-anderson.duckdns.org/api/health
```

Se ainda estiver sem dominio, teste direto no servidor:

```bash
curl http://localhost:3000/api/health
```

Observacao: para o HTTPS automatico funcionar, o servidor precisa aceitar conexoes publicas nas portas `80` e `443`.

## 3. Android sem depender do Windows

Crie o arquivo de producao:

```bash
cp .env.android-production.example .env.android-production
```

Edite:

```env
VITE_API_BASE_URL=https://econorotas-anderson.duckdns.org
VITE_ENABLE_DEV_LOGIN=false
```

Sincronize o Android com o bundle de producao:

```bash
pnpm run android:sync:prod
cd android
./gradlew assembleRelease
```

Para teste rapido em debug:

```bash
pnpm run android:sync:prod
cd android
./gradlew assembleDebug
```

## 4. Regras importantes

- O APK de producao nao deve apontar para `localhost`, `10.0.2.2` ou `192.168.x.x`.
- `VITE_ENABLE_DEV_LOGIN=true` e apenas para teste local.
- O servidor em `NODE_ENV=production` exige `DATABASE_URL` e `JWT_SECRET`.
- O login proprio por e-mail/senha nao depende do OAuth Manus. O primeiro cadastro vira admin.
- O app Android precisa de internet para buscar rotas, login, banco e geocodificacao no backend.
- OpenStreetMap/Leaflet continua sem chave do Google Maps.
