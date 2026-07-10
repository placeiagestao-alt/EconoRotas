# Performance benchmark e readiness de escala

## Diagnostico confirmado em 2026-07-09

O benchmark mais recente de 250 paradas nao foi aprovado, apesar do runtime de
1931 ms estar abaixo da meta de 15000 ms. A execucao terminou cedo porque a
primeira chamada OSRM falhou. Nenhuma rota valida foi produzida.

Evidencia persistida:

| Campo             |                     Valor |
| ----------------- | ------------------------: |
| runtime           |                   1931 ms |
| OSRM              | 1 chamada, 1 falha (100%) |
| latencia OSRM     |                   1903 ms |
| rota valida       |                       nao |
| criterio aprovado |                       nao |

O runtime mede quanto a tentativa demorou, nao comprova sucesso. Portanto, o
resultado nao e contraditorio: foi uma falha rapida. O problema corrigido foi a
falta de explicacao no dashboard.

O unico benchmark de 500 paradas foi aprovado pelo criterio antigo em
2026-06-08, com 15272 ms. Ele expirou da janela operacional de 30 dias e possui
apenas uma amostra. Nao ha execucao valida para 1000 ou 2000 paradas.

## Criterio oficial por execucao

Uma execucao so e valida quando todos os itens abaixo forem comprovados:

- rota produzida com sucesso;
- runtime positivo e abaixo da meta do cenario;
- OSRM proprio, sem falha e com taxa de falha abaixo de 1%;
- ao menos um cache miss de matriz e nenhum cache hit, comprovando cold cache;
- auditoria de qualidade com score minimo 70 e sem status critical/blocked;
- dataset sem endereco ou coordenada repetida;
- tamanho do payload registrado;
- persistencia do resultado concluida.

Cada faixa precisa de tres amostras validas dentro da janela de 30 dias. Uma
execucao antiga, isolada ou incompleta nao libera capacidade comercial.

## Plano progressivo

| Paradas |    Meta | Objetivo operacional                | Liberacao               |
| ------: | ------: | ----------------------------------- | ----------------------- |
|      50 |   < 5 s | validar caminho basico e telemetria | pre-requisito           |
|     150 |  < 10 s | validar limite atual do beta        | beta controlado         |
|     250 |  < 15 s | validar primeira expansao           | apos 3 amostras validas |
|     500 |  < 30 s | validar producao ampliada           | apos 250 e 500 ready    |
|    1000 |  < 60 s | validar escala alta                 | sem promessa comercial  |
|    2000 | < 180 s | validar limite extremo              | sem promessa comercial  |

Para cada faixa, executar no minimo:

1. Tres execucoes cold cache com dataset controlado e OSRM proprio.
2. Tres execucoes warm cache para comparar ganho sem substituir a evidencia
   cold cache.
3. Uma execucao ponta a ponta pela fila, registrando espera, worker e hostname.
4. Uma execucao concorrente com a carga comercial esperada.

Registrar runtime total, tempo percebido pelo usuario, CPU, memoria inicial e
pico, payload, chamadas/latencia/falhas OSRM, cache hit/miss, fila, worker,
hostname, sucesso, erro, distancia, duracao, qualidade e persistencia.

O comando `pnpm run benchmark:stress` grava resultados. Ele so deve ser usado em
janela controlada, com banco de benchmark autorizado e OSRM proprio. Nao executar
contra producao apenas para preencher o dashboard.

## Separacao das evidencias

O benchmark atual do script e `direct-sync`: ele mede o motor de rota e registra
explicitamente `queueUsed=false` e `workerUsed=false`. Ele nao comprova capacidade
da fila nem redundancia de workers.

A liberacao de escala tambem exige, no `check:multi-vehicle-readiness`:

- MySQL conectado e schema valido;
- BullMQ/Redis acessivel, politica `noeviction` e integridade saudavel;
- pelo menos dois workers em hosts independentes;
- OSRM proprio, HTTPS, saudavel e `OSRM_REQUIRED=true`;
- DR com backup e restore drill dentro das janelas;
- benchmarks da faixa desejada com tres amostras validas.

## Limite comercial conservador

- Beta controlado: ate 150 paradas por rota.
- Producao inicial: manter 150 paradas enquanto 250 e 500 nao estiverem ready.
- Expansao para 250: somente apos benchmark 250 ready e readiness operacional.
- Expansao para 500: somente apos 250 e 500 ready.
- 1000/2000: nao prometer antes de OSRM proprio, DR ok, workers em hosts
  independentes e evidencia valida nas duas faixas.

## Checklist de liberacao

- [ ] OSRM proprio saudavel e sem fallback silencioso.
- [ ] `OSRM_REQUIRED=true` em producao.
- [ ] Banco e schema saudaveis.
- [ ] Fila e Redis saudaveis.
- [ ] Dois ou mais workers em hosts independentes.
- [ ] DR dentro do RPO/RTO e restore drill recente aprovado.
- [ ] Tres amostras cold cache validas para cada faixa liberada.
- [ ] Execucao ponta a ponta pela fila aprovada.
- [ ] Qualidade da rota e persistencia aprovadas.
- [ ] Payload e tempo percebido pelo usuario registrados.
- [ ] `check:multi-vehicle-readiness` retorna `READY` para o limite anunciado.
