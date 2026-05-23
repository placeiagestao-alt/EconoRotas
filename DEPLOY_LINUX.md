# Deploy Linux do EconoRotas

Este roteiro e o caminho para o app funcionar fora do Windows.

## Requisitos

- VPS Linux com IP publico.
- Docker e Docker Compose instalados.
- Portas `80` e `443` liberadas no firewall da VPS.
- Dominio DuckDNS apontando para o IP publico da VPS.

## Configuracao

No servidor:

```bash
cp .env.production.example .env.production
nano .env.production
```

Para o dominio atual, use:

```env
PUBLIC_DOMAIN=econorotas.duckdns.org
PUBLIC_APP_URL=https://econorotas.duckdns.org
ALLOWED_ORIGINS=https://econorotas.duckdns.org
DUCKDNS_DOMAIN=econorotas
```

Preencha tambem:

```env
MYSQL_PASSWORD=...
MYSQL_ROOT_PASSWORD=...
DATABASE_URL=mysql://routing_user:SENHA@mysql:3306/routing_pwa
JWT_SECRET=...
DUCKDNS_TOKEN=...
```

## Subir producao

```bash
chmod +x scripts/*.sh
./scripts/prod-deploy.sh
```

Teste:

```bash
curl https://econorotas.duckdns.org/api/health
```

## Android

Depois que o endpoint HTTPS responder `ok: true`, compile o Android com:

```bash
pnpm run android:sync:prod
cd android
./gradlew assembleDebug
```

Para publicacao real, configure assinatura Android e use `assembleRelease`.
