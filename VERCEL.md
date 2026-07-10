# Deploy na Vercel

Plataforma escolhida: Vercel Hobby, por permitir deploy GitHub gratuito sem cartao para projetos pessoais.

## Projeto atual

- Deploy: `https://econo-rotas-bxso2tmdj-anderson-s-projects-ef32a938.vercel.app`
- Dominio principal: `https://econo-rotas.vercel.app`
- Branch: `main`

## Configuracao

1. Acesse https://vercel.com/new
2. Importe `placeiagestao-alt/EconoRotas`
3. Framework preset: `Other`
4. Build command: `pnpm run build:vercel:prod`
5. Output directory: `dist/public`
6. Install command: `pnpm install --frozen-lockfile`

O arquivo `vercel.json` ja define esses valores e direciona:

- `/api/*` para a funcao serverless Express
- `/manus-storage/*` para a mesma funcao, mantendo compatibilidade
- qualquer outra rota para `index.html`, necessario para o React Router/Wouter

## Variaveis obrigatorias

Defina em Environment Variables:

```env
DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/NOME_DO_BANCO
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
JWT_SECRET=gere_uma_chave_com_mais_de_32_caracteres
ALLOW_EPHEMERAL_DB=false
VITE_ENABLE_DEV_LOGIN=false
PUBLIC_APP_URL=https://econo-rotas.vercel.app
ALLOWED_ORIGINS=https://econo-rotas.vercel.app,https://econo-rotas-bxso2tmdj-anderson-s-projects-ef32a938.vercel.app,capacitor://localhost,https://localhost,http://localhost
NOMINATIM_CONTACT_EMAIL=placeiagestao@gmail.com
```

`DATABASE_URL` e obrigatorio. O backend nao sobe em producao com banco temporario, porque isso apaga usuarios, rotas e historico em reinicios/cold starts.

Antes de tratar como producao, rode:

```bash
pnpm run check:production
```

Esse comando falha de proposito enquanto faltar `DATABASE_URL`, `JWT_SECRET` forte ou URL publica HTTPS. A perda invisivel aqui e simples: o app pode parecer pronto no celular, mas qualquer rota salva em banco temporario pode desaparecer.

## Producao real com banco

Para uso real no smartphone e navegador, use um MySQL externo e defina `DATABASE_URL`.

Variaveis recomendadas para MySQL externo:

```env
DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/NOME_DO_BANCO
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
ALLOW_EPHEMERAL_DB=false
```

Use `DATABASE_SSL=true` para bancos externos que exigem TLS, como servicos MySQL gerenciados. Deixe `DATABASE_SSL_REJECT_UNAUTHORIZED=true` em producao. Use `false` apenas se o provedor orientar isso ou para diagnostico temporario de certificado.

Depois de configurar o banco, execute as migrations antes de usar o app em producao:

```bash
pnpm run db:migrate
```

No Windows/PowerShell, para rodar a migration local apontando para o banco externo:

```powershell
$env:DATABASE_URL="mysql://USUARIO:SENHA@HOST:3306/NOME_DO_BANCO"
$env:DATABASE_SSL="true"
corepack pnpm run db:migrate
```

Sem `DATABASE_URL`, o deploy de producao falha por decisao do backend.

## Politica de Disaster Recovery

Configure na Vercel e no host que executa a rotina:

```env
DR_RPO_HOURS=24
DR_RTO_HOURS=4
DR_RESTORE_MAX_AGE_HOURS=168
DR_RETENTION_DAYS=14
DR_SCHEDULE_ENABLED=false
```

Mude `DR_SCHEDULE_ENABLED` para `true` somente depois de validar a task/cron real.
Credenciais e nome do banco descartavel de restore devem permanecer apenas no
host operacional, nunca no frontend. Consulte
`ops/disaster-recovery/README.md`.

## OSRM proprio

Para escala comercial, configure estas variaveis no ambiente `Production` da
Vercel e no ambiente dos workers:

```env
OSRM_ENABLED=true
OSRM_BASE_URL=https://seu-osrm-proprio.example.com
OSRM_PROFILE=driving
OSRM_REQUEST_TIMEOUT_MS=8000
OSRM_HEALTH_TIMEOUT_MS=3000
OSRM_MAX_TABLE_NODES=100
OSRM_REQUIRED=true
```

`OSRM_BASE_URL` deve usar HTTPS e nao pode apontar para
`router.project-osrm.org`. O backend nao injeta endpoint publico quando a
variavel esta ausente. Com `OSRM_REQUIRED=true`, qualquer indisponibilidade do
OSRM bloqueia a otimizacao e impede fallback geografico silencioso.

Ative `OSRM_REQUIRED=true` somente depois de validar os endpoints `route` e
`table` da instancia propria. O script `pnpm run osrm:activate-vercel` executa
essa validacao antes de alterar as variaveis.

## Validacao

Apos o deploy, teste:

```bash
curl https://econo-rotas.vercel.app/api/health
```

Resposta esperada:

```json
{
  "ok": true,
  "app": "EconoRota",
  "environment": "production",
  "mode": "persistent",
  "osrm": { "providerType": "self_hosted", "productionReady": true }
}
```

## Android

Para gerar APK apontando para a Vercel, configure `.env.android-production` assim:

```env
VITE_API_BASE_URL=https://econo-rotas.vercel.app
VITE_ENABLE_DEV_LOGIN=false
```
