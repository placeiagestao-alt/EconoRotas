# Observabilidade e metricas operacionais de rota

## Eventos persistidos hoje

Os eventos operacionais continuam em `operationalEvents` e funcionam como trilha detalhada:

- `route_optimized`: rota criada e otimizada.
- `route_reoptimized`: rota reotimizada.
- `route_remaining_reoptimized`: restantes reotimizadas.
- `route_user_requested_better_sequence`: usuario pediu sequencia mais rigida.
- `route_audit_corrected_optimization`: fiscal tentou/corrigiu incoerencia.
- `route_audit_blocked_optimization`: fiscal bloqueou a otimizacao.
- `route_audit_flagged`: auditoria gerou alerta.
- `route_optimization_failed`: falha de otimizacao.

## Metricas derivadas dos eventos

- Score medio de qualidade.
- Uso de OSRM versus fallback geografico.
- Tipos de incoerencia detectados.
- Rotas corrigidas automaticamente.
- Rotas bloqueadas.
- Distancia e tempo estimado da rota.

## Metricas agora persistidas em `route_metrics`

Uma linha e gravada por tentativa concluida de otimizacao ou bloqueio do fiscal:

- `qualityScore`
- `optimizationRuntimeMs`
- `osrmUsed`
- `osrmFallback`
- `clusterCount`
- `averageClusterRadius`
- `maxClusterRadius`
- `regionRevisitedCount`
- `prematureRegionExitCount`
- `nearbyStopSkippedCount`
- `routeCrossingCount`
- `issuesDetectedCount`
- `issuesCorrectedCount`
- `issuesBlockedCount`

## Modelo de banco

Tabela fisica: `route_metrics`

```sql
CREATE TABLE route_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NULL,
  routeId INT NULL,
  qualityScore INT NOT NULL,
  optimizationRuntimeMs INT NOT NULL,
  osrmUsed BOOLEAN NOT NULL DEFAULT false,
  osrmFallback BOOLEAN NOT NULL DEFAULT false,
  clusterCount INT NOT NULL DEFAULT 0,
  averageClusterRadius DECIMAL(10,3) NOT NULL DEFAULT 0,
  maxClusterRadius DECIMAL(10,3) NOT NULL DEFAULT 0,
  regionRevisitedCount INT NOT NULL DEFAULT 0,
  prematureRegionExitCount INT NOT NULL DEFAULT 0,
  nearbyStopSkippedCount INT NOT NULL DEFAULT 0,
  routeCrossingCount INT NOT NULL DEFAULT 0,
  issuesDetectedCount INT NOT NULL DEFAULT 0,
  issuesCorrectedCount INT NOT NULL DEFAULT 0,
  issuesBlockedCount INT NOT NULL DEFAULT 0,
  auditStatus ENUM('approved','attention','critical') NOT NULL,
  auditQuality ENUM('excellent','good','attention','poor','blocked') NOT NULL,
  auditSource VARCHAR(128),
  routeMode ENUM('shortest_distance','shortest_time','balanced'),
  localityMode ENUM('balanced','local','strict'),
  stopCount INT NOT NULL DEFAULT 0,
  totalDistanceKm DECIMAL(10,2) NOT NULL DEFAULT 0,
  totalTimeMinutes INT NOT NULL DEFAULT 0,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Endpoints

## Modos reais de otimizacao

O roteirizador usa pesos diferentes para cada modo:

- `shortest_distance`: `distanceKm * 0.8 + durationMin * 0.2`
- `shortest_time`: `distanceKm * 0.1 + durationMin * 0.9`
- `balanced`: `distanceKm * 0.5 + durationMin * 0.5`

Quando o OSRM retorna matriz de distancia e duracao conflitantes, os modos podem
gerar sequencias diferentes. O modo usado fica persistido em `route_metrics.routeMode`.

## Comparacao por modo

O painel administrativo agrega `route_metrics` por modo e compara:

- rotas medidas;
- score medio;
- distancia media;
- tempo medio;
- taxa de correcao do fiscal;
- taxa de fallback OSRM.

## Indicadores comerciais

O painel tambem mostra impacto comercial estimado:

- KM economizados;
- tempo economizado;
- combustivel economizado;
- emissoes evitadas.

A estimativa e conservadora. O sistema so conta economia quando uma rota foi
corrigida pelo fiscal e o problema original informava `distanceKm` maior que
`nearestDistanceKm`. O calculo atual usa:

- `kmEconomizados = distanceKm - nearestDistanceKm`
- `minutosEconomizados = kmEconomizados * 2.5`
- `litrosEconomizados = kmEconomizados / 10`
- `co2EvitadoKg = litrosEconomizados * 2.31`

- `admin.dashboard`: inclui `routeMetrics` com resumo dos ultimos 30 dias.
- `admin.routeMetrics({ days })`: retorna indicadores agregados de 1 a 365 dias.

## Indicadores agregados

- Taxa de Correcao do Fiscal: `issuesCorrectedCount / issuesDetectedCount`.
- Taxa de Fallback OSRM: `osrmFallback / total_metricas`.
- Indice de Revisita Regional: rotas com `regionRevisitedCount` ou `prematureRegionExitCount` acima de zero.
- Indice de Eficiencia de Cluster: percentual sem revisita, saida prematura ou parada proxima pulada entre rotas clusterizadas.
- Score Medio de Qualidade: media de `qualityScore`.
- Tempo Medio de Otimizacao: media de `optimizationRuntimeMs`.
- Rotas Particionadas: quantidade e percentual de otimizacoes grandes quebradas
  por regiao antes da matriz OSRM.
- Media de Particoes: media de blocos regionais por rota particionada.
- Maior Particao: maior quantidade de paradas em uma particao OSRM.

## OSRM proprio

O sistema expoe saude do OSRM em `/api/health` e `/api/monitor/ping`.
Enquanto `OSRM_REQUIRED=false`, a aplicacao continua operando com fallback
geografico quando o OSRM falha. Para operacao em escala, configure
`OSRM_BASE_URL` com uma instancia propria e ligue `OSRM_REQUIRED=true`.

Com `OSRM_REQUIRED=true`:

- health/monitor retornam falha quando o OSRM nao responde;
- otimizacao de rota e bloqueada quando nao houver matriz real por ruas;
- o painel Operacao continua medindo `osrmFallbackRate`.

Runbook de infraestrutura: `ops/osrm/README.md`.

## Particionamento de rotas grandes

Para rotas acima de 120 paradas, o backend particiona a rota antes de pedir
matriz ao OSRM. O fluxo passa a ser:

```text
paradas
  -> DBSCAN por regiao
  -> quebra de clusters grandes em blocos menores
  -> OSRM por particao
  -> combinacao final
  -> fiscal
```

Isso evita uma matriz unica gigante, reduz timeout e diminui a chance de cair
para fallback geografico. O tamanho padrao de particao e 70 paradas, com origem
da particao anterior usada como ponto de partida da proxima.

Os dados de particionamento ficam em `route_metrics.metadata.routeMetadata`,
incluindo `partitioned`, `partitionCount`, `maxPartitionSize` e
`largestPartitionSize`.

## Consultas SQL

```sql
SELECT
  COUNT(*) AS route_metric_count,
  ROUND(AVG(qualityScore), 1) AS average_quality_score,
  ROUND(AVG(optimizationRuntimeMs) / 1000, 2) AS average_optimization_seconds,
  ROUND(SUM(osrmFallback = true) * 100 / COUNT(*), 1) AS osrm_fallback_rate,
  ROUND(SUM(issuesCorrectedCount) * 100 / NULLIF(SUM(issuesDetectedCount), 0), 1) AS auditor_correction_rate,
  ROUND(SUM(regionRevisitedCount > 0 OR prematureRegionExitCount > 0) * 100 / COUNT(*), 1) AS regional_revisit_index,
  ROUND(AVG(clusterCount), 1) AS average_cluster_count,
  ROUND(AVG(averageClusterRadius), 3) AS average_cluster_radius_km,
  ROUND(MAX(maxClusterRadius), 3) AS max_cluster_radius_km
FROM route_metrics
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY);
```

```sql
SELECT
  SUM(regionRevisitedCount) AS region_revisited,
  SUM(prematureRegionExitCount) AS premature_region_exit,
  SUM(nearbyStopSkippedCount) AS nearby_stop_skipped,
  SUM(routeCrossingCount) AS route_crossing,
  SUM(issuesDetectedCount) AS issues_detected,
  SUM(issuesCorrectedCount) AS issues_corrected,
  SUM(issuesBlockedCount) AS issues_blocked
FROM route_metrics
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY);
```

## Dashboards administrativos recomendados

1. Saude da roteirizacao
   - score medio
   - tempo medio de otimizacao
   - taxa de fallback OSRM
   - rotas bloqueadas

2. Fiscal de rota
   - taxa de correcao
   - issues detectadas por tipo
   - issues corrigidas por tipo
   - issues bloqueadas

3. Regioes e clusters
   - quantidade media de clusters
   - raio medio/maximo dos clusters
   - indice de revisita regional
   - indice de eficiencia de cluster

4. Tendencia temporal
   - score por dia
   - fallback OSRM por dia
   - bloqueios por dia
   - runtime por dia

## Impacto estimado no banco

Cada otimizacao grava uma linha em `route_metrics`.

Estimativa conservadora:

- 1.000 otimizacoes/dia: cerca de 30.000 linhas/mes.
- 10.000 otimizacoes/dia: cerca de 300.000 linhas/mes.
- Cada linha e pequena, com poucos inteiros, decimais e JSON resumido.

Impacto esperado: baixo para MySQL gerenciado. Os indices por `createdAt`, `routeId`, `auditStatus` e `osrmFallback` sustentam dashboard administrativo sem varrer a tabela inteira em janelas recentes.
