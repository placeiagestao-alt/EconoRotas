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
4. Build command: `pnpm run build`
5. Output directory: `dist/public`
6. Install command: `pnpm install --frozen-lockfile`

O arquivo `vercel.json` ja define esses valores e direciona:

- `/api/*` para a funcao serverless Express
- `/manus-storage/*` para a mesma funcao, mantendo compatibilidade
- qualquer outra rota para `index.html`, necessario para o React Router/Wouter

## Variaveis obrigatorias

Defina em Environment Variables:

```env
JWT_SECRET=gere_uma_chave_com_mais_de_32_caracteres
ALLOW_EPHEMERAL_DB=true
VITE_ENABLE_DEV_LOGIN=false
PUBLIC_APP_URL=https://econo-rotas.vercel.app
ALLOWED_ORIGINS=https://econo-rotas.vercel.app,https://econo-rotas-bxso2tmdj-anderson-s-projects-ef32a938.vercel.app,capacitor://localhost,https://localhost,http://localhost
NOMINATIM_CONTACT_EMAIL=placeiagestao@gmail.com
```

`ALLOW_EPHEMERAL_DB=true` permite subir sem banco pago/cartao. Os dados podem ser perdidos em reinicios/cold starts da Vercel. Para producao real, troque por um MySQL externo e defina `DATABASE_URL`.

## Producao real com banco

Para uso real no smartphone e navegador, use um MySQL externo e defina `DATABASE_URL`.
Quando `DATABASE_URL` estiver configurado, execute as migrations antes de usar o app em producao:

```bash
pnpm run db:migrate
```

Sem `DATABASE_URL`, a Vercel usa memoria temporaria. Isso serve para teste e demonstracao, mas nao garante permanencia das rotas.

## Validacao

Apos o deploy, teste:

```bash
curl https://econo-rotas.vercel.app/api/health
```

Resposta esperada:

```json
{"ok":true,"app":"EconoRotas","environment":"production"}
```
