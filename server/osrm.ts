import { ENV } from "./_core/env";
import {
  clusterStops,
  type Location,
  type OptimizedRoute,
  type RouteOptimizationOptions,
} from "./optimization";

type MatrixValue = number[][];
type MatrixMode = "distance" | "duration";

type OsrmTableResponse = {
  code: string;
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
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

type LocalitySettings = {
  immediateRadius: number;
  immediateExtraThreshold: number;
  localRadius: number;
  ratioThreshold: number;
  extraThreshold: number;
  longJumpThreshold: number;
  penaltyMultiplier: number;
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

function buildNodes(locations: Location[], options: RouteOptimizationOptions = {}) {
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
  const coordinates = nodes
    .map(({ location }) => `${location.longitude},${location.latitude}`)
    .join(";");
  return `${baseUrl}/table/v1/driving/${coordinates}?annotations=duration,distance`;
}

function normalizeMatrix(
  values: Array<Array<number | null>> | undefined,
  factor: number
): MatrixValue | null {
  if (!values?.length) return null;

  const normalized = values.map((row) =>
    row.map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value / factor : Infinity
    )
  );

  return normalized.some((row) => row.some((value) => !Number.isFinite(value)))
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
  if (!ENV.osrmEnabled || locations.length === 0) return null;

  const { nodes, startNodeIndex, endNodeIndex } = buildNodes(locations, options);
  if (nodes.length < 2 || nodes.some((node) => !isValidCoordinate(node.location))) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENV.osrmRequestTimeoutMs);

  try {
    const response = await fetch(buildOsrmTableUrl(nodes), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as OsrmTableResponse;
    if (data.code !== "Ok") return null;

    const distancesKm = normalizeMatrix(data.distances, 1000);
    const durationsMinutes = normalizeMatrix(data.durations, 60);
    if (!distancesKm || !durationsMinutes) return null;

    return {
      matrix: { nodes, distancesKm, durationsMinutes },
      startNodeIndex,
      endNodeIndex,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getMetric(matrix: RoadMatrix, mode: MatrixMode, from: number, to: number) {
  return mode === "duration"
    ? matrix.durationsMinutes[from][to]
    : matrix.distancesKm[from][to];
}

function calculateSequenceMetric(
  matrix: RoadMatrix,
  sequence: number[],
  mode: MatrixMode,
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
    total += getMetric(matrix, mode, sequence[sequence.length - 1], endNodeIndex);
  }

  return total;
}

function buildRoadRoute(
  matrix: RoadMatrix,
  sequence: number[],
  startNodeIndex?: number,
  endNodeIndex?: number
): OptimizedRoute {
  return {
    sequence: sequence.map((nodeIndex) => matrix.nodes[nodeIndex].deliveryIndex ?? nodeIndex),
    totalDistance:
      Math.round(
        calculateSequenceMetric(matrix, sequence, "distance", startNodeIndex, endNodeIndex) * 100
      ) / 100,
    totalTime: Math.round(
      calculateSequenceMetric(matrix, sequence, "duration", startNodeIndex, endNodeIndex)
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
  objective: MatrixMode,
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
      const metric = getMetric(matrix, objective, currentNodeIndex, candidateIndex);
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
  objective: MatrixMode,
  startNodeIndex?: number,
  endNodeIndex?: number
) {
  let sequence = [...initialSequence];
  let bestMetric = calculateSequenceMetric(
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
        const candidateMetric = calculateSequenceMetric(
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
  objective: MatrixMode,
  startNodeIndex?: number,
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
) {
  const remaining = new Set(initialSequence);
  const sequence: number[] = [];
  let currentNodeIndex = startNodeIndex ?? initialSequence[0];
  const localitySettings = getLocalitySettings(localityMode);

  while (remaining.size > 0) {
    const plannedNext = initialSequence.find((nodeIndex) => remaining.has(nodeIndex));
    if (plannedNext === undefined) break;

    let nearestIndex = plannedNext;
    let nearestMetric = getMetric(matrix, objective, currentNodeIndex, plannedNext);

    for (const candidateIndex of Array.from(remaining)) {
      const metric = getMetric(matrix, objective, currentNodeIndex, candidateIndex);
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }

    const plannedMetric = getMetric(matrix, objective, currentNodeIndex, plannedNext);
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
  objective: MatrixMode,
  startNodeIndex?: number,
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
) {
  const settings = getLocalitySettings(localityMode);
  const remaining = new Set(sequence);
  let currentNodeIndex = startNodeIndex ?? sequence[0];
  let penalty = 0;

  for (const plannedNext of sequence) {
    remaining.delete(plannedNext);
    const plannedMetric = getMetric(matrix, objective, currentNodeIndex, plannedNext);
    let nearestMetric = plannedMetric;

    for (const candidateIndex of [plannedNext, ...Array.from(remaining)]) {
      const metric = getMetric(matrix, objective, currentNodeIndex, candidateIndex);
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

function chooseObjective(mode: "shortest_distance" | "shortest_time" | "balanced") {
  return mode === "shortest_time" ? "duration" : "distance";
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

  const sequence = clusters.flatMap((cluster) =>
    cluster.stops
      .map((stop) => nodeByDeliveryIndex.get(stop.originalIndex))
      .filter((nodeIndex): nodeIndex is number => nodeIndex !== undefined)
  );

  return sequence.length === deliveryNodeIndexes.length ? sequence : null;
}

export async function buildSequentialRouteWithRoadMetrics(
  locations: Location[],
  options: RouteOptimizationOptions = {}
): Promise<OptimizedRoute | null> {
  const result = await fetchRoadMatrix(locations, options);
  if (!result) return null;

  const deliveryNodeIndexes = result.matrix.nodes
    .map((node, nodeIndex) => (node.role === "delivery" ? nodeIndex : -1))
    .filter((nodeIndex) => nodeIndex >= 0);

  return buildRoadRoute(
    result.matrix,
    deliveryNodeIndexes,
    result.startNodeIndex,
    result.endNodeIndex
  );
}

export async function optimizeRouteWithRoadMetrics(
  locations: Location[],
  mode: "shortest_distance" | "shortest_time" | "balanced" = "balanced",
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
): Promise<OptimizedRoute | null> {
  const result = await fetchRoadMatrix(locations, options);
  if (!result) return null;

  const deliveryNodeIndexes = result.matrix.nodes
    .map((node, nodeIndex) => (node.role === "delivery" ? nodeIndex : -1))
    .filter((nodeIndex) => nodeIndex >= 0);
  const objective = chooseObjective(mode);
  const clusteredSequence = buildClusteredDeliveryNodeSequence(
    locations,
    deliveryNodeIndexes,
    options
  );
  const startCandidates =
    result.startNodeIndex !== undefined || deliveryNodeIndexes.length > 40
      ? [Math.min(Math.max(startIndex, 0), Math.max(deliveryNodeIndexes.length - 1, 0))]
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
        const metric = calculateSequenceMetric(
          result.matrix,
          candidateSequence,
          objective,
          result.startNodeIndex,
          result.endNodeIndex
        );
        const penalty = calculateAvoidableJumpPenalty(
          result.matrix,
          candidateSequence,
          objective,
          result.startNodeIndex,
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
