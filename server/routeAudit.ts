import { calculateDistance, type Location } from "./optimization";

export type RouteAuditSeverity = "low" | "medium" | "high" | "critical";

export type RouteAuditIssue = {
  type:
    | "nearby_stop_skipped"
    | "long_jump"
    | "duplicate_coordinates"
    | "first_stop_far"
    | "region_revisited"
    | "high_road_detour"
    | "missing_driver_origin"
    | "bad_preserved_sequence"
    | "osrm_fallback";
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
};

export type AuditableStop = Location & {
  id?: number;
  sequence: number;
};

export type RouteAuditReport = {
  status: "approved" | "attention" | "critical";
  score: number;
  stopCount: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  totalDistanceKm: number;
  maxLegKm: number;
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

function roundKm(value: number) {
  return Math.round(value * 100) / 100;
}

function coordinateKey(stop: AuditableStop) {
  return `${stop.latitude.toFixed(COORDINATE_PRECISION)},${stop.longitude.toFixed(
    COORDINATE_PRECISION
  )}`;
}

function normalizeAddress(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function getReportStatus(criticalCount: number, warningCount: number) {
  if (criticalCount > 0) return "critical";
  if (warningCount > 0) return "attention";
  return "approved";
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

  if (options.requireStartLocation && !options.startLocation && orderedStops.length > 1) {
    issues.push({
      type: "missing_driver_origin",
      severity: "medium",
      title: "Rota criada sem origem do motorista",
      message:
        "Sem a origem real, o sistema otimiza a sequencia entre paradas, mas pode escolher uma primeira entrega ruim para quem esta na rua.",
    });
  }

  if (options.usedRoadMetrics === false && orderedStops.length > 1) {
    issues.push({
      type: "osrm_fallback",
      severity: "high",
      title: "Otimizacao sem OSRM",
      message:
        "A rota foi avaliada por distancia geografica. Isso pode ignorar sentidos de rua, retornos e caminhos reais.",
    });
  }

  for (let index = 0; index < orderedStops.length; index += 1) {
    const planned = orderedStops[index];
    const origin =
      index === 0 ? options.startLocation : orderedStops[index - 1];
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
        fromSequence: index === 0 ? undefined : orderedStops[index - 1].sequence,
        toSequence: planned.sequence,
        distanceKm: roundKm(plannedDistance),
      });
    }

    const remaining = orderedStops.slice(index + 1);
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
        severity: immediateSkip ? "critical" : "high",
        title: immediateSkip
          ? "Parada muito próxima foi pulada"
          : "Parada próxima deixada para depois",
        message: `A sequência escolheu uma parada a ${roundKm(
          plannedDistance
        )} km, mas havia outra pendente a ${roundKm(nearestDistance)} km.`,
        fromSequence: index === 0 ? undefined : orderedStops[index - 1].sequence,
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
          message: `A rota sai para ${roundKm(
            plannedDistance
          )} km, mas ainda existe parada a ${roundKm(
            returnDistance
          )} km da regiao atual que ficara para depois.`,
          fromSequence: index === 0 ? undefined : orderedStops[index - 1].sequence,
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
  for (const stop of orderedStops) {
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
  const highCount = issues.filter((issue) => issue.severity === "high").length;
  const mediumCount = issues.filter((issue) => issue.severity === "medium").length;
  const lowCount = issues.filter((issue) => issue.severity === "low").length;
  const score = Math.max(
    0,
    100 - finalCriticalCount * 30 - highCount * 18 - mediumCount * 10 - lowCount * 4
  );

  return {
    status: getReportStatus(finalCriticalCount, finalWarningCount),
    score,
    stopCount: orderedStops.length,
    issueCount: issues.length,
    criticalCount: finalCriticalCount,
    warningCount: finalWarningCount,
    totalDistanceKm: roundKm(totalDistanceKm),
    maxLegKm: roundKm(maxLegKm),
    issues,
  };
}
