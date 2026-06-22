# Publicacao Android - Samsung, Xiaomi e Huawei

## Estado tecnico atual

- App: EconoRota / EconoRotas
- Package ID: `com.econorotas.app`
- Versao: `1.0.1`
- Version code: `2`
- Min SDK: `24`
- Target SDK: `36`
- APK direto do portal: `client/public/downloads/econorotas-v1.0.0.apk`
- SHA-256 do APK direto atual: `09D9BB7336A25F5E2508725A982472563BF4078CB6093C4197014D39CAB78C30`
- Assinatura: APK release assinado com v2 scheme, 1 signer.

## Estrategia correta

Manter dois canais separados:

1. Canal direto pelo portal EconoRota.
   - Usa update interno para avisar nova versao.
   - Continua baixando APK em `https://econo-rotas.vercel.app/downloads/econorotas-v1.0.0.apk`.

2. Canal de lojas Android.
   - Nao deve mostrar banner de atualizacao externa.
   - Nao deve oferecer download de APK dentro do app.
   - Build deve usar `VITE_ANDROID_DISTRIBUTION_CHANNEL=store`.

Motivo: lojas podem reprovar apps que tentam atualizar ou distribuir APK por fora da propria loja.

## Build de loja

Gerar assets Android para lojas:

```powershell
corepack pnpm run android:sync:store
cd android
.\gradlew.bat assembleRelease
```

Artefato gerado:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Antes de enviar, verificar:

```powershell
$sdk = $env:ANDROID_HOME
Get-ChildItem "$sdk\build-tools" -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1 |
  ForEach-Object { & "$($_.FullName)\apksigner.bat" verify --verbose android/app/build/outputs/apk/release/app-release.apk }
```

## Permissoes e justificativas

- `INTERNET`: necessario para login, sincronizacao com API, mapas, geocodificacao e operacao online.
- `ACCESS_COARSE_LOCATION`: usado quando o usuario autoriza marcar local atual.
- `ACCESS_FINE_LOCATION`: usado quando o usuario autoriza inicio/fim da rota, reotimizacao a partir da posicao atual e alerta de entrega proxima.
- `BIND_ACCESSIBILITY_SERVICE`: usado somente para captura assistida iMile/Rider Delivery quando o usuario ativa a funcao. Descrever com cuidado na revisao, pois e permissao sensivel.

## Dados para cadastro

Titulo curto:

```text
EconoRota
```

Subtitulo:

```text
Roteirizador para entregadores Shopee, SPX e marketplaces.
```

Descricao curta:

```text
Importe tabelas, siga a sequencia STOP da Shopee ou otimize rotas de entrega com suporte a GPS, pacote e acompanhamento operacional.
```

Descricao completa:

```text
EconoRota e um aplicativo para entregadores de marketplace que precisam organizar entregas com rapidez, clareza e controle.

Principais recursos:
- Importacao de tabela Shopee/SPX.
- Opcao de seguir a sequencia STOP da Shopee.
- Encaixe inteligente de paradas sem STOP, como 0 ou "-".
- Opcao de otimizar a rota quando o motorista nao quiser seguir a tabela.
- Destaque para numero da parada, STOP e pacote.
- Abertura de navegacao no Google Maps ou Waze.
- Check-in de inicio e fim da rota pelo GPS.
- Registro de entregas feitas e nao entregues.
- Reversao da ultima acao em caso de baixa incorreta.
- Auditoria operacional para melhorar sequencias incoerentes.

O EconoRota nao e afiliado a Shopee, SPX, iMile, Mercado Livre, Amazon ou Correios. O aplicativo e uma ferramenta independente de apoio operacional ao entregador.
```

Categoria sugerida:

```text
Produtividade / Ferramentas / Negocios
```

Classificacao etaria:

```text
Livre ou equivalente, sem conteudo sensivel.
```

Politica de privacidade:

```text
https://econo-rotas.vercel.app/privacidade
```

Termos:

```text
https://econo-rotas.vercel.app/termos
```

Suporte:

```text
https://econo-rotas.vercel.app/suporte
```

Email de suporte:

```text
andersongiacomini77@gmail.com
```

Conta de teste para revisao:

```text
Criar uma conta de teste exclusiva antes da submissao.
Nao usar conta pessoal do administrador.
```

## Checklist Samsung Galaxy Store

- Criar Samsung account.
- Registrar no Seller Portal.
- Solicitar commercial seller status.
- Criar app Android.
- Enviar APK de loja.
- Preencher Data Safety.
- Informar URL de privacidade.
- Informar conta de teste, pois o app exige login.
- Selecionar paises iniciais: Brasil primeiro.
- Validar que o build de loja nao mostra download de APK nem update externo.

Atencao: a Galaxy Store exige que apps que coletam ou transmitem dados tenham politica de privacidade visivel e URL na submissao. Tambem avalia instalacao, abertura, login, funcionamento e textos truncados.

## Checklist Xiaomi GetApps

- Criar Xiaomi Account.
- Acessar Xiaomi GetApps Console.
- Completar informacoes do desenvolvedor.
- Criar aplicacao.
- Enviar APK de loja.
- Preencher informacoes, icone, screenshots, categoria, descricao e privacidade.
- Informar conta de teste se solicitado.
- Publicar inicialmente no Brasil se disponivel.

## Checklist Huawei AppGallery

- Criar Huawei Developer account.
- Completar verificacao de identidade.
- Acessar AppGallery Connect.
- Criar Android app.
- Enviar APK de loja.
- Preencher App information.
- Informar screenshots, descricao, categoria, suporte e politica de privacidade.
- Validar que o app nao depende de Google Play Services obrigatorios para abrir e operar.

## Riscos de revisao

1. Permissao de acessibilidade.
   - Alto risco de questionamento.
   - Justificativa: captura assistida pelo proprio usuario para ler enderecos visiveis no Rider Delivery.
   - Se houver reprova, preparar build sem captura iMile/acessibilidade para lojas.

2. Marca Shopee/SPX.
   - Usar como compatibilidade operacional, sem afirmar afiliacao.
   - Sempre incluir aviso: ferramenta independente, nao afiliada.

3. Atualizacao externa.
   - Ja resolvido para build de loja via `VITE_ANDROID_DISTRIBUTION_CHANNEL=store`.

4. Privacidade/localizacao.
   - Politica atualizada em `/privacidade`.
   - Explicar uso de GPS apenas com permissao do usuario.

## Ordem recomendada

1. Samsung Galaxy Store.
2. Xiaomi GetApps.
3. Huawei AppGallery.

Huawei e util, mas precisa testar em aparelho Huawei/Honor ou ambiente sem Google Services para evitar surpresa.
