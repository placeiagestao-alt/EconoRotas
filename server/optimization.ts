/**
 * Route optimization algorithms for open delivery routes.
 * Builds nearest-neighbor candidates and improves them with 2-opt.
 */

import {
  calculateObjectiveCost,
  chooseObjective,
  type RouteMode,
  type RouteObjective,
} from "./routeObjective";
import type { StopMetadata, StopSourceProvider } from "../shared/stopMetadata";

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  notes?: string;
  geocodingConfidenceScore?: number;
  geocodingMethod?: string;
  geocodingSuspect?: boolean;
  sourceProvider?: StopSourceProvider | string | null;
  originalStop?: number | null;
  isUnsequencedStop?: boolean | null;
  metadata?: StopMetadata | null;
  commercialDetectionStatus?: "unknown" | "suspected" | "confirmed";
  commercialConfidence?: number;
  commercialPlaceName?: string | null;
  commercialCategory?: string | null;
  commercialOpeningHours?: string | null;
  commercialSource?: string | null;
  commercialLastCheckedAt?: Date | string | null;
}

export interface OptimizedRoute {
  sequence: number[];
  totalDistance: number;
  totalTime: number;
  waypoints: Array<Location & { sequence: number }>;
  metadata?: {
    partitioned?: boolean;
    partitionCount?: number;
    maxPartitionSize?: number;
    largestPartitionSize?: number;
  };
}

export interface RouteOptimizationOptions {
  startLocation?: Location;
  endLocation?: Location;
  localityMode?: "balanced" | "local" | "strict";
  partitionLargeRoutes?: boolean;
  maxPartitionSize?: number;
  forceMicrocluster?: boolean;
  telemetry?: {
    recordOsrmCall?: (durationMs: number, success: boolean) => void;
    recordOsrmMatrix?: (args: {
      nodeCount: number;
      durationMs: number;
      cacheHit: boolean;
      success: boolean;
      failureReason?: string | null;
      provider?: string | null;
    }) => void;
  };
}

export type StopCluster = {
  clusterId: number;
  stops: Array<Location & { originalIndex: number }>;
  centroid: Location;
};

export type RoutePartition = StopCluster & {
  sourceClusterId: number;
};

type RouteLeg = {
  from: Location;
  to: Location;
};

type LocalitySettings = {
  immediateRadiusKm: number;
  immediateExtraKmThreshold: number;
  localRadiusKm: number;
  ratioThreshold: number;
  extraKmThreshold: number;
  longJumpThresholdKm: number;
  penaltyMultiplier: number;
  clusterRadiusKm: number;
  clusterRevisitPenaltyKm: number;
  prematureClusterSwitchPenalty: number;
};

function getLocalitySettings(
  localityMode: RouteOptimizationOptions["localityMode"] = "local"
): LocalitySettings {
  if (localityMode === "strict") {
    return {
      immediateRadiusKm: 0.25,
      immediateExtraKmThreshold: 0.03,
      localRadiusKm: 2.5,
      ratioThreshold: 1.12,
      extraKmThreshold: 0.08,
      longJumpThresholdKm: 0.35,
      penaltyMultiplier: 4,
      clusterRadiusKm: 0.45,
      clusterRevisitPenaltyKm: 8,
      prematureClusterSwitchPenalty: 18,
    };
  }

  if (localityMode === "balanced") {
    return {
      immediateRadiusKm: 0.08,
      immediateExtraKmThreshold: 0.08,
      localRadiusKm: 1.5,
      ratioThreshold: 1.55,
      extraKmThreshold: 0.35,
      longJumpThresholdKm: 1.25,
      penaltyMultiplier: 2,
      clusterRadiusKm: 0.9,
      clusterRevisitPenaltyKm: 4,
      prematureClusterSwitchPenalty: 8,
    };
  }

  return {
    immediateRadiusKm: 0.12,
    immediateExtraKmThreshold: 0.05,
    localRadiusKm: 2,
    ratioThreshold: 1.28,
    extraKmThreshold: 0.18,
    longJumpThresholdKm: 0.7,
    penaltyMultiplier: 3,
    clusterRadiusKm: 0.65,
    clusterRevisitPenaltyKm: 6,
    prematureClusterSwitchPenalty: 12,
  };
}

function isAvoidableLocalJump(
  nearestDistance: number,
  plannedDistance: number,
  settings: LocalitySettings
) {
  if (
    nearestDistance <= settings.immediateRadiusKm &&
    plannedDistance - nearestDistance >= settings.immediateExtraKmThreshold
  ) {
    return true;
  }

  const significantlyCloser =
    plannedDistance >
    Math.max(
      nearestDistance * settings.ratioThreshold,
      nearestDistance + settings.extraKmThreshold
    );
  const nearbyContext =
    nearestDistance <= settings.localRadiusKm ||
    plannedDistance <= settings.localRadiusKm * 2.5;
  const longJump = plannedDistance - nearestDistance >= settings.longJumpThresholdKm;

  return significantlyCloser && (nearbyContext || longJump);
}

/**
 * Calculate great-circle distance between two points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(loc2.latitude - loc1.latitude);
  const dLon = toRad(loc2.longitude - loc1.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.latitude)) *
      Math.cos(toRad(loc2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Estimate travel time between two locations
 * Assumes average speed of 40 km/h in urban areas, 60 km/h in highways
 * Returns time in minutes
 */
export function estimateTravelTime(distance: number): number {
  // Average speed: 40 km/h urban, 60 km/h highway
  // Weighted average: 50 km/h
  const avgSpeed = 50;
  return Math.round((distance / avgSpeed) * 60);
}

function buildRouteLegs(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
): RouteLeg[] {
  const legs: RouteLeg[] = [];

  if (sequence.length === 0) {
    if (options.startLocation && options.endLocation) {
      legs.push({ from: options.startLocation, to: options.endLocation });
    }
    return legs;
  }

  if (options.startLocation) {
    legs.push({ from: options.startLocation, to: locations[sequence[0]] });
  }

  for (let i = 0; i < sequence.length - 1; i++) {
    legs.push({
      from: locations[sequence[i]],
      to: locations[sequence[i + 1]],
    });
  }

  if (options.endLocation) {
    legs.push({
      from: locations[sequence[sequence.length - 1]],
      to: options.endLocation,
    });
  }

  return legs;
}

function calculateSequenceDistance(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
) {
  return calculateSequenceTotals(locations, sequence, options).distanceKm;
}

function calculateSequenceTime(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
) {
  return calculateSequenceTotals(locations, sequence, options).durationMin;
}

function calculateSequenceTotals(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
) {
  return buildRouteLegs(locations, sequence, options).reduce(
    (totals, leg) => {
      const distance = calculateDistance(leg.from, leg.to);
      totals.distanceKm += distance;
      totals.durationMin += estimateTravelTime(distance);
      return totals;
    },
    { distanceKm: 0, durationMin: 0 }
  );
}

function calculateSequenceObjective(
  locations: Location[],
  sequence: number[],
  objective: RouteObjective,
  options: RouteOptimizationOptions = {}
) {
  const { distanceKm, durationMin } = calculateSequenceTotals(
    locations,
    sequence,
    options
  );
  return calculateObjectiveCost(distanceKm, durationMin, objective);
}

function buildOptimizedRoute(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
): OptimizedRoute {
  const totals = calculateSequenceTotals(locations, sequence, options);

  return {
    sequence,
    totalDistance: Math.round(totals.distanceKm * 100) / 100,
    totalTime: totals.durationMin,
    waypoints: sequence.map((idx, seq) => ({
      ...locations[idx],
      sequence: seq,
    })),
  };
}

function centroidForIndexes(locations: Location[], indexes: number[]): Location {
  const latitude =
    indexes.reduce((total, index) => total + locations[index].latitude, 0) /
    indexes.length;
  const longitude =
    indexes.reduce((total, index) => total + locations[index].longitude, 0) /
    indexes.length;

  return { latitude, longitude };
}

function regionQuery(locations: Location[], originIndex: number, radiusKm: number) {
  return locations
    .map((_, index) => index)
    .filter((index) => calculateDistance(locations[originIndex], locations[index]) <= radiusKm);
}

function dbscanLocationIndexes(
  locations: Location[],
  radiusKm: number,
  minPoints: number
) {
  const labels = new Array<number | undefined>(locations.length);
  const visited = new Array(locations.length).fill(false);
  let clusterId = 0;

  for (let pointIndex = 0; pointIndex < locations.length; pointIndex += 1) {
    if (visited[pointIndex]) continue;
    visited[pointIndex] = true;

    const neighbors = regionQuery(locations, pointIndex, radiusKm);
    if (neighbors.length < minPoints) {
      labels[pointIndex] = -1;
      continue;
    }

    labels[pointIndex] = clusterId;
    const seeds = [...neighbors.filter((index) => index !== pointIndex)];

    while (seeds.length > 0) {
      const candidateIndex = seeds.shift()!;

      if (!visited[candidateIndex]) {
        visited[candidateIndex] = true;
        const candidateNeighbors = regionQuery(locations, candidateIndex, radiusKm);
        if (candidateNeighbors.length >= minPoints) {
          for (const neighborIndex of candidateNeighbors) {
            if (!seeds.includes(neighborIndex)) {
              seeds.push(neighborIndex);
            }
          }
        }
      }

      if (labels[candidateIndex] === undefined || labels[candidateIndex] === -1) {
        labels[candidateIndex] = clusterId;
      }
    }

    clusterId += 1;
  }

  return labels.map((label, index) => (label === undefined ? -1000 - index : label));
}

export function clusterStops(
  stops: Location[],
  options: RouteOptimizationOptions = {}
): StopCluster[] {
  if (stops.length === 0) return [];

  const settings = getLocalitySettings(options.localityMode);
  const labels = dbscanLocationIndexes(stops, settings.clusterRadiusKm, 2);
  const grouped = new Map<number, number[]>();

  labels.forEach((label, index) => {
    const normalizedLabel = label < 0 ? Number.MIN_SAFE_INTEGER + index : label;
    const group = grouped.get(normalizedLabel) ?? [];
    group.push(index);
    grouped.set(normalizedLabel, group);
  });

  return Array.from(grouped.values())
    .sort((a, b) => Math.min(...a) - Math.min(...b))
    .map((indexes, clusterIndex) => ({
      clusterId: clusterIndex + 1,
      centroid: centroidForIndexes(stops, indexes),
      stops: indexes.map((index) => ({
        ...stops[index],
        originalIndex: index,
      })),
    }));
}

function chunkStops(
  cluster: StopCluster,
  maxPartitionSize: number,
  nextClusterId: () => number
): RoutePartition[] {
  if (cluster.stops.length <= maxPartitionSize) {
    return [{
      ...cluster,
      sourceClusterId: cluster.clusterId,
    }];
  }

  const targetPartitionCount = Math.ceil(cluster.stops.length / maxPartitionSize);
  const gridSize = Math.max(2, Math.ceil(Math.sqrt(targetPartitionCount)));
  const latitudes = cluster.stops.map((stop) => stop.latitude);
  const longitudes = cluster.stops.map((stop) => stop.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(0.000001, maxLatitude - minLatitude);
  const longitudeSpan = Math.max(0.000001, maxLongitude - minLongitude);
  const gridGroups = new Map<string, typeof cluster.stops>();

  for (const stop of cluster.stops) {
    const row = Math.min(
      gridSize - 1,
      Math.floor(((stop.latitude - minLatitude) / latitudeSpan) * gridSize)
    );
    const column = Math.min(
      gridSize - 1,
      Math.floor(((stop.longitude - minLongitude) / longitudeSpan) * gridSize)
    );
    const key = `${row}:${column}`;
    const group = gridGroups.get(key) ?? [];
    group.push(stop);
    gridGroups.set(key, group);
  }

  const orderedStops = Array.from(gridGroups.entries())
    .sort(([keyA], [keyB]) => {
      const [rowA, columnA] = keyA.split(":").map(Number);
      const [rowB, columnB] = keyB.split(":").map(Number);
      if (rowA !== rowB) return rowA - rowB;
      return columnA - columnB;
    })
    .flatMap(([, stops]) =>
      [...stops].sort((a, b) => {
        if (a.latitude !== b.latitude) return a.latitude - b.latitude;
        if (a.longitude !== b.longitude) return a.longitude - b.longitude;
        return a.originalIndex - b.originalIndex;
      })
    );
  const chunks: RoutePartition[] = [];

  for (let index = 0; index < orderedStops.length; index += maxPartitionSize) {
    const stopsChunk = orderedStops.slice(index, index + maxPartitionSize);
    chunks.push({
      clusterId: nextClusterId(),
      sourceClusterId: cluster.clusterId,
      centroid: centroidForIndexes(stopsChunk, stopsChunk.map((_, chunkIndex) => chunkIndex)),
      stops: stopsChunk,
    });
  }

  return chunks;
}

function shouldMicrocluster(
  cluster: StopCluster,
  totalStopCount: number,
  maxPartitionSize: number
) {
  if (cluster.stops.length <= maxPartitionSize) return false;
  if (totalStopCount >= 501) return true;
  if (totalStopCount >= 201) return true;

  if (totalStopCount >= 101) {
    const radius = Math.max(
      0,
      ...cluster.stops.map((stop) => calculateDistance(cluster.centroid, stop))
    );
    return cluster.stops.length > 100 || radius > 1.5;
  }

  return false;
}

export function partitionStopsForOptimization(
  stops: Location[],
  options: RouteOptimizationOptions = {}
): RoutePartition[] {
  if (stops.length === 0) return [];

  const defaultPartitionSize = stops.length >= 501 ? 60 : 70;
  const maxPartitionSize = Math.max(10, options.maxPartitionSize ?? defaultPartitionSize);
  const clusters = clusterStops(stops, options);
  let generatedClusterId = clusters.length + 1;
  const nextClusterId = () => generatedClusterId++;
  const partitions = clusters.flatMap((cluster) =>
    options.forceMicrocluster ||
    shouldMicrocluster(cluster, stops.length, maxPartitionSize)
      ? chunkStops(cluster, maxPartitionSize, nextClusterId)
      : [{
          ...cluster,
          sourceClusterId: cluster.clusterId,
        }]
  );

  return partitions.sort((a, b) => {
    const minA = Math.min(...a.stops.map((stop) => stop.originalIndex));
    const minB = Math.min(...b.stops.map((stop) => stop.originalIndex));
    return minA - minB;
  });
}

function buildNearestNeighborSequence(
  locations: Location[],
  startIndex: number,
  objective: RouteObjective = chooseObjective("balanced"),
  options: RouteOptimizationOptions = {}
) {
  const n = locations.length;
  const visited = new Array(n).fill(false);
  const sequence: number[] = [];
  let currentLocation = options.startLocation ?? locations[startIndex];

  if (!options.startLocation) {
    visited[startIndex] = true;
    sequence.push(startIndex);
  }

  while (sequence.length < n) {
    let nearestIndex = -1;
    let nearestMetric = Infinity;

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;

      const distance = calculateDistance(currentLocation, locations[i]);
      const metric = calculateObjectiveCost(
        distance,
        estimateTravelTime(distance),
        objective
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = i;
      }
    }

    if (nearestIndex === -1) break;

    visited[nearestIndex] = true;
    sequence.push(nearestIndex);
    currentLocation = locations[nearestIndex];
  }

  return sequence;
}

function improveSequenceWithTwoOpt(
  locations: Location[],
  initialSequence: number[],
  objective: RouteObjective = chooseObjective("balanced"),
  options: RouteOptimizationOptions = {}
) {
  let sequence = [...initialSequence];
  let bestMetric = calculateSequenceObjective(locations, sequence, objective, options);
  let improved = true;
  let passes = 0;
  const firstMutableIndex = options.startLocation ? 1 : 0;

  while (improved && passes < 8) {
    improved = false;
    passes += 1;

    for (let i = firstMutableIndex; i < sequence.length - 1; i++) {
      for (let k = i + 1; k < sequence.length; k++) {
        const candidate = [
          ...sequence.slice(0, i),
          ...sequence.slice(i, k + 1).reverse(),
          ...sequence.slice(k + 1),
        ];
        const candidateMetric = calculateSequenceObjective(
          locations,
          candidate,
          objective,
          options
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

function buildNearestSequenceForIndexes(
  locations: Location[],
  indexes: number[],
  objective: RouteObjective = chooseObjective("balanced"),
  startLocation?: Location
) {
  const remaining = new Set(indexes);
  const sequence: number[] = [];
  let currentLocation = startLocation ?? locations[indexes[0]];

  if (!startLocation && indexes.length > 0) {
    remaining.delete(indexes[0]);
    sequence.push(indexes[0]);
  }

  while (remaining.size > 0) {
    let nearestIndex = -1;
    let nearestMetric = Infinity;

    for (const candidateIndex of Array.from(remaining)) {
      const distance = calculateDistance(currentLocation, locations[candidateIndex]);
      const metric = calculateObjectiveCost(
        distance,
        estimateTravelTime(distance),
        objective
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }

    if (nearestIndex === -1) break;

    remaining.delete(nearestIndex);
    sequence.push(nearestIndex);
    currentLocation = locations[nearestIndex];
  }

  return sequence;
}

function optimizeClusterStops(
  locations: Location[],
  clusterIndexes: number[],
  objective: RouteObjective = chooseObjective("balanced"),
  startLocation?: Location
) {
  if (clusterIndexes.length <= 2) {
    return buildNearestSequenceForIndexes(
      locations,
      clusterIndexes,
      objective,
      startLocation
    );
  }

  const nearest = buildNearestSequenceForIndexes(
    locations,
    clusterIndexes,
    objective,
    startLocation
  );
  const improved = improveSequenceWithTwoOpt(locations, nearest, objective);

  return improved.filter((index) => clusterIndexes.includes(index));
}

function buildClusteredSequence(
  locations: Location[],
  objective: RouteObjective = chooseObjective("balanced"),
  options: RouteOptimizationOptions = {}
) {
  const clusters = clusterStops(locations, options);
  if (clusters.length <= 1) return null;

  const remainingClusters = new Set(clusters.map((cluster) => cluster.clusterId));
  const sequence: number[] = [];
  let currentLocation = options.startLocation ?? clusters[0].centroid;

  while (remainingClusters.size > 0) {
    let nearestCluster: StopCluster | undefined;
    let nearestDistance = Infinity;

    for (const cluster of clusters) {
      if (!remainingClusters.has(cluster.clusterId)) continue;

      const distance = calculateDistance(currentLocation, cluster.centroid);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCluster = cluster;
      }
    }

    if (!nearestCluster) break;

    const clusterIndexes = nearestCluster.stops.map((stop) => stop.originalIndex);
    const clusterSequence = optimizeClusterStops(
      locations,
      clusterIndexes,
      objective,
      currentLocation
    );

    sequence.push(...clusterSequence);
    remainingClusters.delete(nearestCluster.clusterId);
    currentLocation =
      locations[clusterSequence[clusterSequence.length - 1]] ?? nearestCluster.centroid;
  }

  return sequence.length === locations.length ? sequence : null;
}

function enforceLocalNearestSequence(
  locations: Location[],
  initialSequence: number[],
  options: RouteOptimizationOptions = {}
) {
  const remaining = new Set(initialSequence);
  const sequence: number[] = [];
  let currentLocation = options.startLocation ?? locations[initialSequence[0]];
  const localitySettings = getLocalitySettings(options.localityMode);

  while (remaining.size > 0) {
    const plannedNext = initialSequence.find((index) => remaining.has(index));
    if (plannedNext === undefined) break;

    let nearestIndex = plannedNext;
    let nearestDistance = calculateDistance(currentLocation, locations[plannedNext]);

    for (const candidateIndex of Array.from(remaining)) {
      const distance = calculateDistance(currentLocation, locations[candidateIndex]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = candidateIndex;
      }
    }

    const plannedDistance = calculateDistance(currentLocation, locations[plannedNext]);
    const jumpIsOperationallyBad =
      nearestIndex !== plannedNext &&
      isAvoidableLocalJump(nearestDistance, plannedDistance, localitySettings);
    const nextIndex = jumpIsOperationallyBad ? nearestIndex : plannedNext;

    remaining.delete(nextIndex);
    sequence.push(nextIndex);
    currentLocation = locations[nextIndex];
  }

  return sequence;
}

function calculateAvoidableJumpPenalty(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
) {
  const settings = getLocalitySettings(options.localityMode);
  const remaining = new Set(sequence);
  let currentLocation = options.startLocation ?? locations[sequence[0]];
  let penalty = 0;

  for (const plannedNext of sequence) {
    remaining.delete(plannedNext);
    const plannedDistance = calculateDistance(currentLocation, locations[plannedNext]);
    let nearestDistance = plannedDistance;

    for (const candidateIndex of [plannedNext, ...Array.from(remaining)]) {
      const distance = calculateDistance(currentLocation, locations[candidateIndex]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    if (isAvoidableLocalJump(nearestDistance, plannedDistance, settings)) {
      penalty += (plannedDistance - nearestDistance) * settings.penaltyMultiplier;
    }

    currentLocation = locations[plannedNext];
  }

  return penalty;
}

function calculateClusterRevisitPenalty(
  locations: Location[],
  sequence: number[],
  options: RouteOptimizationOptions = {}
) {
  const settings = getLocalitySettings(options.localityMode);
  const clusters = clusterStops(locations, options);
  if (clusters.length <= 1) return 0;

  const clusterByStopIndex = new Map<number, number>();
  for (const cluster of clusters) {
    if (cluster.stops.length < 2) continue;
    for (const stop of cluster.stops) {
      clusterByStopIndex.set(stop.originalIndex, cluster.clusterId);
    }
  }

  const closedClusters = new Set<number>();
  let activeCluster: number | undefined;
  let penalty = 0;

  for (let sequenceIndex = 0; sequenceIndex < sequence.length; sequenceIndex += 1) {
    const stopIndex = sequence[sequenceIndex];
    const clusterId = clusterByStopIndex.get(stopIndex);
    if (!clusterId) {
      activeCluster = undefined;
      continue;
    }

    if (activeCluster !== undefined && activeCluster !== clusterId) {
      const pendingInPreviousCluster = sequence
        .slice(sequenceIndex + 1)
        .filter((laterStopIndex) => clusterByStopIndex.get(laterStopIndex) === activeCluster);
      if (pendingInPreviousCluster.length > 0) {
        const switchDistance = calculateDistance(
          locations[sequence[sequenceIndex - 1]],
          locations[stopIndex]
        );
        const averagePendingDistance =
          pendingInPreviousCluster.reduce(
            (total, laterStopIndex) =>
              total + calculateDistance(locations[sequence[sequenceIndex - 1]], locations[laterStopIndex]),
            0
          ) / pendingInPreviousCluster.length;

        penalty +=
          settings.prematureClusterSwitchPenalty * pendingInPreviousCluster.length +
          switchDistance * settings.penaltyMultiplier +
          averagePendingDistance * settings.penaltyMultiplier;
      }
      closedClusters.add(activeCluster);
    }

    if (closedClusters.has(clusterId) && activeCluster !== clusterId) {
      penalty += settings.clusterRevisitPenaltyKm;
    }

    activeCluster = clusterId;
  }

  return penalty;
}

function calculateDriverFriendlyScore(
  locations: Location[],
  sequence: number[],
  objective: RouteObjective = chooseObjective("balanced"),
  options: RouteOptimizationOptions = {}
) {
  return (
    calculateSequenceObjective(locations, sequence, objective, options) +
    calculateAvoidableJumpPenalty(locations, sequence, options) +
    calculateClusterRevisitPenalty(locations, sequence, options)
  );
}

function chooseNextGeographicPartition(
  partitions: RoutePartition[],
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

function optimizePartitionedOpenRoute(
  locations: Location[],
  mode: RouteMode = "balanced",
  options: RouteOptimizationOptions = {}
): OptimizedRoute | null {
  const partitions = partitionStopsForOptimization(locations, {
    ...options,
    maxPartitionSize: options.maxPartitionSize ?? 70,
  });
  if (partitions.length <= 1) return null;

  const remaining = [...partitions];
  const largestPartitionSize = Math.max(
    0,
    ...partitions.map((partition) => partition.stops.length)
  );
  const finalSequence: number[] = [];
  const finalWaypoints: OptimizedRoute["waypoints"] = [];
  let totalDistance = 0;
  let totalTime = 0;
  let currentLocation = options.startLocation ?? remaining[0].centroid;

  while (remaining.length > 0) {
    const partitionIndex = chooseNextGeographicPartition(remaining, currentLocation);
    const [partition] = remaining.splice(partitionIndex, 1);
    const isLastPartition = remaining.length === 0;
    const partitionLocations = partition.stops.map(({ originalIndex, ...stop }) => stop);
    const optimizedPartition = optimizeOpenRoute(partitionLocations, mode, 0, {
      ...options,
      startLocation: currentLocation,
      endLocation: isLastPartition ? options.endLocation : undefined,
      partitionLargeRoutes: false,
    });

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
      maxPartitionSize: options.maxPartitionSize ?? 70,
      largestPartitionSize,
    },
  };
}

function optimizeOpenRoute(
  locations: Location[],
  mode: RouteMode = "balanced",
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
) {
  if (locations.length === 0) {
    return buildOptimizedRoute(locations, [], options);
  }

  if (options.partitionLargeRoutes !== false && locations.length > 120) {
    const partitioned = optimizePartitionedOpenRoute(locations, mode, options);
    if (partitioned) return partitioned;
  }

  const startIndexes = options.startLocation
    ? [0]
    : locations.length > 40
      ? [startIndex]
      : locations.map((_, index) => index);
  const uniqueStartIndexes = Array.from(new Set([startIndex, ...startIndexes]))
    .filter((index) => index >= 0 && index < locations.length);

  let bestSequence: number[] | null = null;
  let bestScore = Infinity;
  const objective = chooseObjective(mode);

  for (const candidateStartIndex of uniqueStartIndexes) {
    const nearestSequence = buildNearestNeighborSequence(
      locations,
      candidateStartIndex,
      objective,
      options
    );
    const inputSequence = locations.map((_, index) => index);
    const clusteredSequence = buildClusteredSequence(locations, objective, options);
    const seedSequences = [
      nearestSequence,
      ...(clusteredSequence ? [clusteredSequence] : []),
      inputSequence,
      [...inputSequence].reverse(),
    ];

    for (const seedSequence of seedSequences) {
      const improvedSequence = improveSequenceWithTwoOpt(
        locations,
        seedSequence,
        objective,
        options
      );
      const candidateSequences = [
        seedSequence,
        improvedSequence,
        enforceLocalNearestSequence(locations, improvedSequence, options),
      ];

      for (const candidateSequence of candidateSequences) {
        const score = calculateDriverFriendlyScore(
          locations,
          candidateSequence,
          objective,
          options
        );

        if (score < bestScore) {
          bestScore = score;
          bestSequence = candidateSequence;
        }
      }
    }
  }

  return buildOptimizedRoute(locations, bestSequence ?? [], options);
}

/**
 * Nearest Neighbor algorithm for TSP optimization
 * Starts from the first location and greedily selects the nearest unvisited location
 * Time complexity: O(n²)
 * Good for moderate number of stops (< 100)
 */
export function optimizeRouteNearestNeighbor(
  locations: Location[],
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
): OptimizedRoute {
  if (locations.length === 0) {
    if (options.startLocation && options.endLocation) {
      const distance = calculateDistance(options.startLocation, options.endLocation);
      return {
        sequence: [],
        totalDistance: Math.round(distance * 100) / 100,
        totalTime: estimateTravelTime(distance),
        waypoints: [],
      };
    }

    return {
      sequence: [],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [],
    };
  }

  if (options.startLocation || options.endLocation) {
    const sequence = buildNearestNeighborSequence(
      locations,
      startIndex,
      chooseObjective("balanced"),
      options
    );
    return buildOptimizedRoute(locations, sequence, options);
  }

  if (locations.length === 1) {
    return {
      sequence: [0],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [{ ...locations[0], sequence: 0 }],
    };
  }

  const n = locations.length;
  const visited = new Array(n).fill(false);
  const sequence: number[] = [];
  let currentIndex = startIndex;
  let totalDistance = 0;
  let totalTime = 0;

  visited[currentIndex] = true;
  sequence.push(currentIndex);

  for (let i = 1; i < n; i++) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    // Find nearest unvisited location
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        const distance = calculateDistance(locations[currentIndex], locations[j]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = j;
        }
      }
    }

    if (nearestIndex !== -1) {
      visited[nearestIndex] = true;
      sequence.push(nearestIndex);
      totalDistance += nearestDistance;
      totalTime += estimateTravelTime(nearestDistance);
      currentIndex = nearestIndex;
    }
  }

  // Build waypoints with sequence information
  const waypoints = sequence.map((idx, seq) => ({
    ...locations[idx],
    sequence: seq,
  }));

  return {
    sequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime,
    waypoints,
  };
}

/**
 * Optimize route based on mode
 * - shortest_distance: Minimize total distance
 * - shortest_time: Minimize total time (currently same as distance)
 * - balanced: Balance between distance and time
 */
export function optimizeRoute(
  locations: Location[],
  mode: RouteMode = "balanced",
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
): OptimizedRoute {
  return optimizeOpenRoute(locations, mode, startIndex, options);
}

/**
 * Calculate total distance for a given sequence
 */
export function calculateTotalDistance(locations: Location[], sequence: number[]): number {
  let total = 0;
  for (let i = 0; i < sequence.length - 1; i++) {
    total += calculateDistance(locations[sequence[i]], locations[sequence[i + 1]]);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculate total time for a given sequence
 */
export function calculateTotalTime(locations: Location[], sequence: number[]): number {
  let total = 0;
  for (let i = 0; i < sequence.length - 1; i++) {
    const distance = calculateDistance(locations[sequence[i]], locations[sequence[i + 1]]);
    total += estimateTravelTime(distance);
  }
  return total;
}

/**
 * Validate locations for optimization
 */
export function validateLocations(locations: Location[]): { valid: boolean; error?: string } {
  if (!locations || locations.length === 0) {
    return { valid: false, error: "No locations provided" };
  }

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") {
      return { valid: false, error: `Invalid coordinates at location ${i}` };
    }
    if (loc.latitude < -90 || loc.latitude > 90) {
      return { valid: false, error: `Invalid latitude at location ${i}` };
    }
    if (loc.longitude < -180 || loc.longitude > 180) {
      return { valid: false, error: `Invalid longitude at location ${i}` };
    }
  }

  return { valid: true };
}
