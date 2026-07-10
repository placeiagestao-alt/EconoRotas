import { ENV } from "./_core/env";
import { createHash } from "node:crypto";
import * as db from "./db";
import {
  clusterStops,
  calculateDistance,
  partitionStopsForOptimization,
  type Location,
  type OptimizedRoute,
  type RouteOptimizationOptions,
} from "./optimization";
import {
  calculateObjectiveCost,
  chooseObjective,
  type RouteMode,
  type RouteObjective,
} from "./routeObjective";

type MatrixValue = number[][];
type MatrixMetric = "distance" | "duration";

const ROAD_MATRIX_PARTITION_SIZE = 70;

type OsrmTableResponse = {
  code: string;
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
};

type OsrmRouteResponse = {
  code?: string;
};

export type OsrmProviderType =
  | "unconfigured"
  | "invalid"
  | "public"
  | "self_hosted";

export type OsrmReadinessStatus = "ok" | "attention" | "no-go";

export type OsrmConfiguration = {
  configured: boolean;
  configurationValid: boolean;
  providerType: OsrmProviderType;
  isPublic: boolean;
  baseUrl: string | null;
  profile: string;
  productionEligible: boolean;
  routingAllowed: boolean;
  configurationError: string | null;
};

export type OsrmHealth = {
  enabled: boolean;
  required: boolean;
  configured: boolean;
  configurationValid: boolean;
  reachable: boolean;
  baseUrl: string | null;
  profile: string;
  providerType: OsrmProviderType;
  isPublic: boolean;
  productionEligible: boolean;
  productionReady: boolean;
  usable: boolean;
  fallbackPolicy: "blocked" | "geographic_allowed";
  status: OsrmReadinessStatus;
  reason: string;
  timeoutMs: number;
  requestTimeoutMs: number;
  latencyMs?: number;
  maxTableNodes: number;
  retries: number;
  services: Array<"route" | "table">;
  healthCheckSkipped: boolean;
  error: string | null;
};

type MatrixNode = {
  location: Location;
  deliveryIndex?: number;
  role: "delivery" | "start" | "end";
};

type RoadMatrix = {
  nodes: MatrixNode[];
  distancesKm: MatrixValue;
  durationsMinutes: MatrixValue;
};

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sanitizeBaseUrlForDisplay(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getOsrmConfiguration(): OsrmConfiguration {
  const rawBaseUrl = ENV.osrmBaseUrl.trim().replace(/\/+$/, "");
  const profile = ENV.osrmProfile.trim();
  if (!rawBaseUrl) {
    return {
      configured: false,
      configurationValid: false,
      providerType: "unconfigured",
      isPublic: false,
      baseUrl: null,
      profile,
      productionEligible: false,
      routingAllowed: false,
      configurationError: "OSRM_BASE_URL nao configurado.",
    };
  }

  try {
    const url = new URL(rawBaseUrl);
    const protocolValid = url.protocol === "http:" || url.protocol === "https:";
    const profileValid = /^[a-z0-9_-]+$/i.test(profile);
    const hostname = url.hostname.toLowerCase();
    const isPublic =
      hostname === "router.project-osrm.org" ||
      hostname.endsWith(".project-osrm.org");
    const configurationValid = protocolValid && profileValid;
    const productionEligible =
      configurationValid && url.protocol === "https:" && !isPublic;
    let configurationError: string | null = null;

    if (!protocolValid) {
      configurationError = "OSRM_BASE_URL deve usar protocolo http ou https.";
    } else if (!profileValid) {
      configurationError =
        "OSRM_PROFILE invalido. Use apenas letras, numeros, hifen ou sublinhado.";
    } else if (ENV.isProduction && ENV.osrmRequired && isPublic) {
      configurationError =
        "OSRM_REQUIRED=true nao permite router.project-osrm.org em producao.";
    } else if (
      ENV.isProduction &&
      ENV.osrmRequired &&
      url.protocol !== "https:"
    ) {
      configurationError =
        "OSRM_REQUIRED=true exige OSRM_BASE_URL com HTTPS em producao.";
    }

    return {
      configured: true,
      configurationValid,
      providerType: configurationValid
        ? isPublic
          ? "public"
          : "self_hosted"
        : "invalid",
      isPublic,
      baseUrl: sanitizeBaseUrlForDisplay(rawBaseUrl),
      profile,
      productionEligible,
      routingAllowed:
        configurationValid &&
        !(ENV.isProduction && ENV.osrmRequired && !productionEligible),
      configurationError,
    };
  } catch {
    return {
      configured: true,
      configurationValid: false,
      providerType: "invalid",
      isPublic: false,
      baseUrl: null,
      profile,
      productionEligible: false,
      routingAllowed: false,
      configurationError: "OSRM_BASE_URL invalido.",
    };
  }
}

function getRoadMatrixMaxNodes() {
  const configuration = getOsrmConfiguration();
  return readPositiveIntegerEnv(
    "OSRM_MAX_TABLE_NODES",
    configuration.isPublic ? 50 : 100
  );
}

function getRoadMatrixPartitionSize(options: RouteOptimizationOptions = {}) {
  if (options.maxPartitionSize) return options.maxPartitionSize;
  const maxDeliveryNodes = Math.max(10, getRoadMatrixMaxNodes() - 2);
  return Math.min(ROAD_MATRIX_PARTITION_SIZE, maxDeliveryNodes);
}

type LocalitySettings = {
  immediateRadius: number;
  immediateExtraThreshold: number;
  localRadius: number;
  ratioThreshold: number;
  extraThreshold: number;
  longJumpThreshold: number;
  penaltyMultiplier: number;
  prematureClusterSwitchPenalty: number;
};

function getLocalitySettings(
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
): LocalitySettings {
  if (localityMode === "strict") {
    return {
      immediateRadius: 0.25,
      immediateExtraThreshold: 0.03,
      localRadius: 2.5,
      ratioThreshold: 1.12,
      extraThreshold: 0.08,
      longJumpThreshold: 0.35,
      penaltyMultiplier: 4,
      prematureClusterSwitchPenalty: 30,
    };
  }

  if (localityMode === "balanced") {
    return {
      immediateRadius: 0.08,
      immediateExtraThreshold: 0.08,
      localRadius: 1.5,
      ratioThreshold: 1.55,
      extraThreshold: 0.35,
      longJumpThreshold: 1.25,
      penaltyMultiplier: 2,
      prematureClusterSwitchPenalty: 15,
    };
  }

  return {
    immediateRadius: 0.12,
    immediateExtraThreshold: 0.05,
    localRadius: 2,
    ratioThreshold: 1.28,
    extraThreshold: 0.18,
    longJumpThreshold: 0.7,
    penaltyMultiplier: 3,
    prematureClusterSwitchPenalty: 20,
  };
}

function isAvoidableLocalJump(
  nearestMetric: number,
  plannedMetric: number,
  settings: LocalitySettings
) {
  if (
    nearestMetric <= settings.immediateRadius &&
    plannedMetric - nearestMetric >= settings.immediateExtraThreshold
  ) {
    return true;
  }

  const significantlyCloser =
    plannedMetric >
    Math.max(
      nearestMetric * settings.ratioThreshold,
      nearestMetric + settings.extraThreshold
    );
  const nearbyContext =
    nearestMetric <= settings.localRadius ||
    plannedMetric <= settings.localRadius * 2.5;
  const longJump = plannedMetric - nearestMetric >= settings.longJumpThreshold;

  return significantlyCloser && (nearbyContext || longJump);
}

function isValidCoordinate(location: Location) {
  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}

function buildNodes(
  locations: Location[],
  options: RouteOptimizationOptions = {}
) {
  const nodes: MatrixNode[] = locations.map((location, deliveryIndex) => ({
    location,
    deliveryIndex,
    role: "delivery",
  }));
  const startNodeIndex =
    options.startLocation && isValidCoordinate(options.startLocation)
      ? nodes.push({ location: options.startLocation, role: "start" }) - 1
      : undefined;
  const endNodeIndex =
    options.endLocation && isValidCoordinate(options.endLocation)
      ? nodes.push({ location: options.endLocation, role: "end" }) - 1
      : undefined;

  return { nodes, startNodeIndex, endNodeIndex };
}

function buildOsrmTableUrl(nodes: MatrixNode[]) {
  const baseUrl = ENV.osrmBaseUrl.replace(/\/+$/, "");
  const profile = ENV.osrmProfile;
  const coordinates = nodes
    .map(({ location }) => `${location.longitude},${location.latitude}`)
    .join(";");
  return `${baseUrl}/table/v1/${profile}/${coordinates}?annotations=duration,distance`;
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function coordinateKey(node: MatrixNode) {
  return [
    node.role,
    node.deliveryIndex ?? "",
    Number(node.location.latitude).toFixed(6),
    Number(node.location.longitude).toFixed(6),
  ].join(":");
}

function buildMatrixHashes(nodes: MatrixNode[]) {
  const orderedCoordinates = nodes.map(coordinateKey).join("|");
  const unorderedCoordinates = nodes
    .map(node =>
      [
        node.role,
        Number(node.location.latitude).toFixed(6),
        Number(node.location.longitude).toFixed(6),
      ].join(":")
    )
    .sort()
    .join("|");
  const providerKey = ENV.osrmBaseUrl.replace(/\/+$/, "");

  return {
    matrixHash: hashText(
      [ENV.osrmProfile, providerKey, orderedCoordinates].join("|")
    ),
    clusterHash: hashText([ENV.osrmProfile, unorderedCoordinates].join("|")),
  };
}

function isMatrixValue(
  value: unknown,
  expectedSize: number
): value is MatrixValue {
  return (
    Array.isArray(value) &&
    value.length === expectedSize &&
    value.every(
      row =>
        Array.isArray(row) &&
        row.length === expectedSize &&
        row.every(item => typeof item === "number" && Number.isFinite(item))
    )
  );
}

function buildOsrmRouteHealthUrl() {
  const baseUrl = ENV.osrmBaseUrl.replace(/\/+$/, "");
  const profile = ENV.osrmProfile;
  const coordinates = "-51.407,-22.121;-51.406,-22.122";
  return `${baseUrl}/route/v1/${profile}/${coordinates}?overview=false&alternatives=false&steps=false`;
}

function buildOsrmTableHealthUrl() {
  const baseUrl = ENV.osrmBaseUrl.replace(/\/+$/, "");
  const profile = ENV.osrmProfile;
  const coordinates = "-51.407,-22.121;-51.406,-22.122";
  return `${baseUrl}/table/v1/${profile}/${coordinates}?annotations=duration,distance`;
}

function normalizeMatrix(
  values: Array<Array<number | null>> | undefined,
  factor: number
): MatrixValue | null {
  if (!values?.length) return null;

  const normalized = values.map(row =>
    row.map(value =>
      typeof value === "number" && Number.isFinite(value)
        ? value / factor
        : Infinity
    )
  );

  return normalized.some(row => row.some(value => !Number.isFinite(value)))
    ? null
    : normalized;
}

async function fetchRoadMatrix(
  locations: Location[],
  options: RouteOptimizationOptions = {}
): Promise<{
  matrix: RoadMatrix;
  startNodeIndex?: number;
  endNodeIndex?: number;
} | null> {
  const configuration = getOsrmConfiguration();
  if (
    !ENV.osrmEnabled ||
    !configuration.configurationValid ||
    !configuration.routingAllowed ||
    locations.length === 0
  ) {
    return null;
  }

  const { nodes, startNodeIndex, endNodeIndex } = buildNodes(
    locations,
    options
  );
  if (
    nodes.length < 2 ||
    nodes.some(node => !isValidCoordinate(node.location))
  ) {
    return null;
  }

  const startedAt = Date.now();
  const provider =
    configuration.baseUrl ?? "osrm-configured-with-invalid-display-url";
  const record = (
    success: boolean,
    failureReason: string | null = null,
    cacheHit = false
  ) => {
    const durationMs = Date.now() - startedAt;
    if (!cacheHit) {
      options.telemetry?.recordOsrmCall?.(durationMs, success);
    }
    options.telemetry?.recordOsrmMatrix?.({
      nodeCount: nodes.length,
      durationMs,
      cacheHit,
      success,
      failureReason,
      provider,
    });
  };

  const maxTableNodes = getRoadMatrixMaxNodes();
  if (nodes.length > maxTableNodes) {
    record(false, "matrix_too_large_for_provider");
    return null;
  }

  const { matrixHash, clusterHash } = buildMatrixHashes(nodes);
  const shouldUseMatrixCache = process.env.VITEST !== "true";
  const cached = shouldUseMatrixCache
    ? await db.getOsrmMatrixCache(matrixHash).catch(() => null)
    : null;
  if (
    cached &&
    isMatrixValue(cached.distanceMatrix, nodes.length) &&
    isMatrixValue(cached.durationMatrix, nodes.length)
  ) {
    record(true, null, true);
    return {
      matrix: {
        nodes,
        distancesKm: cached.distanceMatrix,
        durationsMinutes: cached.durationMatrix,
      },
      startNodeIndex,
      endNodeIndex,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ENV.osrmRequestTimeoutMs
  );

  try {
    const response = await fetch(buildOsrmTableUrl(nodes), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      record(false, `http_${response.status}`);
      return null;
    }

    const data = (await response.json()) as OsrmTableResponse;
    if (data.code !== "Ok") {
      record(false, `osrm_${data.code || "not_ok"}`);
      return null;
    }

    const distancesKm = normalizeMatrix(data.distances, 1000);
    const durationsMinutes = normalizeMatrix(data.durations, 60);
    if (!distancesKm || !durationsMinutes) {
      record(false, "invalid_matrix");
      return null;
    }

    if (shouldUseMatrixCache) {
      await db
        .upsertOsrmMatrixCache({
          matrixHash,
          clusterHash,
          stopCount: nodes.length,
          durationMatrix: durationsMinutes,
          distanceMatrix: distancesKm,
          provider: "osrm",
          osrmBaseUrl: provider,
        })
        .catch(() => null);
    }
    record(true);
    return {
      matrix: { nodes, distancesKm, durationsMinutes },
      startNodeIndex,
      endNodeIndex,
    };
  } catch (error) {
    record(
      false,
      error instanceof Error ? error.name || error.message : "fetch_error"
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOsrmHealth(): Promise<OsrmHealth> {
  const configuration = getOsrmConfiguration();
  const fallbackPolicy: OsrmHealth["fallbackPolicy"] = ENV.osrmRequired
    ? "blocked"
    : "geographic_allowed";
  const baseHealth = {
    enabled: ENV.osrmEnabled,
    required: ENV.osrmRequired,
    configured: configuration.configured,
    configurationValid: configuration.configurationValid,
    reachable: false,
    baseUrl: configuration.baseUrl,
    profile: configuration.profile,
    providerType: configuration.providerType,
    isPublic: configuration.isPublic,
    productionEligible: configuration.productionEligible,
    productionReady: false,
    usable: false,
    fallbackPolicy,
    status: "attention" as OsrmReadinessStatus,
    reason: "",
    timeoutMs: ENV.osrmHealthTimeoutMs,
    requestTimeoutMs: ENV.osrmRequestTimeoutMs,
    maxTableNodes: getRoadMatrixMaxNodes(),
    retries: 0,
    services: ["route", "table"] as Array<"route" | "table">,
    healthCheckSkipped: false,
    error: null,
  };

  if (!ENV.osrmEnabled) {
    const reason = ENV.osrmRequired
      ? "OSRM obrigatorio esta desativado por OSRM_ENABLED=false."
      : "OSRM esta desativado; fallback geografico permanece permitido.";
    return {
      ...baseHealth,
      status: ENV.osrmRequired ? "no-go" : "attention",
      reason,
      healthCheckSkipped: true,
      error: ENV.osrmRequired ? reason : null,
    };
  }

  if (!configuration.configured || !configuration.configurationValid) {
    const reason =
      configuration.configurationError ?? "Configuracao OSRM invalida.";
    return {
      ...baseHealth,
      status: ENV.osrmRequired ? "no-go" : "attention",
      reason,
      healthCheckSkipped: true,
      error: reason,
    };
  }

  if (!configuration.routingAllowed) {
    const reason =
      configuration.configurationError ??
      "Configuracao OSRM bloqueada pela politica de producao.";
    return {
      ...baseHealth,
      status: "no-go",
      reason,
      healthCheckSkipped: true,
      error: reason,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENV.osrmHealthTimeoutMs);
  const startedAt = Date.now();

  try {
    const [routeResponse, tableResponse] = await Promise.all([
      fetch(buildOsrmRouteHealthUrl(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
      fetch(buildOsrmTableHealthUrl(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
    ]);
    if (!routeResponse.ok || !tableResponse.ok) {
      const service = !routeResponse.ok ? "route" : "table";
      const status = !routeResponse.ok
        ? routeResponse.status
        : tableResponse.status;
      const reason = `OSRM ${service} respondeu HTTP ${status}.`;
      return {
        ...baseHealth,
        status: ENV.osrmRequired ? "no-go" : "attention",
        reason,
        error: reason,
      };
    }

    const [routeData, tableData] = await Promise.all([
      routeResponse.json() as Promise<OsrmRouteResponse>,
      tableResponse.json() as Promise<OsrmTableResponse>,
    ]);
    if (routeData.code !== "Ok" || tableData.code !== "Ok") {
      const service = routeData.code !== "Ok" ? "route" : "table";
      const code = routeData.code !== "Ok" ? routeData.code : tableData.code;
      const reason = `OSRM ${service} respondeu code=${code ?? "indefinido"}.`;
      return {
        ...baseHealth,
        status: ENV.osrmRequired ? "no-go" : "attention",
        reason,
        error: reason,
      };
    }

    const healthDistances = normalizeMatrix(tableData.distances, 1000);
    const healthDurations = normalizeMatrix(tableData.durations, 60);
    if (
      !healthDistances ||
      !healthDurations ||
      !isMatrixValue(healthDistances, 2) ||
      !isMatrixValue(healthDurations, 2)
    ) {
      const reason =
        "OSRM table respondeu sem matriz valida de distancia/duracao.";
      return {
        ...baseHealth,
        status: ENV.osrmRequired ? "no-go" : "attention",
        reason,
        error: reason,
      };
    }

    const usable = true;
    const productionReady =
      configuration.productionEligible && ENV.osrmRequired;
    const status: OsrmReadinessStatus =
      ENV.isProduction && !productionReady
        ? "attention"
        : configuration.isPublic
          ? "attention"
          : "ok";
    const reason =
      ENV.isProduction && configuration.isPublic
        ? "OSRM publico esta alcancavel, mas nao e escalavel nem possui SLA do EconoRotas."
        : ENV.isProduction && !ENV.osrmRequired
          ? "OSRM proprio esta saudavel, mas OSRM_REQUIRED=false permite fallback geografico."
          : configuration.isPublic
            ? "OSRM publico foi configurado explicitamente para este ambiente."
            : "OSRM proprio esta configurado e saudavel.";

    return {
      ...baseHealth,
      reachable: true,
      productionReady,
      usable,
      status,
      reason,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Falha ao consultar OSRM.";
    const reason = `OSRM indisponivel: ${detail}`;
    return {
      ...baseHealth,
      status: ENV.osrmRequired ? "no-go" : "attention",
      reason,
      error: detail,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getMetric(
  matrix: RoadMatrix,
  mode: MatrixMetric,
  from: number,
  to: number
) {
  return mode === "duration"
    ? matrix.durationsMinutes[from][to]
    : matrix.distancesKm[from][to];
}

function getObjectiveMetric(
  matrix: RoadMatrix,
  objective: RouteObjective,
  from: number,
  to: number
) {
  return calculateObjectiveCost(
    matrix.distancesKm[from][to],
    matrix.durationsMinutes[from][to],
    objective
  );
}

function calculateSequenceMetric(
  matrix: RoadMatrix,
  sequence: number[],
  mode: MatrixMetric,
  startNodeIndex?: number,
  endNodeIndex?: number
) {
  let total = 0;

  if (sequence.length === 0) {
    return startNodeIndex !== undefined && endNodeIndex !== undefined
      ? getMetric(matrix, mode, startNodeIndex, endNodeIndex)
      : 0;
  }

  if (startNodeIndex !== undefined) {
    total += getMetric(matrix, mode, startNodeIndex, sequence[0]);
  }

  for (let index = 0; index < sequence.length - 1; index += 1) {
    total += getMetric(matrix, mode, sequence[index], sequence[index + 1]);
  }

  if (endNodeIndex !== undefined) {
    total += getMetric(
      matrix,
      mode,
      sequence[sequence.length - 1],
      endNodeIndex
    );
  }

  return total;
}

function calculateSequenceObjective(
  matrix: RoadMatrix,
  sequence: number[],
  objective: RouteObjective,
  startNodeIndex?: number,
  endNodeIndex?: number
) {
  const distanceKm = calculateSequenceMetric(
    matrix,
    sequence,
    "distance",
    startNodeIndex,
    endNodeIndex
  );
  const durationMin = calculateSequenceMetric(
    matrix,
    sequence,
    "duration",
    startNodeIndex,
    endNodeIndex
  );
  return calculateObjectiveCost(distanceKm, durationMin, objective);
}

function buildRoadRoute(
  matrix: RoadMatrix,
  sequence: number[],
  startNodeIndex?: number,
  endNodeIndex?: number
): OptimizedRoute {
  return {
    sequence: sequence.map(
      nodeIndex => matrix.nodes[nodeIndex].deliveryIndex ?? nodeIndex
    ),
    totalDistance:
      Math.round(
        calculateSequenceMetric(
          matrix,
          sequence,
          "distance",
          startNodeIndex,
          endNodeIndex
        ) * 100
      ) / 100,
    totalTime: Math.round(
      calculateSequenceMetric(
        matrix,
        sequence,
        "duration",
        startNodeIndex,
        endNodeIndex
      )
    ),
    waypoints: sequence.map((nodeIndex, sequenceIndex) => ({
      ...matrix.nodes[nodeIndex].location,
      sequence: sequenceIndex,
    })),
  };
}

function buildNearestSequence(
  matrix: RoadMatrix,
  deliveryNodeIndexes: number[],
  startIndex: number,
  objective: RouteObjective,
  startNodeIndex?: number
) {
  const available = new Set(deliveryNodeIndexes);
  const sequence: number[] = [];
  let currentNodeIndex =
    startNodeIndex ?? deliveryNodeIndexes[startIndex] ?? deliveryNodeIndexes[0];

  if (startNodeIndex === undefined) {
    available.delete(currentNodeIndex);
    sequence.push(currentNodeIndex);
  }

  while (available.size > 0) {
    let nearestIndex = -1;
    let nearestMetric = Infinity;

    for (const candidateIndex of Array.from(available)) {
      const metric = getObjectiveMetric(
        matrix,
        objective,
        currentNodeIndex,
        candidateIndex
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }

    if (nearestIndex === -1) break;

    available.delete(nearestIndex);
    sequence.push(nearestIndex);
    currentNodeIndex = nearestIndex;
  }

  return sequence;
}

function improveSequenceWithTwoOpt(
  matrix: RoadMatrix,
  initialSequence: number[],
  objective: RouteObjective,
  startNodeIndex?: number,
  endNodeIndex?: number
) {
  let sequence = [...initialSequence];
  let bestMetric = calculateSequenceObjective(
    matrix,
    sequence,
    objective,
    startNodeIndex,
    endNodeIndex
  );
  let improved = true;
  let passes = 0;
  const firstMutableIndex = startNodeIndex !== undefined ? 1 : 0;

  while (improved && passes < 8) {
    improved = false;
    passes += 1;

    for (let i = firstMutableIndex; i < sequence.length - 1; i += 1) {
      for (let k = i + 1; k < sequence.length; k += 1) {
        const candidate = [
          ...sequence.slice(0, i),
          ...sequence.slice(i, k + 1).reverse(),
          ...sequence.slice(k + 1),
        ];
        const candidateMetric = calculateSequenceObjective(
          matrix,
          candidate,
          objective,
          startNodeIndex,
          endNodeIndex
        );

        if (candidateMetric + 0.000001 < bestMetric) {
          sequence = candidate;
          bestMetric = candidateMetric;
          improved = true;
        }
      }
    }
  }

  return sequence;
}

function enforceLocalNearestRoadSequence(
  matrix: RoadMatrix,
  initialSequence: number[],
  objective: RouteObjective,
  startNodeIndex?: number,
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
) {
  const remaining = new Set(initialSequence);
  const sequence: number[] = [];
  let currentNodeIndex = startNodeIndex ?? initialSequence[0];
  const localitySettings = getLocalitySettings(localityMode);

  while (remaining.size > 0) {
    const plannedNext = initialSequence.find(nodeIndex =>
      remaining.has(nodeIndex)
    );
    if (plannedNext === undefined) break;

    let nearestIndex = plannedNext;
    let nearestMetric = getObjectiveMetric(
      matrix,
      objective,
      currentNodeIndex,
      plannedNext
    );

    for (const candidateIndex of Array.from(remaining)) {
      const metric = getObjectiveMetric(
        matrix,
        objective,
        currentNodeIndex,
        candidateIndex
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }

    const plannedMetric = getObjectiveMetric(
      matrix,
      objective,
      currentNodeIndex,
      plannedNext
    );
    const jumpIsOperationallyBad =
      nearestIndex !== plannedNext &&
      isAvoidableLocalJump(nearestMetric, plannedMetric, localitySettings);
    const nextIndex = jumpIsOperationallyBad ? nearestIndex : plannedNext;

    remaining.delete(nextIndex);
    sequence.push(nextIndex);
    currentNodeIndex = nextIndex;
  }

  return sequence;
}

function calculateAvoidableJumpPenalty(
  matrix: RoadMatrix,
  sequence: number[],
  objective: RouteObjective,
  startNodeIndex?: number,
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
) {
  const settings = getLocalitySettings(localityMode);
  const remaining = new Set(sequence);
  let currentNodeIndex = startNodeIndex ?? sequence[0];
  let penalty = 0;

  for (const plannedNext of sequence) {
    remaining.delete(plannedNext);
    const plannedMetric = getObjectiveMetric(
      matrix,
      objective,
      currentNodeIndex,
      plannedNext
    );
    let nearestMetric = plannedMetric;

    for (const candidateIndex of [plannedNext, ...Array.from(remaining)]) {
      const metric = getObjectiveMetric(
        matrix,
        objective,
        currentNodeIndex,
        candidateIndex
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
      }
    }

    if (isAvoidableLocalJump(nearestMetric, plannedMetric, settings)) {
      penalty += (plannedMetric - nearestMetric) * settings.penaltyMultiplier;
    }

    currentNodeIndex = plannedNext;
  }

  return penalty;
}

function buildClusteredDeliveryNodeSequence(
  locations: Location[],
  deliveryNodeIndexes: number[],
  options: RouteOptimizationOptions = {}
) {
  const clusters = clusterStops(locations, options);
  if (clusters.length <= 1) return null;

  const nodeByDeliveryIndex = new Map<number, number>();
  deliveryNodeIndexes.forEach((nodeIndex, deliveryIndex) => {
    nodeByDeliveryIndex.set(deliveryIndex, nodeIndex);
  });

  const sequence = clusters.flatMap(cluster =>
    cluster.stops
      .map(stop => nodeByDeliveryIndex.get(stop.originalIndex))
      .filter((nodeIndex): nodeIndex is number => nodeIndex !== undefined)
  );

  return sequence.length === deliveryNodeIndexes.length ? sequence : null;
}

function calculateClusterSwitchPenalty(
  matrix: RoadMatrix,
  locations: Location[],
  sequence: number[],
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
) {
  const settings = getLocalitySettings(localityMode);
  const clusters = clusterStops(locations, { localityMode });
  if (clusters.length <= 1) return 0;

  const clusterByDeliveryIndex = new Map<number, number>();
  for (const cluster of clusters) {
    if (cluster.stops.length < 2) continue;
    for (const stop of cluster.stops) {
      clusterByDeliveryIndex.set(stop.originalIndex, cluster.clusterId);
    }
  }

  const clusterByNodeIndex = new Map<number, number>();
  matrix.nodes.forEach((node, nodeIndex) => {
    if (node.deliveryIndex === undefined) return;
    const clusterId = clusterByDeliveryIndex.get(node.deliveryIndex);
    if (clusterId) clusterByNodeIndex.set(nodeIndex, clusterId);
  });

  let penalty = 0;
  for (
    let sequenceIndex = 1;
    sequenceIndex < sequence.length;
    sequenceIndex += 1
  ) {
    const previousCluster = clusterByNodeIndex.get(sequence[sequenceIndex - 1]);
    const currentCluster = clusterByNodeIndex.get(sequence[sequenceIndex]);
    if (
      !previousCluster ||
      !currentCluster ||
      previousCluster === currentCluster
    ) {
      continue;
    }

    const pendingInPreviousCluster = sequence
      .slice(sequenceIndex + 1)
      .filter(
        nodeIndex => clusterByNodeIndex.get(nodeIndex) === previousCluster
      );
    if (pendingInPreviousCluster.length > 0) {
      const fromNode = sequence[sequenceIndex - 1];
      const toNode = sequence[sequenceIndex];
      const switchDuration = matrix.durationsMinutes[fromNode]?.[toNode] ?? 0;
      const averagePendingDuration =
        pendingInPreviousCluster.reduce(
          (total, pendingNode) =>
            total + (matrix.durationsMinutes[fromNode]?.[pendingNode] ?? 0),
          0
        ) / pendingInPreviousCluster.length;

      penalty +=
        settings.prematureClusterSwitchPenalty *
          pendingInPreviousCluster.length +
        switchDuration * settings.penaltyMultiplier +
        averagePendingDuration * settings.penaltyMultiplier;
    }
  }

  return penalty;
}

function chooseNextPartition(
  partitions: Array<ReturnType<typeof partitionStopsForOptimization>[number]>,
  currentLocation: Location
) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  partitions.forEach((partition, index) => {
    const distance = calculateDistance(currentLocation, partition.centroid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

async function optimizePartitionedRouteWithRoadMetrics(
  locations: Location[],
  mode: RouteMode,
  options: RouteOptimizationOptions = {}
): Promise<OptimizedRoute | null> {
  const maxPartitionSize = getRoadMatrixPartitionSize(options);
  const partitions = partitionStopsForOptimization(locations, {
    ...options,
    maxPartitionSize,
  });

  if (partitions.length <= 1) return null;

  const remaining = [...partitions];
  const largestPartitionSize = Math.max(
    0,
    ...partitions.map(partition => partition.stops.length)
  );
  const finalSequence: number[] = [];
  const finalWaypoints: OptimizedRoute["waypoints"] = [];
  let totalDistance = 0;
  let totalTime = 0;
  let currentLocation = options.startLocation ?? remaining[0].centroid;

  while (remaining.length > 0) {
    const partitionIndex = chooseNextPartition(remaining, currentLocation);
    const [partition] = remaining.splice(partitionIndex, 1);
    const isLastPartition = remaining.length === 0;
    const partitionLocations = partition.stops.map(
      ({ originalIndex, ...stop }) => stop
    );

    const optimizedPartition = await optimizeRouteWithRoadMetrics(
      partitionLocations,
      mode,
      0,
      {
        ...options,
        startLocation: currentLocation,
        endLocation: isLastPartition ? options.endLocation : undefined,
        partitionLargeRoutes: false,
      }
    );
    if (!optimizedPartition) return null;

    totalDistance += optimizedPartition.totalDistance;
    totalTime += optimizedPartition.totalTime;

    for (const localIndex of optimizedPartition.sequence) {
      const originalStop = partition.stops[localIndex];
      if (!originalStop) return null;
      finalSequence.push(originalStop.originalIndex);
      const { originalIndex, ...waypoint } = originalStop;
      finalWaypoints.push({
        ...waypoint,
        sequence: finalWaypoints.length,
      });
    }

    const lastWaypoint = finalWaypoints[finalWaypoints.length - 1];
    if (lastWaypoint) currentLocation = lastWaypoint;
  }

  return {
    sequence: finalSequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime: Math.round(totalTime),
    waypoints: finalWaypoints,
    metadata: {
      partitioned: true,
      partitionCount: partitions.length,
      maxPartitionSize,
      largestPartitionSize,
    },
  };
}

export async function buildSequentialRouteWithRoadMetrics(
  locations: Location[],
  options: RouteOptimizationOptions = {}
): Promise<OptimizedRoute | null> {
  const result = await fetchRoadMatrix(locations, options);
  if (!result) return null;

  const deliveryNodeIndexes = result.matrix.nodes
    .map((node, nodeIndex) => (node.role === "delivery" ? nodeIndex : -1))
    .filter(nodeIndex => nodeIndex >= 0);

  return buildRoadRoute(
    result.matrix,
    deliveryNodeIndexes,
    result.startNodeIndex,
    result.endNodeIndex
  );
}

export async function optimizeRouteWithRoadMetrics(
  locations: Location[],
  mode: RouteMode = "balanced",
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
): Promise<OptimizedRoute | null> {
  const partitions =
    options.partitionLargeRoutes !== false && locations.length > 100
      ? partitionStopsForOptimization(locations, {
          ...options,
          maxPartitionSize: getRoadMatrixPartitionSize(options),
        })
      : [];
  if (
    options.partitionLargeRoutes !== false &&
    locations.length > 100 &&
    partitions.length > 1
  ) {
    return optimizePartitionedRouteWithRoadMetrics(locations, mode, options);
  }

  const result = await fetchRoadMatrix(locations, options);
  if (!result) return null;

  const deliveryNodeIndexes = result.matrix.nodes
    .map((node, nodeIndex) => (node.role === "delivery" ? nodeIndex : -1))
    .filter(nodeIndex => nodeIndex >= 0);
  const objective = chooseObjective(mode);
  const clusteredSequence = buildClusteredDeliveryNodeSequence(
    locations,
    deliveryNodeIndexes,
    options
  );
  const startCandidates =
    result.startNodeIndex !== undefined || deliveryNodeIndexes.length > 40
      ? [
          Math.min(
            Math.max(startIndex, 0),
            Math.max(deliveryNodeIndexes.length - 1, 0)
          ),
        ]
      : deliveryNodeIndexes.map((_, index) => index);

  let bestSequence: number[] | null = null;
  let bestScore = Infinity;

  for (const candidateStartIndex of startCandidates) {
    const nearestSequence = buildNearestSequence(
      result.matrix,
      deliveryNodeIndexes,
      candidateStartIndex,
      objective,
      result.startNodeIndex
    );
    const seedSequences = [
      nearestSequence,
      ...(clusteredSequence ? [clusteredSequence] : []),
      deliveryNodeIndexes,
      [...deliveryNodeIndexes].reverse(),
    ];

    for (const seedSequence of seedSequences) {
      const improved = improveSequenceWithTwoOpt(
        result.matrix,
        seedSequence,
        objective,
        result.startNodeIndex,
        result.endNodeIndex
      );
      const candidateSequences = [
        seedSequence,
        improved,
        enforceLocalNearestRoadSequence(
          result.matrix,
          improved,
          objective,
          result.startNodeIndex,
          options.localityMode
        ),
      ];

      for (const candidateSequence of candidateSequences) {
        const metric = calculateSequenceObjective(
          result.matrix,
          candidateSequence,
          objective,
          result.startNodeIndex,
          result.endNodeIndex
        );
        const penalty =
          calculateAvoidableJumpPenalty(
            result.matrix,
            candidateSequence,
            objective,
            result.startNodeIndex,
            options.localityMode
          ) +
          calculateClusterSwitchPenalty(
            result.matrix,
            locations,
            candidateSequence,
            options.localityMode
          );
        const score = metric + penalty;

        if (score < bestScore) {
          bestScore = score;
          bestSequence = candidateSequence;
        }
      }
    }
  }

  return buildRoadRoute(
    result.matrix,
    bestSequence ?? deliveryNodeIndexes,
    result.startNodeIndex,
    result.endNodeIndex
  );
}
