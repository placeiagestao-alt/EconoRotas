import { calculateDistance, clusterStops, type Location } from "./optimization";
import { GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD } from "../shared/geocodingConfidence";

export type RouteAuditSeverity = "low" | "medium" | "high" | "critical";

export type RouteAuditIssue = {
  type:
    | "nearby_stop_skipped"
    | "long_jump"
    | "duplicate_coordinates"
    | "first_stop_far"
    | "region_revisited"
    | "premature_region_exit"
    | "cluster_spread_high"
    | "route_crossing"
    | "high_road_detour"
    | "missing_driver_origin"
    | "bad_preserved_sequence"
    | "osrm_fallback"
    | "missing_coordinates"
    | "invalid_coordinates"
    | "empty_address"
    | "generic_address"
    | "low_geocoding_confidence"
    | "duplicate_sequence";
  severity: RouteAuditSeverity;
  title: string;
  message: string;
  fromSequence?: number;
  toSequence?: number;
  stopSequence?: number;
  nearestSequence?: number;
  distanceKm?: number;
  nearestDistanceKm?: number;
  gapKm?: number;
  addresses?: string[];
  pendingSequences?: number[];
  crossingToSequence?: number;
};

export type AuditableStop = Location & {
  id?: number;
  sequence: number;
};

export type RouteAuditReport = {
  status: "approved" | "attention" | "critical";
  score: number;
  quality: "excellent" | "good" | "attention" | "poor" | "blocked";
  stopCount: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  totalDistanceKm: number;
  maxLegKm: number;
  clusterMetrics: {
    clusterCount: number;
    averageRadiusKm: number;
    maxRadiusKm: number;
    spreadClusters: Array<{
      clusterId: number;
      stopCount: number;
      averageRadiusKm: number;
      maxRadiusKm: number;
    }>;
  };
  issues: RouteAuditIssue[];
};

const IMMEDIATE_NEARBY_KM = 0.12;
const IMMEDIATE_GAP_KM = 0.05;
const LOCAL_NEARBY_KM = 1.5;
const LOCAL_GAP_KM = 0.75;
const REVISIT_RADIUS_KM = 0.25;
const REVISIT_AFTER_JUMP_KM = 1.2;
const FIRST_STOP_FAR_KM = 2;
const ROAD_DETOUR_RATIO = 1.8;
const LONG_JUMP_KM = 2.5;
const COORDINATE_PRECISION = 5;
const BRAZIL_LATITUDE_MIN = -34;
const BRAZIL_LATITUDE_MAX = 6;
const BRAZIL_LONGITUDE_MIN = -74;
const BRAZIL_LONGITUDE_MAX = -28;
const CLUSTER_SPREAD_ATTENTION_KM = 2.5;
const CLUSTER_SPREAD_HIGH_KM = 5;
const ROUTE_QUALITY_PENALTIES: Partial<Record<RouteAuditIssue["type"], number>> = {
  region_revisited: 20,
  premature_region_exit: 25,
  cluster_spread_high: 10,
  nearby_stop_skipped: 15,
  route_crossing: 0,
  high_road_detour: 10,
  duplicate_coordinates: 30,
  generic_address: 5,
  low_geocoding_confidence: 15,
  missing_coordinates: 30,
  invalid_coordinates: 30,
  empty_address: 30,
  duplicate_sequence: 20,
  bad_preserved_sequence: 15,
  osrm_fallback: 10,
  first_stop_far: 10,
  long_jump: 8,
  missing_driver_origin: 8,
};

function roundKm(value: number) {
  return Math.round(value * 100) / 100;
}

function stopLabel(sequence: number | undefined) {
  return sequence === undefined ? "" : `parada ${sequence + 1}`;
}

function describeExpectedPlacement(
  movedSequence: number,
  anchorSequence: number | undefined,
  beforeSequence: number,
  distanceKm: number,
  skippedDistanceKm: number
) {
  const moved = stopLabel(movedSequence);
  const before = stopLabel(beforeSequence);

  if (anchorSequence === undefined) {
    return `${moved} esta a ${roundKm(
      distanceKm
    )} km da origem e foi pulada antes da ${before}. Ela deve entrar no inicio da rota, antes da ${before}, porque seguir para a ${before} gera um deslocamento de ${roundKm(
      skippedDistanceKm
    )} km.`;
  }

  const anchor = stopLabel(anchorSequence);
  return `${moved} esta a ${roundKm(
    distanceKm
  )} km da ${anchor} e foi deixada para depois da ${before}. Ela deve ficar junto dessa regiao, logo apos a ${anchor} e antes da ${before}, porque seguir para a ${before} gera um deslocamento de ${roundKm(
    skippedDistanceKm
  )} km.`;
}

function coordinateKey(stop: AuditableStop) {
  return `${stop.latitude.toFixed(COORDINATE_PRECISION)},${stop.longitude.toFixed(
    COORDINATE_PRECISION
  )}`;
}

function normalizeAddress(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function hasValidCoordinateValues(stop: AuditableStop) {
  return Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude);
}

function hasMissingCoordinateValues(stop: AuditableStop) {
  return (
    stop.latitude == null ||
    stop.longitude == null ||
    (Number(stop.latitude) === 0 && Number(stop.longitude) === 0)
  );
}

function hasSuspiciousBrazilCoordinate(stop: AuditableStop) {
  return (
    stop.latitude < BRAZIL_LATITUDE_MIN ||
    stop.latitude > BRAZIL_LATITUDE_MAX ||
    stop.longitude < BRAZIL_LONGITUDE_MIN ||
    stop.longitude > BRAZIL_LONGITUDE_MAX
  );
}

function isGenericAddress(address: string) {
  const normalized = normalizeAddress(address);
  if (
    /^(endereco|endereço|parada|entrega|cliente|destino|sem endereco|sem endereço|n\/a|na|-)$/i.test(
      normalized
    )
  ) {
    return true;
  }

  return /^(cliente|client|parada|entrega|destino|stop|pacote|pedido|rastreio|tracking)\s*[:#-]?\s*[\w.-]+$/i.test(
    normalized
  );
}

function getReportStatus(criticalCount: number, warningCount: number) {
  if (criticalCount > 0) return "critical";
  if (warningCount > 0) return "attention";
  return "approved";
}

function getRouteQuality(score: number): RouteAuditReport["quality"] {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 65) return "attention";
  return "poor";
}

function orientation(a: Location, b: Location, c: Location) {
  const value =
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude);

  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : -1;
}

function onSegment(a: Location, b: Location, c: Location) {
  return (
    Math.min(a.longitude, c.longitude) <= b.longitude + 1e-12 &&
    b.longitude <= Math.max(a.longitude, c.longitude) + 1e-12 &&
    Math.min(a.latitude, c.latitude) <= b.latitude + 1e-12 &&
    b.latitude <= Math.max(a.latitude, c.latitude) + 1e-12
  );
}

function samePoint(a: Location, b: Location) {
  return (
    Math.abs(a.latitude - b.latitude) < 1e-9 &&
    Math.abs(a.longitude - b.longitude) < 1e-9
  );
}

function segmentsIntersect(a: Location, b: Location, c: Location, d: Location) {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) {
    return false;
  }

  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

export function detectRouteCrossings(route: AuditableStop[]) {
  const crossings: Array<{
    fromSequence: number;
    toSequence: number;
    crossingFromSequence: number;
    crossingToSequence: number;
  }> = [];

  for (let first = 0; first < route.length - 1; first += 1) {
    for (let second = first + 2; second < route.length - 1; second += 1) {
      if (second === first + 1) continue;

      const a = route[first];
      const b = route[first + 1];
      const c = route[second];
      const d = route[second + 1];

      if (segmentsIntersect(a, b, c, d)) {
        crossings.push({
          fromSequence: a.sequence,
          toSequence: b.sequence,
          crossingFromSequence: c.sequence,
          crossingToSequence: d.sequence,
        });
      }
    }
  }

  return crossings;
}

function emptyClusterMetrics(): RouteAuditReport["clusterMetrics"] {
  return {
    clusterCount: 0,
    averageRadiusKm: 0,
    maxRadiusKm: 0,
    spreadClusters: [],
  };
}

function calculateClusterMetrics(
  route: AuditableStop[]
): RouteAuditReport["clusterMetrics"] {
  const clusters = clusterStops(route);
  if (clusters.length === 0) return emptyClusterMetrics();

  const clusterMetrics = clusters.map((cluster) => {
    const distances = cluster.stops.map((stop) =>
      calculateDistance(cluster.centroid, route[stop.originalIndex])
    );
    const averageRadiusKm =
      distances.reduce((total, distance) => total + distance, 0) /
      Math.max(1, distances.length);
    const maxRadiusKm = Math.max(0, ...distances);

    return {
      clusterId: cluster.clusterId,
      stopCount: cluster.stops.length,
      averageRadiusKm: roundKm(averageRadiusKm),
      maxRadiusKm: roundKm(maxRadiusKm),
    };
  });

  return {
    clusterCount: clusterMetrics.length,
    averageRadiusKm: roundKm(
      clusterMetrics.reduce((total, cluster) => total + cluster.averageRadiusKm, 0) /
        Math.max(1, clusterMetrics.length)
    ),
    maxRadiusKm: Math.max(0, ...clusterMetrics.map((cluster) => cluster.maxRadiusKm)),
    spreadClusters: clusterMetrics.filter(
      (cluster) => cluster.averageRadiusKm >= CLUSTER_SPREAD_ATTENTION_KM
    ),
  };
}

function detectPrematureRegionExits(route: AuditableStop[]) {
  const clusters = clusterStops(route);
  if (clusters.length <= 1) return [];

  const clusterByOriginalIndex = new Map<number, number>();
  for (const cluster of clusters) {
    if (cluster.stops.length < 2) continue;
    for (const stop of cluster.stops) {
      clusterByOriginalIndex.set(stop.originalIndex, cluster.clusterId);
    }
  }

  const exits: Array<{
    fromClusterId: number;
    toClusterId: number;
    fromSequence: number;
    toSequence: number;
    pendingSequences: number[];
  }> = [];
  let activeClusterId: number | undefined;

  for (let index = 0; index < route.length; index += 1) {
    const clusterId = clusterByOriginalIndex.get(index);
    if (!clusterId) {
      activeClusterId = undefined;
      continue;
    }

    if (activeClusterId !== undefined && activeClusterId !== clusterId) {
      const pendingSequences = route
        .slice(index + 1)
        .filter((_, laterIndex) => {
          const originalIndex = index + 1 + laterIndex;
          return clusterByOriginalIndex.get(originalIndex) === activeClusterId;
        })
        .map((stop) => stop.sequence);

      if (pendingSequences.length > 0) {
        exits.push({
          fromClusterId: activeClusterId,
          toClusterId: clusterId,
          fromSequence: route[index - 1].sequence,
          toSequence: route[index].sequence,
          pendingSequences,
        });
      }
    }

    activeClusterId = clusterId;
  }

  return exits;
}

export function auditRouteSequence(
  stops: AuditableStop[],
  options: {
    startLocation?: Location;
    requireStartLocation?: boolean;
    actualTotalDistanceKm?: number;
    usedRoadMetrics?: boolean;
    respectInputSequence?: boolean;
  } = {}
): RouteAuditReport {
  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
  const issues: RouteAuditIssue[] = [];
  let totalDistanceKm = 0;
  let maxLegKm = 0;

  const sequenceCounts = new Map<number, number>();
  for (const stop of orderedStops) {
    sequenceCounts.set(stop.sequence, (sequenceCounts.get(stop.sequence) || 0) + 1);

    const address = stop.address?.trim() ?? "";
    if (!address) {
      issues.push({
        type: "empty_address",
        severity: "high",
        title: "Parada sem endereco",
        message: `A parada ${stop.sequence + 1} esta sem endereco preenchido.`,
        stopSequence: stop.sequence,
      });
    } else if (isGenericAddress(address)) {
      issues.push({
        type: "generic_address",
        severity: "high",
        title: "Endereco generico",
        message: `A parada ${stop.sequence + 1} tem endereco generico: "${address}".`,
        stopSequence: stop.sequence,
      });
    }

    if (hasMissingCoordinateValues(stop)) {
      issues.push({
        type: "missing_coordinates",
        severity: "critical",
        title: "Parada sem coordenada valida",
        message: `A parada ${stop.sequence + 1} nao tem latitude/longitude valida para roteirizacao.`,
        stopSequence: stop.sequence,
      });
    } else if (!hasValidCoordinateValues(stop) || hasSuspiciousBrazilCoordinate(stop)) {
      issues.push({
        type: "invalid_coordinates",
        severity: "critical",
        title: "Coordenada invalida",
        message: `A parada ${stop.sequence + 1} tem coordenadas invalidas ou fora da area esperada.`,
        stopSequence: stop.sequence,
      });
    } else {
      const confidenceScore = Number(stop.geocodingConfidenceScore);
      if (
        Number.isFinite(confidenceScore) &&
        confidenceScore > 0 &&
        confidenceScore < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD
      ) {
        issues.push({
          type: "low_geocoding_confidence",
          severity: "high",
          title: "Coordenada com baixa confianca",
          message: `A parada ${stop.sequence + 1} tem confianca ${confidenceScore}/100. Confirme a sugestao ou digite coordenadas manualmente antes de otimizar.`,
          stopSequence: stop.sequence,
        });
      }
    }
  }

  for (const [sequence, count] of Array.from(sequenceCounts.entries())) {
    if (count > 1) {
      issues.push({
        type: "duplicate_sequence",
        severity: "high",
        title: "Sequencia duplicada",
        message: `${count} paradas estao usando o mesmo numero de sequencia ${sequence + 1}.`,
        stopSequence: sequence,
      });
    }
  }

  const routeableStops = orderedStops.filter(
    (stop) =>
      hasValidCoordinateValues(stop) &&
      !hasMissingCoordinateValues(stop) &&
      !hasSuspiciousBrazilCoordinate(stop)
  );
  const clusterMetrics = calculateClusterMetrics(routeableStops);

  for (const cluster of clusterMetrics.spreadClusters) {
    if (
      cluster.averageRadiusKm < CLUSTER_SPREAD_HIGH_KM &&
      cluster.maxRadiusKm < CLUSTER_SPREAD_HIGH_KM
    ) {
      continue;
    }

    issues.push({
      type: "cluster_spread_high",
      severity: "medium",
      title: "Cluster muito espalhado",
      message: `A regiao ${cluster.clusterId} tem raio medio de ${cluster.averageRadiusKm} km e raio maximo de ${cluster.maxRadiusKm} km. Isso indica agrupamento amplo demais e merece conferencia.`,
      distanceKm: cluster.maxRadiusKm,
    });
  }

  if (options.requireStartLocation && !options.startLocation && routeableStops.length > 1) {
    issues.push({
      type: "missing_driver_origin",
      severity: "medium",
      title: "Rota criada sem origem do motorista",
      message:
        "Sem a origem real, o sistema otimiza a sequencia entre paradas, mas pode escolher uma primeira entrega ruim para quem esta na rua.",
    });
  }

  for (const exit of detectPrematureRegionExits(routeableStops)) {
    issues.push({
      type: "premature_region_exit",
      severity: "high",
      title: "Saida prematura da regiao",
      message: `A rota saiu da regiao ${exit.fromClusterId} para a regiao ${
        exit.toClusterId
      } antes de concluir ${exit.pendingSequences.length} parada(s) pendente(s) da regiao anterior.`,
      fromSequence: exit.fromSequence,
      toSequence: exit.toSequence,
      nearestSequence: exit.pendingSequences[0],
      pendingSequences: exit.pendingSequences,
    });
  }

  if (options.usedRoadMetrics === false && routeableStops.length > 1) {
    issues.push({
      type: "osrm_fallback",
      severity: "high",
      title: "Otimizacao sem OSRM",
      message:
        "A rota foi avaliada por distancia geografica. Isso pode ignorar sentidos de rua, retornos e caminhos reais.",
    });
  }

  for (let index = 0; index < routeableStops.length; index += 1) {
    const planned = routeableStops[index];
    const origin =
      index === 0 ? options.startLocation : routeableStops[index - 1];
    if (!origin) continue;

    const plannedDistance = calculateDistance(origin, planned);
    totalDistanceKm += plannedDistance;
    maxLegKm = Math.max(maxLegKm, plannedDistance);

    if (index === 0 && options.startLocation && plannedDistance >= FIRST_STOP_FAR_KM) {
      issues.push({
        type: "first_stop_far",
        severity: "medium",
        title: "Primeira parada longe da origem",
        message: `A primeira parada esta a ${roundKm(
          plannedDistance
        )} km da posicao inicial informada.`,
        toSequence: planned.sequence,
        distanceKm: roundKm(plannedDistance),
      });
    }

    if (plannedDistance >= LONG_JUMP_KM) {
      issues.push({
        type: "long_jump",
        severity: "medium",
        title: "Salto longo entre paradas",
        message: `Trecho de ${roundKm(plannedDistance)} km entre paradas consecutivas.`,
        fromSequence: index === 0 ? undefined : routeableStops[index - 1].sequence,
        toSequence: planned.sequence,
        distanceKm: roundKm(plannedDistance),
      });
    }

    const remaining = routeableStops.slice(index + 1);
    let nearest: AuditableStop | null = null;
    let nearestDistance = Infinity;

    for (const candidate of remaining) {
      const distance = calculateDistance(origin, candidate);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }

    if (!nearest) continue;

    const gapKm = plannedDistance - nearestDistance;
    const immediateSkip =
      nearestDistance <= IMMEDIATE_NEARBY_KM && gapKm >= IMMEDIATE_GAP_KM;
    const localSkip =
      nearestDistance <= LOCAL_NEARBY_KM && gapKm >= LOCAL_GAP_KM;

    if (immediateSkip || localSkip) {
      issues.push({
        type: "nearby_stop_skipped",
        severity: "high",
        title: immediateSkip
          ? "Parada muito próxima foi pulada"
          : "Parada próxima deixada para depois",
        message: describeExpectedPlacement(
          nearest.sequence,
          index === 0 ? undefined : routeableStops[index - 1].sequence,
          planned.sequence,
          nearestDistance,
          plannedDistance
        ),
        fromSequence: index === 0 ? undefined : routeableStops[index - 1].sequence,
        toSequence: planned.sequence,
        nearestSequence: nearest.sequence,
        distanceKm: roundKm(plannedDistance),
        nearestDistanceKm: roundKm(nearestDistance),
        gapKm: roundKm(gapKm),
      });
    }

    for (const later of remaining) {
      const returnDistance = calculateDistance(origin, later);
      if (
        plannedDistance >= REVISIT_AFTER_JUMP_KM &&
        returnDistance <= REVISIT_RADIUS_KM
      ) {
        issues.push({
          type: "region_revisited",
          severity: "high",
          title: "Retorno desnecessario para regiao proxima",
          message: describeExpectedPlacement(
            later.sequence,
            index === 0 ? undefined : routeableStops[index - 1].sequence,
            planned.sequence,
            returnDistance,
            plannedDistance
          ),
          fromSequence: index === 0 ? undefined : routeableStops[index - 1].sequence,
          toSequence: planned.sequence,
          nearestSequence: later.sequence,
          distanceKm: roundKm(plannedDistance),
          nearestDistanceKm: roundKm(returnDistance),
        });
        break;
      }
    }
  }

  if (
    options.actualTotalDistanceKm &&
    totalDistanceKm > 0 &&
    options.actualTotalDistanceKm / totalDistanceKm >= ROAD_DETOUR_RATIO
  ) {
    issues.push({
      type: "high_road_detour",
      severity: "medium",
      title: "Verificar desvio alto por rua",
      message: `A distancia por rua ficou ${roundKm(
        options.actualTotalDistanceKm / totalDistanceKm
      )}x maior que a distancia em linha reta. Pode ser normal por mao unica, avenidas ou acessos indiretos, mas merece conferencia.`,
      distanceKm: roundKm(options.actualTotalDistanceKm),
      nearestDistanceKm: roundKm(totalDistanceKm),
    });
  }

  const coordinateGroups = new Map<string, AuditableStop[]>();
  for (const stop of routeableStops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) {
      continue;
    }
    const key = coordinateKey(stop);
    coordinateGroups.set(key, [...(coordinateGroups.get(key) || []), stop]);
  }

  for (const group of Array.from(coordinateGroups.values())) {
    const uniqueAddresses = Array.from(
      new Set(group.map((stop) => normalizeAddress(stop.address)).filter(Boolean))
    );
    if (group.length > 1 && uniqueAddresses.length > 1) {
      issues.push({
        type: "duplicate_coordinates",
        severity: "medium",
        title: "Endereços diferentes com a mesma coordenada",
        message: `${group.length} paradas caíram no mesmo ponto do mapa. Isso pode indicar geocodificação aproximada.`,
        stopSequence: group[0].sequence,
        addresses: group.map((stop) => stop.address || `Parada ${stop.sequence + 1}`),
      });
    }
  }

  for (const crossing of detectRouteCrossings(routeableStops)) {
    issues.push({
      type: "route_crossing",
      severity: "low",
      title: "Cruzamento visual no trajeto",
      message: `O trecho entre as paradas ${crossing.fromSequence + 1} e ${
        crossing.toSequence + 1
      } cruza o trecho entre as paradas ${crossing.crossingFromSequence + 1} e ${
        crossing.crossingToSequence + 1
      }. Isso e informativo e nao bloqueia a rota quando nao ha revisita, salto ou parada proxima pulada.`,
      fromSequence: crossing.fromSequence,
      toSequence: crossing.toSequence,
      nearestSequence: crossing.crossingFromSequence,
      crossingToSequence: crossing.crossingToSequence,
    });
  }

  const hasBadPreservedSequence =
    options.respectInputSequence && issues.length > 0;
  if (hasBadPreservedSequence) {
    issues.unshift({
      type: "bad_preserved_sequence",
      severity: "high",
      title: "Sequencia da planilha preservada com alertas",
      message:
        "A rota respeitou a ordem original da tabela, mas o auditor encontrou sinais de sequencia ruim. Use otimizar rota se a operacao permitir.",
    });
  }

  const finalCriticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const finalWarningCount = issues.filter((issue) => issue.severity !== "critical").length;
  const score = Math.max(
    0,
    100 -
      issues.reduce(
        (total, issue) => total + (ROUTE_QUALITY_PENALTIES[issue.type] ?? 10),
        0
      )
  );

  return {
    status: getReportStatus(finalCriticalCount, finalWarningCount),
    score,
    quality: getRouteQuality(score),
    stopCount: orderedStops.length,
    issueCount: issues.length,
    criticalCount: finalCriticalCount,
    warningCount: finalWarningCount,
    totalDistanceKm: roundKm(totalDistanceKm),
    maxLegKm: roundKm(maxLegKm),
    clusterMetrics,
    issues,
  };
}

