# SEO Google - EconoRota

## Objetivo

Fazer o Google descobrir, rastrear e indexar as paginas publicas do EconoRota.

## Ja implementado no sistema

- `robots.txt`: https://econo-rotas.vercel.app/robots.txt
- `sitemap.xml`: https://econo-rotas.vercel.app/sitemap.xml
- Metadados da raiz: title, description, canonical, Open Graph e JSON-LD.
- Paginas publicas indexaveis:
  - https://econo-rotas.vercel.app/roteirizador-entregas
  - https://econo-rotas.vercel.app/roteirizador-shopee
  - https://econo-rotas.vercel.app/roteirizador-mercado-livre
  - https://econo-rotas.vercel.app/roteirizador-imile
  - https://econo-rotas.vercel.app/pwa-iphone
  - https://econo-rotas.vercel.app/baixar-aplicativo
  - https://econo-rotas.vercel.app/blog/como-otimizar-rota-de-entregas
  - https://econo-rotas.vercel.app/privacidade
  - https://econo-rotas.vercel.app/termos
  - https://econo-rotas.vercel.app/suporte

## Passos no Google Search Console

1. Acessar https://search.google.com/search-console.
2. Adicionar propriedade do tipo `Prefixo do URL`.
3. Informar `https://econo-rotas.vercel.app/`.
4. Escolher verificacao por tag HTML ou arquivo HTML.
5. Se escolher tag HTML, copiar o valor de verificacao e adicionar no projeto.
6. Se escolher arquivo HTML, colocar o arquivo em `client/public/`.
7. Publicar novamente na Vercel.
8. No Search Console, clicar em verificar.
9. Acessar `Sitemaps`.
10. Enviar `https://econo-rotas.vercel.app/sitemap.xml`.

## Validacao depois do envio

- Inspecionar URL `https://econo-rotas.vercel.app/`.
- Inspecionar URL `https://econo-rotas.vercel.app/roteirizador-entregas`.
- Solicitar indexacao das paginas principais.
- Acompanhar erros de cobertura, mobile e sitemap.

## Observacao

O Google nao garante indexacao imediata. O papel do sistema e entregar HTML rastreavel,
conteudo publico, sitemap e metadados corretos. A verificacao no Search Console depende
da conta Google proprietaria do projeto.
