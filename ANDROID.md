# EconoRotas Android

Esta pasta do projeto continua mantendo o app web atual. A versao Android e gerada pelo Capacitor na pasta `android/`, usando o build do frontend em `dist/public`.

## Comandos

```powershell
corepack pnpm run android:add
corepack pnpm run android:sync
corepack pnpm run android:open
```

Depois de alterar o React/Vite, rode:

```powershell
corepack pnpm run android:sync
```

O script Android usa `vite build --mode android`, entao o Vite carrega `.env.android` automaticamente quando esse arquivo existir.
Para producao, use `corepack pnpm run android:sync:prod`; esse comando carrega `.env.android-production`.

## Backend/API

O app Android precisa acessar o backend Express para login, rotas, banco e geocodificacao. Para emulador Android, crie `.env.android` a partir de `.env.android.example` e use:

```env
VITE_API_BASE_URL=http://10.0.2.2:3000
VITE_ENABLE_DEV_LOGIN=true
```

Para celular fisico, troque pelo IP do computador na rede.

`VITE_ENABLE_DEV_LOGIN=true` e apenas para teste local. Para publicacao real, use backend publico HTTPS e login proprio por e-mail/senha.

Para celular sem depender do Windows/PC local, crie `.env.android-production` a partir de `.env.android-production.example`:

```env
VITE_API_BASE_URL=https://api.seu-dominio.com
VITE_ENABLE_DEV_LOGIN=false
```

Depois rode:

```powershell
corepack pnpm run android:sync:prod
```

Veja o passo a passo completo em `PRODUCAO.md`.
