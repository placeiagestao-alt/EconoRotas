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
4. Build command: `pnpm run build:vercel`
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
OPTIMIZATION_QUEUE_ENABLED=false
```

No beta de um usuario, `OPTIMIZATION_QUEUE_ENABLED=false` mantem rotas de ate
`MAX_SYNC_STOPS` no fluxo sincrono e impede consumo desnecessario do Redis/BullMQ.
Para ativar processamento assincrono, configure Redis, workers externos e altere
essa variavel para `true` na mesma promocao operacional.

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

## Validacao

Apos o deploy, teste:

```bash
curl https://econo-rotas.vercel.app/api/health
```

Resposta esperada:

```json
{"ok":true,"app":"EconoRotas","environment":"production","mode":"persistent"}
```

## Android

Para gerar APK apontando para a Vercel, configure `.env.android-production` assim:

```env
VITE_API_BASE_URL=https://econo-rotas.vercel.app
VITE_ENABLE_DEV_LOGIN=false
```
