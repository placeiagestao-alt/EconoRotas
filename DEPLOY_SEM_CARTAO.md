# Deploy sem cartao do EconoRotas

Este caminho substitui a VPS quando nao ha cartao para Oracle/DigitalOcean.

## Decisao

Use Northflank Developer Sandbox como primeira tentativa:

- roda Dockerfile do projeto;
- tem HTTPS automatico;
- oferece 2 servicos e 1 banco no plano gratuito;
- informa sandbox com compute sempre ligado, sem sleep;
- nao exige abrir portas 80/443 manualmente, porque a plataforma entrega o HTTPS publico.

Nao e VPS. E PaaS. A troca correta aqui e perder SSH/root para ganhar hospedagem sem cartao.

## Recursos do projeto

O projeto ja tem Dockerfile valido:

- build: `pnpm run build`
- start: `pnpm run start`
- porta interna: `3000`

## Variaveis obrigatorias

Configure no painel da plataforma:

```env
NODE_ENV=production
PORT=3000
PUBLIC_DOMAIN=DOMINIO_DA_PLATAFORMA_OU_CUSTOM
PUBLIC_APP_URL=https://DOMINIO_DA_PLATAFORMA_OU_CUSTOM
ALLOWED_ORIGINS=https://DOMINIO_DA_PLATAFORMA_OU_CUSTOM
DATABASE_URL=mysql://USUARIO:SENHA@HOST:PORTA/BANCO
JWT_SECRET=GERAR_SEGREDO_FORTE
OWNER_EMAIL=EMAIL_DO_DONO
NOMINATIM_CONTACT_EMAIL=EMAIL_DE_CONTATO
VITE_ENABLE_DEV_LOGIN=false
```

Se usar banco MySQL gerenciado da plataforma, copie a connection string para `DATABASE_URL`.

## Passos

1. Criar conta no Northflank.
2. Criar novo Project.
3. Criar Addon/Database MySQL, se disponivel no Sandbox.
4. Criar Service a partir do repositorio GitHub do projeto.
5. Selecionar deploy por Dockerfile na raiz.
6. Configurar porta HTTP `3000`.
7. Cadastrar as variaveis acima.
8. Deploy.
9. Rodar migrate uma vez:

```bash
pnpm run db:migrate
```

10. Testar:

```bash
curl https://DOMINIO_FINAL/api/health
```

## Fallbacks sem cartao

- Back4app Containers: aceita Docker e informa free sem cartao, mas deve ser tratado como validacao, nao producao critica.
- Koyeb Free: limite pequeno demais para Node + MySQL.
- Render Free: dorme depois de inatividade e nao serve para app operacional com banco persistente.
- FreeHost.run/SnapDeploy: prometem container gratis sem cartao, mas devem ser usados somente se Northflank bloquear cadastro ou banco.

## Quando voltar para VPS

Quando houver cartao ou conta cloud liberada, a rota mais forte volta a ser:

- Oracle Cloud Always Free, se houver capacidade;
- DigitalOcean/Vultr/Hetzner, se aceitar custo mensal baixo.
