# Deploy na Vercel

Plataforma escolhida: Vercel Hobby, por permitir deploy GitHub gratuito sem cartao para projetos pessoais.

## Configuracao

1. Acesse https://vercel.com/new
2. Importe `placeiagestao-alt/EconoRotas`
3. Framework preset: `Other`
4. Build command: `pnpm run build`
5. Output directory: `dist/public`
6. Install command: `pnpm install --frozen-lockfile`

## Variaveis obrigatorias

Defina em Environment Variables:

```env
JWT_SECRET=gere_uma_chave_com_mais_de_32_caracteres
ALLOW_EPHEMERAL_DB=true
VITE_ENABLE_DEV_LOGIN=false
```

`ALLOW_EPHEMERAL_DB=true` permite subir sem banco pago/cartao. Os dados podem ser perdidos em reinicios/cold starts da Vercel. Para producao real, troque por um MySQL externo e defina `DATABASE_URL`.

Depois do primeiro deploy, defina tambem:

```env
PUBLIC_APP_URL=https://seu-projeto.vercel.app
ALLOWED_ORIGINS=https://seu-projeto.vercel.app
NOMINATIM_CONTACT_EMAIL=placeiagestao@gmail.com
```
