import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { isAdminEmail } from "./_core/adminAccess";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import {
  buildPasswordOpenId,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "./passwordAuth";
import { sdk } from "./_core/sdk";
import {
  calculateDistance,
  clusterStops,
  estimateTravelTime,
  optimizeRoute,
  partitionStopsForOptimization,
  validateLocations,
  type Location,
  type OptimizedRoute,
} from "./optimization";
import {
  buildSequentialRouteWithRoadMetrics,
  optimizeRouteWithRoadMetrics,
} from "./osrm";
import {
  auditRouteSequence,
  type AuditableStop,
  type RouteAuditReport,
} from "./routeAudit";
import { chatWithLLM, formatChatHistory } from "./chat";
import {
  fetchImileDeliveries,
  getImileConnectionStatus,
  type ImileCredentialOverrides,
} from "./imile";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "./integrationCredentials";
import {
  summarizeGeocodingConfidence,
  type GeocodingMethod,
} from "../shared/geocodingConfidence";
import {
  normalizeStopMetadata,
  normalizeStopSourceProvider,
  parseLegacyStopNotes,
  STOP_SOURCE_PROVIDERS,
} from "../shared/stopMetadata";
import {
  buildCommercialEtaAlert,
  detectCommercialAtLocation,
} from "./commercialDetection";
import {
  enqueueOptimizationJob,
  getOptimizationQueueHealth,
  getOptimizationWorkersDashboard,
  isOptimizationQueueConfigured,
} from "./optimizationQueue";
import { getMultiVehicleReadinessDashboard } from "./multiVehicleReadiness";

const IMILE_PROVIDER = "imile_rider_delivery";
const BLOCKING_AUDIT_ISSUE_TYPES = new Set([
  "missing_coordinates",
  "invalid_coordinates",
]);
const DUPLICATE_COORDINATE_BLOCKING_GROUPS = 3;
const MAX_AUDIT_CORRECTION_ATTEMPTS = 20;
const MAX_NEARBY_FIXES = 100;
const MAX_REVISIT_FIXES = 50;
const MAX_PREMATURE_EXIT_FIXES = 50;
const MAX_BATCH_AUDIT_REPAIR_PASSES = 3;
const OSRM_CIRCUIT_MIN_CALLS = 20;
const OSRM_CIRCUIT_FAILURE_RATE = 0.8;
const SHOPEE_STOP_AUDIT_POLICY = "shopee_stop_preserved";
const ROUTING_STRATEGY_SHOPEE_STOP = "shopee_stop_sequence";
const ROUTING_STRATEGY_OPTIMIZED = "optimized_route";
const STRUCTURAL_AUDIT_ISSUE_TYPES = new Set<RouteAuditReport["issues"][number]["type"]>([
  "missing_coordinates",
  "invalid_coordinates",
  "empty_address",
]);

type RouteOperationalStatus =
  | "optimized"
  | "optimized_attention"
  | "attention_strong"
  | "shopee_stop_sequence"
  | "blocked"
  | "queued";

function getRoutingStrategy(auditPolicy: string | null) {
  return auditPolicy === SHOPEE_STOP_AUDIT_POLICY
    ? ROUTING_STRATEGY_SHOPEE_STOP
    : ROUTING_STRATEGY_OPTIMIZED;
}

function getRouteOperationalOutcome(
  audit: RouteAuditReport | null | undefined,
  auditPolicy: string | null | undefined,
  options: { usedRoadMetrics?: boolean | null } = {}
) {
  const routingStrategy = getRoutingStrategy(auditPolicy ?? null);
  const structuralAuditOnly = auditPolicy === SHOPEE_STOP_AUDIT_POLICY;
  const coherenceAuditSkipped = structuralAuditOnly;
  const remainingCoherenceIssues = audit ? countRemainingCoherenceIssues(audit) : 0;
  const nearbyStopSkippedCount = audit
    ? countAuditIssues(audit, "nearby_stop_skipped")
    : 0;
  const status: RouteOperationalStatus = structuralAuditOnly
    ? "shopee_stop_sequence"
    : audit?.status === "critical"
      ? "blocked"
      : remainingCoherenceIssues > 0 || nearbyStopSkippedCount > 0
        ? "attention_strong"
        : audit?.status === "attention"
          ? "optimized_attention"
          : "optimized";

  return {
    status,
    label:
      status === "shopee_stop_sequence"
        ? "Sequencia STOP Shopee"
        : status === "attention_strong"
          ? "Atencao forte"
          : status === "optimized_attention"
            ? "Otimizada com atencao"
            : status === "blocked"
              ? "Bloqueada pelo fiscal"
              : "Otimizada",
    routingStrategy,
    structuralAuditOnly,
    coherenceAuditSkipped,
    remainingCoherenceIssues,
    nearbyStopSkippedCount,
    routeCrossingCount: audit ? countAuditIssues(audit, "route_crossing") : 0,
    auditStatus: audit?.status ?? null,
    auditScore: audit?.score ?? null,
    auditIssueCount: audit?.issueCount ?? null,
    usedRoadMetrics: options.usedRoadMetrics ?? null,
    commerciallySatisfactory: status === "optimized" || status === "optimized_attention",
    sequenceCoherenceVerified: !coherenceAuditSkipped && remainingCoherenceIssues === 0,
  };
}

function getRouteOperationalOutcomeFromMetadata(
  route: { status?: string },
  metadata: unknown
) {
  const operationalStatus = readStringMetadata(metadata, "operationalStatus");
  const operationalLabel = readStringMetadata(metadata, "operationalStatusLabel");
  const routingStrategy = readStringMetadata(metadata, "routingStrategy");

  if (operationalStatus || routingStrategy) {
    return {
      operationalStatus:
        operationalStatus ??
        (routingStrategy === ROUTING_STRATEGY_SHOPEE_STOP
          ? "shopee_stop_sequence"
          : route.status === "optimized"
            ? "optimized"
            : route.status ?? "draft"),
      operationalStatusLabel:
        operationalLabel ??
        (routingStrategy === ROUTING_STRATEGY_SHOPEE_STOP
          ? "Sequencia STOP Shopee"
          : undefined),
      routingStrategy: routingStrategy ?? null,
      structuralAuditOnly: readBooleanMetadata(metadata, "structuralAuditOnly") ?? false,
      coherenceAuditSkipped:
        readBooleanMetadata(metadata, "coherenceAuditSkipped") ?? false,
      commerciallySatisfactory:
        readBooleanMetadata(metadata, "commerciallySatisfactory") ?? null,
      sequenceCoherenceVerified:
        readBooleanMetadata(metadata, "sequenceCoherenceVerified") ?? null,
    };
  }

  return {
    operationalStatus: route.status ?? "draft",
    operationalStatusLabel: undefined,
    routingStrategy: null,
    structuralAuditOnly: false,
    coherenceAuditSkipped: false,
    commerciallySatisfactory: null,
    sequenceCoherenceVerified: null,
  };
}

type CoherenceFixIssueType =
  | "nearby_stop_skipped"
  | "region_revisited"
  | "premature_region_exit";

const imileCredentialInput = z.object({
  label: z.string().max(255).optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
  fallbackBaseUrls: z.string().optional(),
  deliveriesPath: z.string().max(500).optional(),
  authHeader: z.string().max(128).optional(),
  authToken: z.string().optional().default(""),
  country: z.string().max(16).optional(),
  lang: z.string().max(32).optional(),
  resourceCode: z.string().max(64).optional(),
  timezone: z.string().max(64).optional(),
  hubCode: z.string().max(128).optional(),
  appVersion: z.string().max(32).optional(),
  sourceName: z.string().max(128).optional(),
});

function cleanText(value: string | null | undefined) {
  const text = value?.trim();
  return text || undefined;
}

async function getUserImileOverrides(userId: number): Promise<ImileCredentialOverrides | undefined> {
  const integration = await db.getUserIntegration(userId, IMILE_PROVIDER);
  if (!integration) return undefined;

  return {
    baseUrl: cleanText(integration.baseUrl),
    fallbackBaseUrls: cleanText(integration.fallbackBaseUrls),
    deliveriesPath: cleanText(integration.deliveriesPath),
    authHeader: cleanText(integration.authHeader),
    authToken: decryptIntegrationSecret(integration.authTokenEncrypted),
    country: cleanText(integration.country),
    lang: cleanText(integration.lang),
    resourceCode: cleanText(integration.resourceCode),
    timezone: cleanText(integration.timezone),
    hubCode: cleanText(integration.hubCode),
    appVersion: cleanText(integration.appVersion),
    sourceName: cleanText(integration.sourceName),
  };
}

function toOptionalLocation(
  address: unknown,
  latitudeValue: unknown,
  longitudeValue: unknown
): Location | undefined {
  const normalizedAddress = typeof address === "string" ? address.trim() : "";
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  // Persisted defaults (empty address + 0/0) should mean "no endpoint configured".
  if (!normalizedAddress && latitude === 0 && longitude === 0) {
    return undefined;
  }

  return {
    address: normalizedAddress || undefined,
    latitude,
    longitude,
  };
}

function hasMissingCoordinates(location: Location) {
  return location.latitude === 0 && location.longitude === 0;
}

function buildSequentialRoute(
  locations: Location[],
  options: { startLocation?: Location; endLocation?: Location } = {}
): OptimizedRoute {
  const waypoints = locations.map((location, index) => ({
    ...location,
    sequence: index,
  }));

  if (waypoints.length === 0) {
    return {
      sequence: [],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [],
    };
  }

  let totalDistance = 0;
  let totalTime = 0;

  if (options.startLocation) {
    const firstSegmentDistance = calculateDistance(options.startLocation, waypoints[0]);
    totalDistance += firstSegmentDistance;
    totalTime += estimateTravelTime(firstSegmentDistance);
  }

  for (let index = 0; index < waypoints.length - 1; index++) {
    const current = waypoints[index];
    const next = waypoints[index + 1];
    const segmentDistance = calculateDistance(current, next);
    totalDistance += segmentDistance;
    totalTime += estimateTravelTime(segmentDistance);
  }

  if (options.endLocation) {
    const lastSegmentDistance = calculateDistance(
      waypoints[waypoints.length - 1],
      options.endLocation
    );
    totalDistance += lastSegmentDistance;
    totalTime += estimateTravelTime(lastSegmentDistance);
  }

  return {
    sequence: waypoints.map((_, index) => index),
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime,
    waypoints,
  };
}

function routeToAuditableStops(route: OptimizedRoute): AuditableStop[] {
  return route.waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
    sequence: waypoint.sequence,
    geocodingConfidenceScore: waypoint.geocodingConfidenceScore,
    geocodingMethod: waypoint.geocodingMethod,
    geocodingSuspect: waypoint.geocodingSuspect,
  }));
}

function parseAuditCoordinate(value: unknown) {
  return value === null || value === undefined ? Number.NaN : parseFloat(String(value));
}

function routeStopsToAuditableStops(routeStops: any[]): AuditableStop[] {
  return routeStops.map((stop: any) => ({
    id: Number(stop.id),
    latitude: parseAuditCoordinate(stop.latitude),
    longitude: parseAuditCoordinate(stop.longitude),
    address: stop.address,
    notes: stop.notes ?? undefined,
    sequence: Number(stop.sequence),
    geocodingConfidenceScore: Number(stop.geocodingConfidenceScore ?? 0),
    geocodingMethod: stop.geocodingMethod ?? undefined,
    geocodingSuspect: Boolean(stop.geocodingSuspect),
  }));
}

function isShopeeStopPreservedRoute(
  routeStops: Array<{
    sourceProvider?: unknown;
    originalStop?: unknown;
    isUnsequencedStop?: unknown;
    notes?: unknown;
  }>,
  respectInputSequence?: boolean
) {
  if (!respectInputSequence) return false;

  return routeStops.some((stop) => {
    const legacy = parseLegacyStopNotes(
      typeof stop.notes === "string" ? stop.notes : undefined
    );
    const sourceProvider = normalizeStopSourceProvider(
      typeof stop.sourceProvider === "string"
        ? stop.sourceProvider
        : legacy.metadata.sourceRouteId ||
            legacy.metadata.packageNumber === "0" ||
            legacy.originalStop !== undefined
          ? "shopee"
          : undefined
    );
    return (
      sourceProvider === "shopee" &&
      (stop.originalStop !== null &&
        stop.originalStop !== undefined ||
        Boolean(stop.isUnsequencedStop) ||
        legacy.originalStop !== undefined ||
        legacy.metadata.packageNumber === "0")
    );
  });
}

function asShopeeStructuralAudit(report: RouteAuditReport): RouteAuditReport {
  const structuralIssues = report.issues.filter((issue) =>
    STRUCTURAL_AUDIT_ISSUE_TYPES.has(issue.type)
  );
  const criticalCount = structuralIssues.filter(
    (issue) => issue.severity === "critical"
  ).length;
  const warningCount = structuralIssues.length - criticalCount;

  return {
    ...report,
    status: criticalCount > 0 ? "critical" : warningCount > 0 ? "attention" : "approved",
    score: criticalCount > 0 ? Math.min(report.score, 70) : 100,
    quality: criticalCount > 0 ? "blocked" : warningCount > 0 ? "attention" : "excellent",
    issueCount: structuralIssues.length,
    criticalCount,
    warningCount,
    issues: structuralIssues,
  };
}

function applyShopeeStopAuditPolicy(
  report: RouteAuditReport,
  auditPolicy: string | null
): RouteAuditReport {
  return auditPolicy === SHOPEE_STOP_AUDIT_POLICY
    ? asShopeeStructuralAudit(report)
    : report;
}

function getBlockingAuditIssues(audit: RouteAuditReport) {
  return audit.issues.filter((issue) => BLOCKING_AUDIT_ISSUE_TYPES.has(issue.type));
}

function getPostOptimizationBlockingReason(audit: RouteAuditReport) {
  const nearbySkip = audit.issues.find(
    (issue) =>
      issue.type === "nearby_stop_skipped" &&
      (issue.severity === "critical" || issue.severity === "high")
  );
  if (nearbySkip) {
    return {
      issue: nearbySkip,
      message: `${nearbySkip.title}: ${nearbySkip.message}`,
    };
  }

  const regionRevisited = audit.issues.find(
    (issue) => issue.type === "region_revisited"
  );
  if (regionRevisited) {
    return {
      issue: regionRevisited,
      message: `${regionRevisited.title}: ${regionRevisited.message}`,
    };
  }

  const prematureRegionExit = audit.issues.find(
    (issue) => issue.type === "premature_region_exit"
  );
  if (prematureRegionExit) {
    return {
      issue: prematureRegionExit,
      message: `${prematureRegionExit.title}: ${prematureRegionExit.message}`,
    };
  }

  return null;
}

function isSequenceCoherenceIssue(issue: RouteAuditReport["issues"][number]) {
  return (
    issue.type === "nearby_stop_skipped" ||
    issue.type === "region_revisited" ||
    issue.type === "premature_region_exit"
  );
}

function countAuditIssues(audit: RouteAuditReport, type: RouteAuditReport["issues"][number]["type"]) {
  return audit.issues.filter((issue) => issue.type === type).length;
}

function countCorrectedIssues(
  correctionAttempts: Array<{
    blockingIssue: RouteAuditReport["issues"][number];
    batch?: {
      appliedIssueCounts: {
        nearby: number;
        revisit: number;
        prematureExit: number;
      };
    };
  }>
) {
  return correctionAttempts.reduce((total, attempt) => {
    const batchApplied = attempt.batch
      ? attempt.batch.appliedIssueCounts.nearby +
        attempt.batch.appliedIssueCounts.revisit +
        attempt.batch.appliedIssueCounts.prematureExit
      : 0;
    return total + Math.max(1, batchApplied);
  }, 0);
}

function countBatchCorrectionAttempts(
  correctionAttempts: Array<{ batch?: unknown }>
) {
  return correctionAttempts.filter((attempt) => attempt.batch).length;
}

function countRemainingCoherenceIssues(audit: RouteAuditReport) {
  return audit.issues.filter((issue) => {
    if (issue.type === "nearby_stop_skipped") {
      return issue.severity === "critical" || issue.severity === "high";
    }
    return issue.type === "region_revisited" || issue.type === "premature_region_exit";
  }).length;
}

function routeWaypointSignature(route: OptimizedRoute) {
  return route.waypoints
    .map((waypoint) =>
      [
        waypoint.latitude.toFixed(6),
        waypoint.longitude.toFixed(6),
        waypoint.address ?? "",
      ].join(",")
    )
    .join("|");
}

function routeWaypointsToLocations(waypoints: OptimizedRoute["waypoints"]): Location[] {
  return waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
    sourceProvider: waypoint.sourceProvider,
    originalStop: waypoint.originalStop,
    isUnsequencedStop: waypoint.isUnsequencedStop,
    metadata: waypoint.metadata,
    geocodingConfidenceScore: waypoint.geocodingConfidenceScore,
    geocodingMethod: waypoint.geocodingMethod,
    geocodingSuspect: waypoint.geocodingSuspect,
    commercialDetectionStatus: waypoint.commercialDetectionStatus,
    commercialConfidence: waypoint.commercialConfidence,
    commercialPlaceName: waypoint.commercialPlaceName,
    commercialCategory: waypoint.commercialCategory,
    commercialOpeningHours: waypoint.commercialOpeningHours,
    commercialSource: waypoint.commercialSource,
    commercialLastCheckedAt: waypoint.commercialLastCheckedAt,
  }));
}

function normalizeAddressForStopGrouping(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ap|apto|apartamento|bloco|torre|casa|fundos|frente|sala|loja)\b.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStopAddressGroupKey(address: unknown) {
  const parts = String(address || "")
    .split(",")
    .map(normalizeAddressForStopGrouping)
    .filter(Boolean);

  if (parts.length >= 2 && /^\d{1,6}[a-z]?$/.test(parts[1])) {
    return `${parts[0]}|${parts[1]}`;
  }

  return normalizeAddressForStopGrouping(address);
}

function findShopeeFloatingInsertionIndex(
  orderedLocations: Location[],
  floatingLocation: Location
) {
  const floatingKey = getStopAddressGroupKey(floatingLocation.address);
  if (floatingKey) {
    for (let index = orderedLocations.length - 1; index >= 0; index -= 1) {
      if (getStopAddressGroupKey(orderedLocations[index].address) === floatingKey) {
        return index + 1;
      }
    }
  }

  let bestIndex = orderedLocations.length;
  let bestCost = Infinity;

  for (let index = 0; index <= orderedLocations.length; index += 1) {
    const previous = orderedLocations[index - 1];
    const next = orderedLocations[index];
    const cost =
      previous && next
        ? calculateDistance(previous, floatingLocation) +
          calculateDistance(floatingLocation, next) -
          calculateDistance(previous, next)
        : previous
          ? calculateDistance(previous, floatingLocation)
          : next
            ? calculateDistance(floatingLocation, next)
            : 0;

    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function orderShopeeStopPreservedLocations(locations: Location[]) {
  const hasShopeeStop = locations.some(
    (location) =>
      normalizeStopSourceProvider(location.sourceProvider) === "shopee" &&
      (Number(location.originalStop) > 0 || Boolean(location.isUnsequencedStop))
  );
  if (!hasShopeeStop) return locations;

  const sequenced = locations
    .filter((location) => !location.isUnsequencedStop)
    .sort((a, b) => {
      const aStop = Number(a.originalStop);
      const bStop = Number(b.originalStop);
      if (Number.isFinite(aStop) && aStop > 0 && Number.isFinite(bStop) && bStop > 0) {
        return aStop - bStop;
      }
      return 0;
    });
  const floating = locations.filter((location) => Boolean(location.isUnsequencedStop));
  const ordered = [...sequenced];

  floating.forEach((location) => {
    ordered.splice(findShopeeFloatingInsertionIndex(ordered, location), 0, location);
  });

  return ordered;
}

function estimateEtaForStop(
  routeStops: Array<{ id?: unknown; latitude?: unknown; longitude?: unknown }>,
  stopId: number
) {
  const orderedStops = routeStops
    .map((stop) => ({
      id: Number(stop.id),
      latitude: Number(stop.latitude),
      longitude: Number(stop.longitude),
    }))
    .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
  const index = orderedStops.findIndex((stop) => stop.id === stopId);
  if (index < 0) return null;

  let minutes = 0;
  for (let stopIndex = 0; stopIndex < index; stopIndex += 1) {
    const distanceKm = calculateDistance(orderedStops[stopIndex], orderedStops[stopIndex + 1]);
    minutes += estimateTravelTime(distanceKm);
  }

  return new Date(Date.now() + minutes * 60 * 1000);
}

function correctionLimitForIssueType(type: RouteAuditReport["issues"][number]["type"]) {
  switch (type) {
    case "nearby_stop_skipped":
      return MAX_NEARBY_FIXES;
    case "region_revisited":
      return MAX_REVISIT_FIXES;
    case "premature_region_exit":
      return MAX_PREMATURE_EXIT_FIXES;
    default:
      return 0;
  }
}

function isCoherenceFixIssueType(
  type: RouteAuditReport["issues"][number]["type"]
): type is CoherenceFixIssueType {
  return (
    type === "nearby_stop_skipped" ||
    type === "region_revisited" ||
    type === "premature_region_exit"
  );
}

function countSequenceCoherenceIssuesByType(audit: RouteAuditReport) {
  return audit.issues.reduce(
    (counts, issue) => {
      if (issue.type === "nearby_stop_skipped") counts.nearby += 1;
      if (issue.type === "region_revisited") counts.revisit += 1;
      if (issue.type === "premature_region_exit") counts.prematureExit += 1;
      return counts;
    },
    { nearby: 0, revisit: 0, prematureExit: 0 }
  );
}

function isLimitCappedCoherenceIssue(issue: RouteAuditReport["issues"][number]) {
  return isCoherenceFixIssueType(issue.type);
}

function shouldProceedAfterCorrectionLimits(
  audit: RouteAuditReport,
  reason: ReturnType<typeof getPostOptimizationBlockingReason>,
  limitsReached: Set<RouteAuditReport["issues"][number]["type"]>,
  options: { allowLargeRouteAttention?: boolean } = {}
) {
  if (!reason || !isLimitCappedCoherenceIssue(reason.issue)) return false;
  if (!limitsReached.has(reason.issue.type) && !options.allowLargeRouteAttention) {
    return false;
  }

  const remainingBlockingIssues = audit.issues.filter((issue) => {
    if (issue.type === "nearby_stop_skipped") {
      return issue.severity === "critical" || issue.severity === "high";
    }
    return issue.type === "region_revisited" || issue.type === "premature_region_exit";
  });

  return remainingBlockingIssues.every(
    (issue) =>
      limitsReached.has(issue.type) ||
      (options.allowLargeRouteAttention && isCoherenceFixIssueType(issue.type))
  );
}

function moveWaypointsBeforeSequence(
  waypoints: OptimizedRoute["waypoints"],
  movedSequences: number[],
  beforeSequence: number
) {
  const movedSet = new Set(movedSequences);
  if (movedSet.size === 0 || movedSet.has(beforeSequence)) return false;

  const insertionReferenceIndex = waypoints.findIndex(
    (waypoint) => waypoint.sequence === beforeSequence
  );
  if (insertionReferenceIndex < 0) return false;

  const movedWaypoints = waypoints.filter((waypoint) => movedSet.has(waypoint.sequence));
  if (movedWaypoints.length === 0) return false;

  const remainingWaypoints = waypoints.filter(
    (waypoint) => !movedSet.has(waypoint.sequence)
  );
  const insertionIndex = remainingWaypoints.findIndex(
    (waypoint) => waypoint.sequence === beforeSequence
  );
  if (insertionIndex < 0) return false;

  if (
    movedWaypoints.every((waypoint) => {
      const currentIndex = waypoints.findIndex(
        (candidate) => candidate.sequence === waypoint.sequence
      );
      return currentIndex >= 0 && currentIndex < insertionReferenceIndex;
    })
  ) {
    return false;
  }

  remainingWaypoints.splice(insertionIndex, 0, ...movedWaypoints);
  waypoints.splice(0, waypoints.length, ...remainingWaypoints);
  return true;
}

function buildBatchAuditRepairPlan(audit: RouteAuditReport) {
  const selectedIssues: RouteAuditReport["issues"] = [];
  const counts: Record<CoherenceFixIssueType, number> = {
    nearby_stop_skipped: 0,
    region_revisited: 0,
    premature_region_exit: 0,
  };
  const cappedTypes = new Set<RouteAuditReport["issues"][number]["type"]>();

  for (const issue of audit.issues) {
    if (!isCoherenceFixIssueType(issue.type)) continue;
    const limit = correctionLimitForIssueType(issue.type);
    const currentCount = counts[issue.type] ?? 0;
    if (currentCount >= limit) {
      cappedTypes.add(issue.type);
      continue;
    }
    counts[issue.type] = currentCount + 1;
    selectedIssues.push(issue);
  }

  return {
    selectedIssues,
    cappedTypes,
    availableIssueCounts: countSequenceCoherenceIssuesByType(audit),
    appliedIssueCounts: {
      nearby: counts.nearby_stop_skipped,
      revisit: counts.region_revisited,
      prematureExit: counts.premature_region_exit,
    },
  };
}

function applyAuditPlan(route: OptimizedRoute, audit: RouteAuditReport) {
  const waypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));
  const plan = buildBatchAuditRepairPlan(audit);
  let changed = false;

  const prematureExitIssues = plan.selectedIssues.filter(
    (issue) => issue.type === "premature_region_exit" && issue.pendingSequences?.length
  );
  for (const issue of prematureExitIssues) {
    if (issue.toSequence === undefined || !issue.pendingSequences?.length) continue;
    changed =
      moveWaypointsBeforeSequence(waypoints, issue.pendingSequences, issue.toSequence) ||
      changed;
  }

  const nearbyOrRevisitIssues = plan.selectedIssues.filter(
    (issue) =>
      (issue.type === "nearby_stop_skipped" || issue.type === "region_revisited") &&
      issue.nearestSequence !== undefined &&
      issue.toSequence !== undefined
  );
  const movedNearestSequences = new Set<number>();
  for (const issue of nearbyOrRevisitIssues) {
    if (issue.nearestSequence === undefined || issue.toSequence === undefined) continue;
    if (movedNearestSequences.has(issue.nearestSequence)) continue;
    changed =
      moveWaypointsBeforeSequence(waypoints, [issue.nearestSequence], issue.toSequence) ||
      changed;
    movedNearestSequences.add(issue.nearestSequence);
  }

  return {
    repairedLocations: changed ? routeWaypointsToLocations(waypoints) : null,
    plan: {
      ...plan,
      nearbyFixes: plan.selectedIssues.filter(
        (issue) => issue.type === "nearby_stop_skipped"
      ),
      revisitFixes: plan.selectedIssues.filter(
        (issue) => issue.type === "region_revisited"
      ),
      prematureExitFixes: plan.selectedIssues.filter(
        (issue) => issue.type === "premature_region_exit"
      ),
      crossingAlerts: audit.issues.filter((issue) => issue.type === "route_crossing"),
    },
  };
}

function shouldPreferLocalNearbyStop(nearestDistance: number, plannedDistance: number) {
  if (!Number.isFinite(nearestDistance) || !Number.isFinite(plannedDistance)) {
    return false;
  }
  if (nearestDistance >= plannedDistance) return false;

  const gapKm = plannedDistance - nearestDistance;

  if (nearestDistance <= 0.25 && gapKm >= 0.05) return true;
  if (nearestDistance <= 0.8 && gapKm >= 0.2 && plannedDistance >= nearestDistance * 1.75) {
    return true;
  }
  if (nearestDistance <= 1.5 && gapKm >= 0.6) return true;

  return false;
}

function removeWaypointAt<T>(waypoints: T[], waypoint: T) {
  const index = waypoints.indexOf(waypoint);
  if (index >= 0) {
    waypoints.splice(index, 1);
    return true;
  }
  return false;
}

function takeSameAddressOrCoordinateStops(
  remainingWaypoints: OptimizedRoute["waypoints"],
  anchor: OptimizedRoute["waypoints"][number]
) {
  const anchorAddressKey = getStopAddressGroupKey(anchor.address);
  const grouped = remainingWaypoints
    .filter((candidate) => {
      const candidateAddressKey = getStopAddressGroupKey(candidate.address);
      if (anchorAddressKey && candidateAddressKey === anchorAddressKey) return true;
      return calculateDistance(anchor, candidate) <= 0.03;
    })
    .sort((a, b) => calculateDistance(anchor, a) - calculateDistance(anchor, b));

  for (const waypoint of grouped) {
    removeWaypointAt(remainingWaypoints, waypoint);
  }

  return grouped;
}

function buildLocalCoherenceSweepLocations(
  route: OptimizedRoute,
  options: { startLocation?: Location; forceNearest?: boolean } = {}
) {
  const remainingWaypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));
  const orderedWaypoints: OptimizedRoute["waypoints"] = [];
  let currentLocation = options.startLocation ?? remainingWaypoints[0];

  while (remainingWaypoints.length > 0) {
    const plannedNext = remainingWaypoints[0];
    let nearest = plannedNext;
    let nearestDistance = calculateDistance(currentLocation, plannedNext);

    for (const candidate of remainingWaypoints) {
      const distance = calculateDistance(currentLocation, candidate);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }

    const plannedDistance = calculateDistance(currentLocation, plannedNext);
    const selected = options.forceNearest || shouldPreferLocalNearbyStop(nearestDistance, plannedDistance)
      ? nearest
      : plannedNext;

    removeWaypointAt(remainingWaypoints, selected);
    orderedWaypoints.push(selected);

    const sameStopGroup = takeSameAddressOrCoordinateStops(
      remainingWaypoints,
      selected
    );
    orderedWaypoints.push(...sameStopGroup);

    currentLocation = orderedWaypoints[orderedWaypoints.length - 1] ?? selected;
  }

  const originalSignature = route.waypoints
    .map((waypoint) => `${waypoint.latitude}:${waypoint.longitude}:${waypoint.address ?? ""}`)
    .join("|");
  const localSignature = orderedWaypoints
    .map((waypoint) => `${waypoint.latitude}:${waypoint.longitude}:${waypoint.address ?? ""}`)
    .join("|");

  if (originalSignature === localSignature) return null;

  return routeWaypointsToLocations(orderedWaypoints);
}

export const __routeOptimizationTestHooks = {
  buildLocalCoherenceSweepLocations,
  shouldPreferLocalNearbyStop,
  isAuditAttemptBetter,
  getRouteOperationalOutcome,
};

function isAuditAttemptBetter(
  current: {
    optimized: OptimizedRoute;
    audit: RouteAuditReport;
  },
  candidate: {
    optimized: OptimizedRoute;
    audit: RouteAuditReport;
  }
) {
  const currentCrossings = countAuditIssues(current.audit, "route_crossing");
  const candidateCrossings = countAuditIssues(candidate.audit, "route_crossing");
  if (candidateCrossings > currentCrossings) {
    return false;
  }
  if (candidate.audit.issueCount > current.audit.issueCount) {
    return false;
  }

  const currentRemaining = countRemainingCoherenceIssues(current.audit);
  const candidateRemaining = countRemainingCoherenceIssues(candidate.audit);
  if (candidateRemaining !== currentRemaining) {
    return candidateRemaining < currentRemaining;
  }

  const currentNearby = countAuditIssues(current.audit, "nearby_stop_skipped");
  const candidateNearby = countAuditIssues(candidate.audit, "nearby_stop_skipped");
  if (candidateNearby !== currentNearby) {
    return candidateNearby < currentNearby;
  }

  if (candidate.audit.score !== current.audit.score) {
    return candidate.audit.score > current.audit.score;
  }

  return candidate.optimized.totalDistance < current.optimized.totalDistance;
}

function reorderRouteByAuditIssue(
  route: OptimizedRoute,
  issue: RouteAuditReport["issues"][number]
): Location[] | null {
  if (
    !isSequenceCoherenceIssue(issue) ||
    issue.nearestSequence === undefined ||
    issue.toSequence === undefined
  ) {
    return null;
  }

  const waypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));

  if (issue.type === "premature_region_exit" && issue.pendingSequences?.length) {
    const plannedIndex = waypoints.findIndex(
      (waypoint) => waypoint.sequence === issue.toSequence
    );
    if (plannedIndex < 0) return null;

    const pendingSequenceSet = new Set(issue.pendingSequences);
    const pendingWaypoints = waypoints.filter((waypoint) =>
      pendingSequenceSet.has(waypoint.sequence)
    );
    if (pendingWaypoints.length === 0) return null;

    const remainingWaypoints = waypoints.filter(
      (waypoint) => !pendingSequenceSet.has(waypoint.sequence)
    );
    const insertionIndex = remainingWaypoints.findIndex(
      (waypoint) => waypoint.sequence === issue.toSequence
    );
    if (insertionIndex < 0) return null;

    remainingWaypoints.splice(insertionIndex, 0, ...pendingWaypoints);
    return routeWaypointsToLocations(remainingWaypoints);
  }

  const nearestIndex = waypoints.findIndex(
    (waypoint) => waypoint.sequence === issue.nearestSequence
  );
  const plannedIndex = waypoints.findIndex(
    (waypoint) => waypoint.sequence === issue.toSequence
  );

  if (nearestIndex < 0 || plannedIndex < 0 || nearestIndex <= plannedIndex) {
    return null;
  }

  const [nearestWaypoint] = waypoints.splice(nearestIndex, 1);
  waypoints.splice(plannedIndex, 0, nearestWaypoint);

  return routeWaypointsToLocations(waypoints);
}

async function assertRouteStopsReadyForOptimization(
  routeStops: any[],
  context: { userId: number; routeId: number }
) {
  const audit = auditRouteSequence(routeStopsToAuditableStops(routeStops));
  const blockingIssues = getBlockingAuditIssues(audit);
  if (blockingIssues.length === 0) return;

  const firstIssue = blockingIssues[0];
  for (const issue of audit.issues) {
    if (issue.type !== "low_geocoding_confidence") continue;
    const issueMetadata = issue as Record<string, unknown>;
    await db.createOperationalEvent({
      userId: context.userId,
      routeId: context.routeId,
      stopId: Number(issueMetadata.stopId) || null,
      type: "geocoding_low_confidence",
      severity: "warning",
      source: "routes.optimize",
      title: "Endereco com baixa confianca",
      message: issue.message,
      metadata: {
        issueType: issue.type,
        confidenceScore: issueMetadata.confidenceScore ?? null,
        sequence: issue.stopSequence ?? null,
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record low confidence event:", error);
    });
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${firstIssue.title}: ${firstIssue.message}`,
  });
}

function auditOptimizedRoute(
  route: OptimizedRoute,
  options: {
    startLocation?: Location;
    usedRoadMetrics?: boolean;
    respectInputSequence?: boolean;
    auditPolicy?: string | null;
  } = {}
): RouteAuditReport {
  const report = auditRouteSequence(routeToAuditableStops(route), {
    startLocation: options.startLocation,
    requireStartLocation: true,
    actualTotalDistanceKm: route.totalDistance,
    usedRoadMetrics: options.usedRoadMetrics,
    respectInputSequence: options.respectInputSequence,
  });
  return applyShopeeStopAuditPolicy(report, options.auditPolicy ?? null);
}

function readBooleanMetadata(
  metadata: unknown,
  key: string
): boolean | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function readStringMetadata(
  metadata: unknown,
  key: string
): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isLatestOptimizationContextFresh(
  route: { status?: string; updatedAt?: Date | string | null },
  event: { createdAt?: Date | string | null } | null | undefined
) {
  if (!event || route.status !== "optimized") return false;

  const routeUpdatedAt = route.updatedAt ? new Date(route.updatedAt).getTime() : 0;
  const eventCreatedAt = event.createdAt ? new Date(event.createdAt).getTime() : 0;

  if (!Number.isFinite(routeUpdatedAt) || !Number.isFinite(eventCreatedAt)) {
    return false;
  }

  return routeUpdatedAt <= eventCreatedAt;
}

async function shouldPreserveShopeeStopSequenceForOptimization(
  route: { id: number; status?: string; updatedAt?: Date | string | null },
  userId: number,
  routeStops: Array<{
    sourceProvider?: unknown;
    originalStop?: unknown;
    isUnsequencedStop?: unknown;
    notes?: unknown;
  }>
) {
  const latestOptimizationEvent = await db.getLatestRouteOptimizationEvent(
    route.id,
    userId
  );
  if (!isLatestOptimizationContextFresh(route, latestOptimizationEvent)) {
    return false;
  }

  return isShopeeStopPreservedRoute(
    routeStops,
    readBooleanMetadata(latestOptimizationEvent?.metadata, "respectInputSequence") === true
  );
}

async function requireUserRoute(routeId: number, userId: number) {
  const route = await db.getRouteById(routeId, userId);

  if (!route) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Rota não encontrada.",
    });
  }

  return route;
}

export async function optimizeUserRoute(
  routeId: number,
  userId: number,
  requestedMode?: "shortest_distance" | "shortest_time" | "balanced",
  options?: {
    respectInputSequence?: boolean;
    excludeStopIds?: number[];
    startLocation?: Location;
    localityMode?: "balanced" | "local" | "strict";
    allowLargeSync?: boolean;
  }
) {
  const optimizationStartedAt = Date.now();
  const runtimeBreakdown = {
    dbFetchMs: 0,
    clusteringMs: 0,
    osrmMs: 0,
    optimizerMs: 0,
    auditMs: 0,
    correctionMs: 0,
    dbSaveMs: 0,
    totalRuntimeMs: 0,
    osrmCallCount: 0,
    osrmFailureCount: 0,
    osrmTotalMs: 0,
    osrmAverageMs: 0,
    osrmProvider: null as string | null,
    osrmAvailability: "unknown" as "unknown" | "available" | "degraded" | "unavailable",
    osrmLatencyMs: 0,
    osrmMatrixCount: 0,
    osrmMatrixSize: 0,
    osrmFailureReason: null as string | null,
    matrixCacheHit: 0,
    matrixCacheMiss: 0,
    matrixGenerationMs: 0,
    macroClusterCount: 0,
    microClusterCount: 0,
    largestClusterSize: 0,
  };
  const telemetry = {
    recordOsrmCall(durationMs: number, success: boolean) {
      const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
      runtimeBreakdown.osrmCallCount += 1;
      runtimeBreakdown.osrmTotalMs += safeDuration;
      runtimeBreakdown.osrmMs += safeDuration;
      if (!success) runtimeBreakdown.osrmFailureCount += 1;
      runtimeBreakdown.osrmAverageMs = Math.round(
        runtimeBreakdown.osrmTotalMs / Math.max(1, runtimeBreakdown.osrmCallCount)
      );
      runtimeBreakdown.osrmLatencyMs = runtimeBreakdown.osrmAverageMs;
      runtimeBreakdown.osrmAvailability =
        runtimeBreakdown.osrmFailureCount === 0
          ? "available"
          : runtimeBreakdown.osrmFailureCount >= runtimeBreakdown.osrmCallCount
            ? "unavailable"
            : "degraded";
    },
    recordOsrmMatrix(args: {
      nodeCount: number;
      durationMs: number;
      cacheHit: boolean;
      success: boolean;
      failureReason?: string | null;
      provider?: string | null;
    }) {
      const safeDuration = Number.isFinite(args.durationMs)
        ? Math.max(0, args.durationMs)
        : 0;
      runtimeBreakdown.osrmProvider = args.provider ?? runtimeBreakdown.osrmProvider;
      runtimeBreakdown.osrmMatrixCount += 1;
      runtimeBreakdown.osrmMatrixSize += Math.max(0, args.nodeCount) ** 2;
      runtimeBreakdown.matrixGenerationMs += safeDuration;
      if (args.cacheHit) {
        runtimeBreakdown.matrixCacheHit += 1;
      } else {
        runtimeBreakdown.matrixCacheMiss += 1;
      }
      if (!args.success && args.failureReason) {
        runtimeBreakdown.osrmFailureReason = args.failureReason;
      }
    },
  };
  let osrmCircuitEventRecorded = false;
  const dbFetchStartedAt = Date.now();
  const route = await requireUserRoute(routeId, userId);
  const excludedStopIds = new Set(options?.excludeStopIds ?? []);
  const routeStops = (await db.getRouteStops(routeId)).filter(
    (stop: any) => !excludedStopIds.has(Number(stop.id))
  );
  const auditPolicy = isShopeeStopPreservedRoute(
    routeStops,
    Boolean(options?.respectInputSequence)
  )
    ? SHOPEE_STOP_AUDIT_POLICY
    : null;
  const preserveShopeeStopSequence = auditPolicy === SHOPEE_STOP_AUDIT_POLICY;
  runtimeBreakdown.dbFetchMs = Date.now() - dbFetchStartedAt;

  if (routeStops.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A rota não tem paradas.",
    });
  }

  if (routeStops.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A rota precisa ter pelo menos 2 paradas para otimizar.",
    });
  }

  if (!options?.allowLargeSync && routeStops.length > ENV.maxSyncStops) {
    const job = await db.createOptimizationJob({
      routeId,
      userId,
      status: "queued",
      metadata: {
        stopCount: routeStops.length,
        maxSyncStops: ENV.maxSyncStops,
        routeMode: requestedMode || route.mode,
        localityMode: options?.localityMode ?? null,
        requestedRespectInputSequence: Boolean(options?.respectInputSequence),
        respectInputSequence: preserveShopeeStopSequence,
        auditPolicy,
        routingStrategy: getRoutingStrategy(auditPolicy),
        excludeStopIds: options?.excludeStopIds ?? [],
        requiresExternalWorker: true,
      },
    });
    let queueProviderJobId: string | null = null;
    let queueError: string | null = null;
    if (job?.id && isOptimizationQueueConfigured()) {
      try {
        const providerJob = await enqueueOptimizationJob({
          optimizationJobId: Number(job.id),
          routeId,
          userId,
          mode: requestedMode || route.mode,
          localityMode: options?.localityMode,
          respectInputSequence: preserveShopeeStopSequence,
          excludeStopIds: options?.excludeStopIds ?? [],
        });
        queueProviderJobId = providerJob?.id ? String(providerJob.id) : null;
        if (queueProviderJobId && job?.id) {
          await db.updateOptimizationJob(Number(job.id), {
            providerJobId: queueProviderJobId,
            maxAttempts: 3,
          }).catch(() => undefined);
        }
      } catch (error) {
        queueError =
          error instanceof Error ? error.message : "Falha ao publicar na fila.";
        if (job?.id) {
          await db.updateOptimizationJob(Number(job.id), {
            status: "failed",
            finishedAt: new Date(),
            errorMessage: queueError,
          }).catch(() => undefined);
        }
      }
    }
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "optimization_job_created",
      severity: isOptimizationQueueConfigured() && !queueError ? "info" : "warning",
      source: "optimization.queue",
      title: "Job de otimizacao criado",
      message: isOptimizationQueueConfigured() && !queueError
        ? "Rota grande criada na fila de otimizacao."
        : "Rota grande registrada, mas a fila ainda nao esta operacional.",
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        optimizationJobId: job?.id ?? null,
        providerJobId: queueProviderJobId,
        queueConfigured: isOptimizationQueueConfigured(),
        queueError,
        stopCount: routeStops.length,
        maxSyncStops: ENV.maxSyncStops,
        requestedRespectInputSequence: Boolean(options?.respectInputSequence),
        respectInputSequence: preserveShopeeStopSequence,
        auditPolicy,
        routingStrategy: getRoutingStrategy(auditPolicy),
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record optimization job event:", error);
    });
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_requires_queue",
      severity: "warning",
      source: "routes.optimize",
      title: "Rota grande exige fila",
      message: `A rota tem ${routeStops.length} paradas e excede o limite sincrono de ${ENV.maxSyncStops}.`,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        jobId: job?.id ?? null,
        queueProviderJobId,
        queueConfigured: isOptimizationQueueConfigured(),
        queueError,
        stopCount: routeStops.length,
        maxSyncStops: ENV.maxSyncStops,
        requestedRespectInputSequence: Boolean(options?.respectInputSequence),
        respectInputSequence: preserveShopeeStopSequence,
        auditPolicy,
        routingStrategy: getRoutingStrategy(auditPolicy),
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record queue requirement event:", error);
    });

    if (isOptimizationQueueConfigured() && !queueError) {
      return {
        queued: true,
        optimizationJobId: job?.id ?? null,
        providerJobId: queueProviderJobId,
        routeId,
        status: "queued" as const,
        totalDistance: 0,
        totalTime: 0,
        audit: null,
        auditSource: "queued",
        auditPolicy,
        routingStrategy: getRoutingStrategy(auditPolicy),
        operationalStatus: "queued" as const,
        operationalStatusLabel: "Na fila de otimizacao",
        commerciallySatisfactory: false,
        sequenceCoherenceVerified: false,
        remainingCoherenceIssues: null,
      };
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: queueError
        ? `Rota grande exige fila de otimizacao, mas a fila falhou: ${queueError}`
        : "Rota grande exige fila de otimizacao. Configure Redis/BullMQ e worker para processar rotas acima do limite sincrono.",
    });
  }

  await assertRouteStopsReadyForOptimization(routeStops, { userId, routeId });

  const locations: Location[] = routeStops.map((stop: any) => {
    const legacy = parseLegacyStopNotes(stop.notes ?? undefined);
    const metadata = normalizeStopMetadata({
      ...legacy.metadata,
      ...normalizeStopMetadata(stop.metadata),
    });
    const sourceProvider = normalizeStopSourceProvider(
      stop.sourceProvider ||
        (legacy.metadata.sourceRouteId ||
        legacy.metadata.packageNumber === "0" ||
        legacy.originalStop !== undefined
          ? "shopee"
          : undefined)
    );
    const legacyPackageZero =
      sourceProvider === "shopee" &&
      stop.originalStop == null &&
      legacy.originalStop === undefined &&
      legacy.metadata.packageNumber === "0";

    return {
      latitude: parseFloat(String(stop.latitude ?? 0)),
      longitude: parseFloat(String(stop.longitude ?? 0)),
      address: stop.address,
      notes: stop.notes ?? undefined,
      sourceProvider,
      originalStop:
        stop.originalStop ?? legacy.originalStop ?? (legacyPackageZero ? 0 : null),
      isUnsequencedStop:
        Boolean(stop.isUnsequencedStop) ||
        Boolean(legacy.isUnsequencedStop) ||
        legacyPackageZero,
      metadata,
      geocodingConfidenceScore: Number(stop.geocodingConfidenceScore ?? 0),
      geocodingMethod: stop.geocodingMethod ?? undefined,
      geocodingSuspect: Boolean(stop.geocodingSuspect),
      commercialDetectionStatus: stop.commercialDetectionStatus ?? "unknown",
      commercialConfidence: Number(stop.commercialConfidence ?? 0),
      commercialPlaceName: stop.commercialPlaceName ?? null,
      commercialCategory: stop.commercialCategory ?? null,
      commercialOpeningHours: stop.commercialOpeningHours ?? null,
      commercialSource: stop.commercialSource ?? null,
      commercialLastCheckedAt: stop.commercialLastCheckedAt ?? null,
    };
  });
  const optimizationLocations =
    preserveShopeeStopSequence
      ? orderShopeeStopPreservedLocations(locations)
      : locations;

  const validation = validateLocations(locations);
  if (!validation.valid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: validation.error,
    });
  }
  const missingCoordinateIndex = locations.findIndex(hasMissingCoordinates);
  if (missingCoordinateIndex !== -1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Coordenadas ausentes na parada ${missingCoordinateIndex + 1}.`,
    });
  }

  const macroClusters = clusterStops(optimizationLocations, {
    localityMode: options?.localityMode,
  });
  const microClusters = partitionStopsForOptimization(optimizationLocations, {
    localityMode: options?.localityMode,
  });
  runtimeBreakdown.macroClusterCount = macroClusters.length;
  runtimeBreakdown.microClusterCount =
    optimizationLocations.length <= 100 ? macroClusters.length : microClusters.length;
  runtimeBreakdown.largestClusterSize = Math.max(
    0,
    ...macroClusters.map((cluster) => cluster.stops.length)
  );

  const startLocation =
    options?.startLocation ??
    toOptionalLocation(route.startLocation, route.startLatitude, route.startLongitude);
  const endLocation = toOptionalLocation(
    route.endLocation,
    route.endLatitude,
    route.endLongitude
  );
  const endpointValidation = validateLocations(
    [startLocation, endLocation].filter(Boolean) as Location[]
  );
  if ((startLocation || endLocation) && !endpointValidation.valid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: endpointValidation.error,
    });
  }
  if ([startLocation, endLocation].filter(Boolean).some((location) =>
    hasMissingCoordinates(location as Location)
  )) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Coordenadas ausentes no inicio ou fim da rota.",
    });
  }

  const mode = requestedMode || route.mode;
  const clusteringStartedAt = Date.now();
  clusterStops(locations, { localityMode: options?.localityMode });
  runtimeBreakdown.clusteringMs = Date.now() - clusteringStartedAt;
  async function buildOptimizationAttempt(attempt: {
    localityMode?: "balanced" | "local" | "strict";
    respectInputSequence?: boolean;
    auditSourceSuffix?: string;
    orderedLocations?: Location[];
  }) {
    const attemptLocations = attempt.orderedLocations ?? optimizationLocations;
    const roadMetricOptions = {
      startLocation,
      endLocation,
      localityMode: attempt.localityMode,
      telemetry,
    };
    let optimizedWithRoadMetrics: OptimizedRoute | null = null;
    let auditSource = "geo-default";

    const optimizerStartedAt = Date.now();
    const osrmCircuitOpen =
      runtimeBreakdown.osrmCallCount >= OSRM_CIRCUIT_MIN_CALLS &&
      runtimeBreakdown.osrmFailureCount / Math.max(1, runtimeBreakdown.osrmCallCount) >=
        OSRM_CIRCUIT_FAILURE_RATE;

    if (osrmCircuitOpen) {
      auditSource = "geo-osrm-circuit-open";
      if (!osrmCircuitEventRecorded) {
        osrmCircuitEventRecorded = true;
        await db.createOperationalEvent({
          userId,
          routeId,
          stopId: null,
          type: "route_osrm_circuit_opened",
          severity: "warning",
          source: options?.allowLargeSync ? "optimization.worker" : "routes.optimize",
          title: "OSRM pausado por falha alta",
          message:
            "O otimizador interrompeu novas chamadas OSRM nesta rota depois de detectar muitas falhas do provedor.",
          runtime: null,
          url: null,
          userAgent: null,
          appVersion: null,
          metadata: {
            stopCount: attemptLocations.length,
            osrmCallCount: runtimeBreakdown.osrmCallCount,
            osrmFailureCount: runtimeBreakdown.osrmFailureCount,
            failureRate:
              runtimeBreakdown.osrmFailureCount /
              Math.max(1, runtimeBreakdown.osrmCallCount),
            minCalls: OSRM_CIRCUIT_MIN_CALLS,
            threshold: OSRM_CIRCUIT_FAILURE_RATE,
            osrmBaseUrl: ENV.osrmBaseUrl,
          },
        }).catch((error) => {
          console.warn("[Routes] Failed to record OSRM circuit event:", error);
        });
      }
    } else {
      if (attempt.respectInputSequence) {
        optimizedWithRoadMetrics = await buildSequentialRouteWithRoadMetrics(
          attemptLocations,
          roadMetricOptions
        );
        auditSource = optimizedWithRoadMetrics ? "road-sequential" : "geo-sequential";
      } else if (attempt.orderedLocations) {
        optimizedWithRoadMetrics = await buildSequentialRouteWithRoadMetrics(
          attemptLocations,
          roadMetricOptions
        );
        auditSource = optimizedWithRoadMetrics ? "road-audit-repair" : "geo-audit-repair";
      } else {
        optimizedWithRoadMetrics = await optimizeRouteWithRoadMetrics(
          attemptLocations,
          mode,
          0,
          roadMetricOptions
        );
        auditSource = optimizedWithRoadMetrics ? "road-default" : "geo-default";
      }
    }

    const shouldUseLargePartitionedFallback =
      !optimizedWithRoadMetrics &&
      attemptLocations.length > ENV.maxGeographicFallbackStops &&
      Boolean(options?.allowLargeSync);
    const isShopeeStopPreservedSequentialRoute =
      attempt.respectInputSequence && auditPolicy === SHOPEE_STOP_AUDIT_POLICY;

    if (
      !optimizedWithRoadMetrics &&
      attemptLocations.length > ENV.maxGeographicFallbackStops &&
      !shouldUseLargePartitionedFallback &&
      !isShopeeStopPreservedSequentialRoute
    ) {
      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "geographic_fallback_blocked",
        severity: "error",
        source: "routes.optimize",
        title: "Fallback geografico bloqueado",
        message: `OSRM indisponivel para ${attemptLocations.length} paradas. Fallback geografico acima de ${ENV.maxGeographicFallbackStops} paradas foi bloqueado.`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl,
          auditSource,
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record blocked geographic fallback:", error);
      });
      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "osrm_required_for_large_route",
        severity: "error",
        source: "routes.optimize",
        title: "OSRM necessario para rota grande",
        message:
          "Rotas grandes precisam de matriz por rua para evitar roteirizacao geografica lenta ou incoerente.",
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl,
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record OSRM required event:", error);
      });

      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Nao foi possivel calcular esta rota grande agora. O servico de rotas por ruas esta indisponivel e a estimativa simples foi bloqueada para evitar uma sequencia ruim. Tente novamente em alguns minutos ou reduza a rota.",
      });
    }

    if (shouldUseLargePartitionedFallback) {
      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "geographic_fallback_worker_global",
        severity: "warning",
        source: "optimization.worker",
        title: "Fallback geografico global no worker",
        message: `OSRM indisponivel para ${attemptLocations.length} paradas. Worker aplicou fallback global fora da requisicao HTTP.`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl,
          auditSource,
          allowLargeSync: true,
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record partitioned geographic fallback:", error);
      });
    }

    if (
      !optimizedWithRoadMetrics &&
      attemptLocations.length > ENV.maxGeographicFallbackStops &&
      isShopeeStopPreservedSequentialRoute
    ) {
      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "shopee_stop_sequence_saved_without_osrm",
        severity: "warning",
        source: "routes.optimize",
        title: "Sequencia STOP Shopee preservada sem OSRM",
        message:
          "A rota Shopee foi salva seguindo a coluna STOP. Paradas sem STOP foram encaixadas por proximidade, sem bloquear o inicio da rota.",
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl,
          auditSource,
          auditPolicy,
          routingStrategy: getRoutingStrategy(auditPolicy),
          respectInputSequence: true,
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record Shopee STOP sequential fallback:", error);
      });
    }

    const optimized = optimizedWithRoadMetrics
      ?? (attempt.respectInputSequence
        ? buildSequentialRoute(attemptLocations, roadMetricOptions)
        : attempt.orderedLocations
          ? buildSequentialRoute(attemptLocations, roadMetricOptions)
          : optimizeRoute(attemptLocations, mode, 0, {
              ...roadMetricOptions,
              partitionLargeRoutes: shouldUseLargePartitionedFallback ? false : undefined,
            }));
    runtimeBreakdown.optimizerMs += Date.now() - optimizerStartedAt;
    const auditStartedAt = Date.now();
    const audit = auditOptimizedRoute(optimized, {
      startLocation,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      respectInputSequence: Boolean(attempt.respectInputSequence),
      auditPolicy,
    });
    runtimeBreakdown.auditMs += Date.now() - auditStartedAt;

    return {
      optimized,
      audit,
      auditSource: attempt.auditSourceSuffix
        ? `${auditSource}-${attempt.auditSourceSuffix}`
        : auditSource,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      localityMode: attempt.localityMode,
      respectInputSequence: Boolean(attempt.respectInputSequence),
      auditPolicy,
      routingStrategy: getRoutingStrategy(auditPolicy),
    };
  }

  let optimizationAttempt = await buildOptimizationAttempt({
    localityMode: options?.localityMode,
    respectInputSequence: preserveShopeeStopSequence,
  });
  let postOptimizationBlockingReason = getPostOptimizationBlockingReason(
    optimizationAttempt.audit
  );
  let firstBlockingReason = postOptimizationBlockingReason;
  const correctionAttempts: Array<{
    blockingIssue: RouteAuditReport["issues"][number];
    auditSource: string;
    status: RouteAuditReport["status"];
    score: number;
    issueCount: number;
    batch?: {
      availableIssueCounts: ReturnType<typeof countSequenceCoherenceIssuesByType>;
      appliedIssueCounts: {
        nearby: number;
        revisit: number;
        prematureExit: number;
      };
      cappedTypes: string[];
    };
  }> = [];
  const correctionLimitsReached = new Set<RouteAuditReport["issues"][number]["type"]>();

  if (postOptimizationBlockingReason && isSequenceCoherenceIssue(postOptimizationBlockingReason.issue)) {
    const correctionStartedAt = Date.now();
    const seenSignatures = new Set([routeWaypointSignature(optimizationAttempt.optimized)]);
    const maxRepairAttempts = MAX_BATCH_AUDIT_REPAIR_PASSES;

    for (
      let repairAttempt = 0;
      postOptimizationBlockingReason &&
        isSequenceCoherenceIssue(postOptimizationBlockingReason.issue) &&
        repairAttempt < maxRepairAttempts;
      repairAttempt += 1
    ) {
      const batchRepair = applyAuditPlan(
        optimizationAttempt.optimized,
        optimizationAttempt.audit
      );
      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "audit_plan_generated",
        severity: "info",
        source: "routes.audit",
        title: "Plano global do fiscal gerado",
        message: `Plano com ${batchRepair.plan.selectedIssues.length} incoerencia(s) selecionada(s).`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          repairAttempt: repairAttempt + 1,
          availableIssueCounts: batchRepair.plan.availableIssueCounts,
          appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
          cappedTypes: Array.from(batchRepair.plan.cappedTypes),
          crossingAlerts: batchRepair.plan.crossingAlerts.length,
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record audit plan event:", error);
      });
      for (const cappedType of Array.from(batchRepair.plan.cappedTypes)) {
        correctionLimitsReached.add(cappedType);
      }
      const repairedLocations =
        batchRepair.repairedLocations ??
        reorderRouteByAuditIssue(
          optimizationAttempt.optimized,
          postOptimizationBlockingReason.issue
        );
      if (!repairedLocations) {
        await db.createOperationalEvent({
          userId,
          routeId,
          stopId: null,
          type: "audit_batch_failed",
          severity: "warning",
          source: "routes.audit",
          title: "Correção em lote sem alteração",
          message: "O fiscal gerou plano global, mas não encontrou alteração aplicável na sequência.",
          runtime: null,
          url: null,
          userAgent: null,
          appVersion: null,
          metadata: {
            repairAttempt: repairAttempt + 1,
            blockingIssue: postOptimizationBlockingReason.issue,
            availableIssueCounts: batchRepair.plan.availableIssueCounts,
            appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
            cappedTypes: Array.from(batchRepair.plan.cappedTypes),
          },
        }).catch((error) => {
          console.warn("[Routes] Failed to record audit batch failure:", error);
        });
        break;
      }

      const repairedAttempt = await buildOptimizationAttempt({
        localityMode: "strict",
        respectInputSequence: false,
        auditSourceSuffix: `audit-global-plan-${repairAttempt + 1}`,
        orderedLocations: repairedLocations,
      });
      const signature = routeWaypointSignature(repairedAttempt.optimized);
      if (seenSignatures.has(signature)) break;

      seenSignatures.add(signature);
      correctionAttempts.push({
        blockingIssue: postOptimizationBlockingReason.issue,
        auditSource: repairedAttempt.auditSource,
        status: repairedAttempt.audit.status,
        score: repairedAttempt.audit.score,
        issueCount: repairedAttempt.audit.issueCount,
        batch: {
          availableIssueCounts: batchRepair.plan.availableIssueCounts,
          appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
          cappedTypes: Array.from(batchRepair.plan.cappedTypes),
        },
      });
      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "audit_batch_applied",
        severity: "info",
        source: "routes.audit",
        title: "Correção em lote aplicada",
        message: `Fiscal aplicou lote ${repairAttempt + 1} e reauditoria encontrou ${repairedAttempt.audit.issueCount} alerta(s).`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          repairAttempt: repairAttempt + 1,
          auditSource: repairedAttempt.auditSource,
          finalStatus: repairedAttempt.audit.status,
          finalScore: repairedAttempt.audit.score,
          finalIssueCount: repairedAttempt.audit.issueCount,
          remainingCoherenceIssues: countRemainingCoherenceIssues(repairedAttempt.audit),
          batch: {
            availableIssueCounts: batchRepair.plan.availableIssueCounts,
            appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
            cappedTypes: Array.from(batchRepair.plan.cappedTypes),
          },
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record audit batch event:", error);
      });
      optimizationAttempt = repairedAttempt;
      postOptimizationBlockingReason = getPostOptimizationBlockingReason(
        optimizationAttempt.audit
      );
    }
    if (
      shouldProceedAfterCorrectionLimits(
        optimizationAttempt.audit,
        postOptimizationBlockingReason,
        correctionLimitsReached,
        {
          allowLargeRouteAttention: true,
        }
      )
    ) {
      postOptimizationBlockingReason = null;
    }
    runtimeBreakdown.correctionMs += Date.now() - correctionStartedAt;
  }

  if (
    !preserveShopeeStopSequence &&
    countRemainingCoherenceIssues(optimizationAttempt.audit) > 0
  ) {
    const localSweepStartedAt = Date.now();
    const maxLocalSweepPasses = 3;

    for (let sweepAttempt = 0; sweepAttempt < maxLocalSweepPasses; sweepAttempt += 1) {
      const localSweepLocations = buildLocalCoherenceSweepLocations(
        optimizationAttempt.optimized,
        { startLocation }
      );
      if (!localSweepLocations) break;

      const localSweepAttempt = await buildOptimizationAttempt({
        localityMode: "strict",
        respectInputSequence: false,
        auditSourceSuffix: `local-sweep-${sweepAttempt + 1}`,
        orderedLocations: localSweepLocations,
      });
      const remainingBefore = countRemainingCoherenceIssues(optimizationAttempt.audit);
      const remainingAfter = countRemainingCoherenceIssues(localSweepAttempt.audit);

      await db.createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "audit_local_sweep_applied",
        severity: isAuditAttemptBetter(optimizationAttempt, localSweepAttempt)
          ? "info"
          : "warning",
        source: "routes.audit",
        title: "Varredura local de coerencia aplicada",
        message: `Fiscal aplicou varredura local ${sweepAttempt + 1}: ${remainingBefore} incoerencia(s) antes, ${remainingAfter} depois.`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          sweepAttempt: sweepAttempt + 1,
          auditSource: localSweepAttempt.auditSource,
          before: {
            score: optimizationAttempt.audit.score,
            issueCount: optimizationAttempt.audit.issueCount,
            remainingCoherenceIssues: remainingBefore,
            nearbyStopSkippedCount: countAuditIssues(
              optimizationAttempt.audit,
              "nearby_stop_skipped"
            ),
          },
          after: {
            score: localSweepAttempt.audit.score,
            issueCount: localSweepAttempt.audit.issueCount,
            remainingCoherenceIssues: remainingAfter,
            nearbyStopSkippedCount: countAuditIssues(
              localSweepAttempt.audit,
              "nearby_stop_skipped"
            ),
          },
        },
      }).catch((error) => {
        console.warn("[Routes] Failed to record audit local sweep event:", error);
      });

      if (!isAuditAttemptBetter(optimizationAttempt, localSweepAttempt)) break;

      const localSweepIssue =
        postOptimizationBlockingReason?.issue ??
        optimizationAttempt.audit.issues.find(isSequenceCoherenceIssue);
      if (localSweepIssue) {
        correctionAttempts.push({
          blockingIssue: localSweepIssue,
          auditSource: localSweepAttempt.auditSource,
          status: localSweepAttempt.audit.status,
          score: localSweepAttempt.audit.score,
          issueCount: localSweepAttempt.audit.issueCount,
        });
      }

      optimizationAttempt = localSweepAttempt;
      postOptimizationBlockingReason = getPostOptimizationBlockingReason(
        optimizationAttempt.audit
      );

      if (remainingAfter === 0) break;
    }

    if (countRemainingCoherenceIssues(optimizationAttempt.audit) > 0) {
      const forcedSweepLocations = buildLocalCoherenceSweepLocations(
        optimizationAttempt.optimized,
        { startLocation, forceNearest: true }
      );

      if (forcedSweepLocations) {
        const forcedSweepAttempt = await buildOptimizationAttempt({
          localityMode: "strict",
          respectInputSequence: false,
          auditSourceSuffix: "forced-nearest-sweep",
          orderedLocations: forcedSweepLocations,
        });
        const remainingBefore = countRemainingCoherenceIssues(optimizationAttempt.audit);
        const remainingAfter = countRemainingCoherenceIssues(forcedSweepAttempt.audit);
        const forcedSweepIsBetter = isAuditAttemptBetter(
          optimizationAttempt,
          forcedSweepAttempt
        );

        await db.createOperationalEvent({
          userId,
          routeId,
          stopId: null,
          type: "audit_forced_nearest_sweep",
          severity: forcedSweepIsBetter ? "info" : "warning",
          source: "routes.audit",
          title: "Varredura final por proximidade avaliada",
          message: forcedSweepIsBetter
            ? `Fiscal aceitou varredura final: ${remainingBefore} incoerencia(s) antes, ${remainingAfter} depois.`
            : `Fiscal rejeitou varredura final: ${remainingBefore} incoerencia(s) antes, ${remainingAfter} depois.`,
          runtime: null,
          url: null,
          userAgent: null,
          appVersion: null,
          metadata: {
            auditSource: forcedSweepAttempt.auditSource,
            accepted: forcedSweepIsBetter,
            before: {
              score: optimizationAttempt.audit.score,
              issueCount: optimizationAttempt.audit.issueCount,
              remainingCoherenceIssues: remainingBefore,
              nearbyStopSkippedCount: countAuditIssues(
                optimizationAttempt.audit,
                "nearby_stop_skipped"
              ),
              routeCrossingCount: countAuditIssues(
                optimizationAttempt.audit,
                "route_crossing"
              ),
            },
            after: {
              score: forcedSweepAttempt.audit.score,
              issueCount: forcedSweepAttempt.audit.issueCount,
              remainingCoherenceIssues: remainingAfter,
              nearbyStopSkippedCount: countAuditIssues(
                forcedSweepAttempt.audit,
                "nearby_stop_skipped"
              ),
              routeCrossingCount: countAuditIssues(
                forcedSweepAttempt.audit,
                "route_crossing"
              ),
            },
          },
        }).catch((error) => {
          console.warn("[Routes] Failed to record forced nearest sweep event:", error);
        });

        if (forcedSweepIsBetter) {
          const forcedSweepIssue =
            postOptimizationBlockingReason?.issue ??
            optimizationAttempt.audit.issues.find(isSequenceCoherenceIssue);
          if (forcedSweepIssue) {
            correctionAttempts.push({
              blockingIssue: forcedSweepIssue,
              auditSource: forcedSweepAttempt.auditSource,
              status: forcedSweepAttempt.audit.status,
              score: forcedSweepAttempt.audit.score,
              issueCount: forcedSweepAttempt.audit.issueCount,
            });
          }

          optimizationAttempt = forcedSweepAttempt;
          postOptimizationBlockingReason = getPostOptimizationBlockingReason(
            optimizationAttempt.audit
          );
        }
      }
    }

    runtimeBreakdown.correctionMs += Date.now() - localSweepStartedAt;
  }

  if (correctionAttempts.length > 0 && firstBlockingReason) {
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_audit_corrected_optimization",
      severity: postOptimizationBlockingReason ? "warning" : "info",
      source: "routes.audit",
      title: postOptimizationBlockingReason
        ? "Auditor tentou corrigir a sequência"
        : "Auditor corrigiu a sequência",
      message: postOptimizationBlockingReason
        ? `O fiscal tentou ${correctionAttempts.length} correcao(oes), mas a rota ainda tem incoerencia. ${postOptimizationBlockingReason.message}`
        : `A rota foi reotimizada em modo rígido após o fiscal detectar incoerência. ${firstBlockingReason.message}`,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        firstBlockingIssue: firstBlockingReason.issue,
        finalStatus: optimizationAttempt.audit.status,
        finalScore: optimizationAttempt.audit.score,
        finalIssueCount: optimizationAttempt.audit.issueCount,
        finalIssues: optimizationAttempt.audit.issues.slice(0, 8),
        correctionAttempts,
        localityMode: optimizationAttempt.localityMode,
        respectInputSequence: optimizationAttempt.respectInputSequence,
        auditPolicy: optimizationAttempt.auditPolicy,
        routingStrategy: getRoutingStrategy(optimizationAttempt.auditPolicy),
        structuralAuditOnly: optimizationAttempt.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
        coherenceAuditSkipped: optimizationAttempt.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
        auditSource: optimizationAttempt.auditSource,
        routeMetadata: optimizationAttempt.optimized.metadata ?? null,
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record route audit correction event:", error);
    });
  }

  if (
    correctionAttempts.length > 0 &&
    !postOptimizationBlockingReason &&
    countRemainingCoherenceIssues(optimizationAttempt.audit) > 0
  ) {
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "audit_final_attention",
      severity: "warning",
      source: "routes.audit",
      title: "Fiscal finalizou com atenção",
      message: "A rota ficou executável, mas ainda possui alertas operacionais após correção em lote.",
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        auditStatus: optimizationAttempt.audit.status,
        auditScore: optimizationAttempt.audit.score,
        finalIssueCount: optimizationAttempt.audit.issueCount,
        remainingCoherenceIssues: countRemainingCoherenceIssues(optimizationAttempt.audit),
        correctionAttempts,
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record final attention event:", error);
    });
  }

  const finalOperationalOutcome = getRouteOperationalOutcome(
    optimizationAttempt.audit,
    optimizationAttempt.auditPolicy,
    { usedRoadMetrics: optimizationAttempt.usedRoadMetrics }
  );

  if (finalOperationalOutcome.status === "attention_strong") {
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_optimization_attention_strong",
      severity: "warning",
      source: "routes.audit",
      title: "Otimizacao finalizada com atencao forte",
      message:
        "A rota foi salva, mas ainda possui incoerencia de sequencia. Nao trate como resultado comercialmente satisfatorio.",
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        ...finalOperationalOutcome,
        finalIssues: optimizationAttempt.audit.issues.slice(0, 12),
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record strong attention event:", error);
    });
  }

  async function recordRouteMetricForAttempt(
    blockedReason: ReturnType<typeof getPostOptimizationBlockingReason>
  ) {
    const attemptAudit = optimizationAttempt.audit;
    const geocodingConfidence = summarizeGeocodingConfidence(routeStops);
    await db.createRouteMetric({
      userId,
      routeId,
      qualityScore: attemptAudit.score,
      optimizationRuntimeMs: Date.now() - optimizationStartedAt,
      dbFetchMs: runtimeBreakdown.dbFetchMs,
      clusteringMs: runtimeBreakdown.clusteringMs,
      osrmMs: runtimeBreakdown.osrmMs,
      optimizerMs: runtimeBreakdown.optimizerMs,
      auditMs: runtimeBreakdown.auditMs,
      correctionMs: runtimeBreakdown.correctionMs,
      dbSaveMs: runtimeBreakdown.dbSaveMs,
      totalRuntimeMs: Date.now() - optimizationStartedAt,
      osrmCallCount: runtimeBreakdown.osrmCallCount,
      osrmFailureCount: runtimeBreakdown.osrmFailureCount,
      osrmTotalMs: runtimeBreakdown.osrmTotalMs,
      osrmAverageMs: runtimeBreakdown.osrmAverageMs,
      osrmProvider: runtimeBreakdown.osrmProvider,
      osrmAvailability: runtimeBreakdown.osrmAvailability,
      osrmLatencyMs: runtimeBreakdown.osrmLatencyMs,
      osrmMatrixCount: runtimeBreakdown.osrmMatrixCount,
      osrmMatrixSize: runtimeBreakdown.osrmMatrixSize,
      osrmFailureReason: runtimeBreakdown.osrmFailureReason,
      matrixCacheHit: runtimeBreakdown.matrixCacheHit,
      matrixCacheMiss: runtimeBreakdown.matrixCacheMiss,
      matrixGenerationMs: runtimeBreakdown.matrixGenerationMs,
      macroClusterCount: runtimeBreakdown.macroClusterCount,
      microClusterCount: runtimeBreakdown.microClusterCount,
      largestClusterSize: runtimeBreakdown.largestClusterSize,
      osrmUsed: optimizationAttempt.usedRoadMetrics,
      osrmFallback: !optimizationAttempt.usedRoadMetrics,
      clusterCount: attemptAudit.clusterMetrics.clusterCount,
      averageClusterRadius: attemptAudit.clusterMetrics.averageRadiusKm,
      maxClusterRadius: attemptAudit.clusterMetrics.maxRadiusKm,
      regionRevisitedCount: countAuditIssues(attemptAudit, "region_revisited"),
      prematureRegionExitCount: countAuditIssues(
        attemptAudit,
        "premature_region_exit"
      ),
      nearbyStopSkippedCount: countAuditIssues(
        attemptAudit,
        "nearby_stop_skipped"
      ),
      routeCrossingCount: countAuditIssues(attemptAudit, "route_crossing"),
      averageGeocodingConfidence: geocodingConfidence.averageScore,
      minGeocodingConfidence: geocodingConfidence.minScore,
      suspiciousGeocodingCount: geocodingConfidence.suspectCount,
      issuesDetectedCount: attemptAudit.issueCount + correctionAttempts.length,
      issuesCorrectedCount: blockedReason
        ? 0
        : countCorrectedIssues(correctionAttempts),
      issuesBlockedCount: blockedReason ? 1 : 0,
      auditCycles: 1 + correctionAttempts.length,
      issuesRemainingCount: countRemainingCoherenceIssues(attemptAudit),
      batchCorrectionCount: countBatchCorrectionAttempts(correctionAttempts),
      auditStatus: attemptAudit.status,
      auditQuality: attemptAudit.quality,
      auditSource: optimizationAttempt.auditSource,
      routeMode: mode,
      localityMode: optimizationAttempt.localityMode ?? options?.localityMode ?? null,
      stopCount: attemptAudit.stopCount,
      totalDistanceKm: optimizationAttempt.optimized.totalDistance,
      totalTimeMinutes: optimizationAttempt.optimized.totalTime,
      metadata: {
        firstBlockingIssue: firstBlockingReason?.issue ?? null,
        blockingIssue: blockedReason?.issue ?? null,
        correctionAttempts,
        finalIssues: attemptAudit.issues.slice(0, 12),
        routeMetadata: optimizationAttempt.optimized.metadata ?? null,
        geocodingConfidence,
        auditPolicy: optimizationAttempt.auditPolicy,
        routingStrategy: getRoutingStrategy(optimizationAttempt.auditPolicy),
        structuralAuditOnly: optimizationAttempt.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
        coherenceAuditSkipped: optimizationAttempt.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
        operationalStatus: finalOperationalOutcome.status,
        operationalStatusLabel: finalOperationalOutcome.label,
        commerciallySatisfactory: finalOperationalOutcome.commerciallySatisfactory,
        sequenceCoherenceVerified: finalOperationalOutcome.sequenceCoherenceVerified,
        remainingCoherenceIssues: finalOperationalOutcome.remainingCoherenceIssues,
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record route metric:", error);
    });
  }

  const { optimized, audit, auditSource } = optimizationAttempt;
  const osrmRequiredForRoute =
    ENV.osrmRequired && routeStops.length >= ENV.osrmRequiredMinStops;
  if (osrmRequiredForRoute && !optimizationAttempt.usedRoadMetrics) {
    const osrmBlockingReason = {
      issue: audit.issues.find((issue) => issue.type === "osrm_fallback") ?? null,
      message:
        "OSRM obrigatorio indisponivel. A rota foi salva com alerta usando a melhor estimativa disponivel.",
    };

    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_osrm_required_unavailable",
      severity: "warning",
      source: "routes.optimize",
      title: "OSRM obrigatorio indisponivel",
      message: osrmBlockingReason.message,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        auditSource,
        status: audit.status,
        score: audit.score,
        issueCount: audit.issueCount,
        totalDistanceKm: audit.totalDistanceKm,
        osrmRequired: ENV.osrmRequired,
        osrmRequiredMinStops: ENV.osrmRequiredMinStops,
        osrmBaseUrl: ENV.osrmBaseUrl,
        blockingIssue: osrmBlockingReason.issue,
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record required OSRM event:", error);
    });
  }

  if (postOptimizationBlockingReason) {
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_audit_attention_optimization",
      severity: "warning",
      source: "routes.optimize",
      title: "Auditor manteve alerta na otimizacao",
      message: postOptimizationBlockingReason.message,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        auditSource,
        status: audit.status,
        score: audit.score,
        issueCount: audit.issueCount,
        criticalCount: audit.criticalCount,
        warningCount: audit.warningCount,
        totalDistanceKm: audit.totalDistanceKm,
        maxLegKm: audit.maxLegKm,
        blockingIssue: postOptimizationBlockingReason.issue,
        issues: audit.issues.slice(0, 8),
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record route audit attention event:", error);
    });

    postOptimizationBlockingReason = null;
  }

  const dbSaveStartedAt = Date.now();
  await db.updateRoute(routeId, userId, {
    totalDistance: optimized.totalDistance,
    totalTime: optimized.totalTime,
    status: "optimized",
  });

  await db.deleteRouteStops(routeId);
  const updatedStops = optimized.waypoints.map(wp => ({
    address: wp.address || "",
    latitude: wp.latitude,
    longitude: wp.longitude,
    geocodingConfidenceScore: wp.geocodingConfidenceScore,
    geocodingMethod: wp.geocodingMethod as GeocodingMethod | undefined,
    geocodingSuspect: wp.geocodingSuspect,
    sequence: wp.sequence,
    notes: wp.notes,
    sourceProvider: normalizeStopSourceProvider(wp.sourceProvider),
    originalStop: wp.originalStop ?? null,
    isUnsequencedStop: Boolean(wp.isUnsequencedStop),
    metadata: normalizeStopMetadata(wp.metadata),
    commercialDetectionStatus: wp.commercialDetectionStatus ?? "unknown",
    commercialConfidence: Number(wp.commercialConfidence ?? 0),
    commercialPlaceName: wp.commercialPlaceName ?? null,
    commercialCategory: wp.commercialCategory ?? null,
    commercialOpeningHours: wp.commercialOpeningHours ?? null,
    commercialSource: wp.commercialSource ?? null,
    commercialLastCheckedAt: wp.commercialLastCheckedAt ?? null,
  }));
  await db.createStops(routeId, updatedStops);
  runtimeBreakdown.dbSaveMs += Date.now() - dbSaveStartedAt;

  await recordRouteMetricForAttempt(null);

  return {
    ...optimized,
    audit,
    auditSource,
    auditPolicy: optimizationAttempt.auditPolicy,
    routingStrategy: getRoutingStrategy(optimizationAttempt.auditPolicy),
    operationalStatus: finalOperationalOutcome.status,
    operationalStatusLabel: finalOperationalOutcome.label,
    commerciallySatisfactory: finalOperationalOutcome.commerciallySatisfactory,
    sequenceCoherenceVerified: finalOperationalOutcome.sequenceCoherenceVerified,
    remainingCoherenceIssues: finalOperationalOutcome.remainingCoherenceIssues,
  };
}

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});
const registrationSchema = credentialsSchema.extend({
  name: z.string().min(2, "Informe seu nome."),
  phone: z.string().min(8, "Informe um telefone valido.").max(32),
  companyName: z.string().max(255).optional(),
  city: z.string().min(2, "Informe sua cidade.").max(128),
  state: z.string().min(2, "Informe o estado.").max(64),
  vehicleType: z.string().min(2, "Informe o tipo de veiculo.").max(64),
  acceptTerms: z.boolean().refine(value => value === true, {
    message: "Aceite os termos para criar a conta.",
  }),
});
const profileUpdateSchema = z.object({
  name: z.string().min(2, "Informe seu nome.").max(255),
  phone: z.string().min(8, "Informe um telefone valido.").max(32),
  companyName: z.string().max(255).optional(),
  city: z.string().min(2, "Informe sua cidade.").max(128),
  state: z.string().min(2, "Informe o estado.").max(64),
  vehicleType: z.string().min(2, "Informe o tipo de veiculo.").max(64),
  acceptTerms: z.boolean().optional(),
});
const passwordResetRequestSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
});
const routeModeSchema = z.enum(["shortest_distance", "shortest_time", "balanced"]);
const localityModeSchema = z.enum(["balanced", "local", "strict"]);
const eventSeveritySchema = z.enum(["info", "warning", "error", "fatal"]);
const operationalEventSchema = z.object({
  type: z.string().min(1).max(96),
  severity: eventSeveritySchema.default("info"),
  source: z.string().min(1).max(128),
  title: z.string().min(1).max(255),
  message: z.string().max(3000).optional(),
  routeId: z.number().optional(),
  stopId: z.number().optional(),
  runtime: z.string().max(64).optional(),
  url: z.string().max(700).optional(),
  userAgent: z.string().max(700).optional(),
  appVersion: z.string().max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const routeCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  mode: routeModeSchema,
  startLocation: z.string().optional(),
  startLatitude: z.number().optional(),
  startLongitude: z.number().optional(),
  endLocation: z.string().optional(),
  endLatitude: z.number().optional(),
  endLongitude: z.number().optional(),
});
const geocodingMethodSchema = z.enum([
  "exact_address",
  "street_match",
  "neighborhood_match",
  "city_match",
  "approximate_route_cluster",
  "manual_coordinate",
]);

const stopSourceProviderSchema = z.enum(STOP_SOURCE_PROVIDERS);
const stopMetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();

const stopCreateSchema = z.object({
  address: z.string().min(1, "Informe o endereço da parada."),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sequence: z.number(),
  notes: z.string().optional(),
  sourceProvider: stopSourceProviderSchema.optional(),
  originalStop: z.number().nullable().optional(),
  isUnsequencedStop: z.boolean().optional(),
  metadata: stopMetadataSchema,
  geocodingConfidenceScore: z.number().min(0).max(100).optional(),
  geocodingMethod: geocodingMethodSchema.optional(),
  geocodingSuspect: z.boolean().optional(),
});
const stopUpdateSchema = z.object({
  routeId: z.number(),
  stopId: z.number(),
  address: z.string().min(1, "Informe o endereço da parada."),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  sequence: z.number().optional(),
  notes: z.string().nullable().optional(),
  sourceProvider: stopSourceProviderSchema.optional(),
  originalStop: z.number().nullable().optional(),
  isUnsequencedStop: z.boolean().nullable().optional(),
  metadata: stopMetadataSchema,
  geocodingConfidenceScore: z.number().min(0).max(100).optional(),
  geocodingMethod: geocodingMethodSchema.optional(),
  geocodingSuspect: z.boolean().optional(),
});

function sanitizeUser<T extends User | null | undefined>(user: T) {
  if (!user) return null;

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function recordOperationalEvent(
  userId: number | null | undefined,
  input: z.infer<typeof operationalEventSchema>
) {
  try {
    return await db.createOperationalEvent({
      ...input,
      userId: userId ?? null,
      routeId: input.routeId ?? null,
      stopId: input.stopId ?? null,
      message: input.message ?? null,
      runtime: input.runtime ?? null,
      url: input.url ?? null,
      userAgent: input.userAgent ?? null,
      appVersion: input.appVersion ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.warn("[OperationalEvent] Failed to record event:", error);
    return null;
  }
}

async function recordRouteAuditEvent(
  userId: number,
  routeId: number,
  audit: RouteAuditReport | undefined,
  source: string | undefined
) {
  if (!audit || audit.status === "approved") return;

  const firstIssue = audit.issues[0];
  await recordOperationalEvent(userId, {
    type: "route_audit_flagged",
    severity: audit.status === "critical" ? "error" : "warning",
    source: "routes.audit",
    title:
      audit.status === "critical"
        ? "Auditor reprovou a sequência"
        : "Auditor encontrou pontos de atenção",
    routeId,
    message: firstIssue?.message || "A rota tem sinais de sequência incoerente.",
    metadata: {
      auditSource: source,
      status: audit.status,
      score: audit.score,
      issueCount: audit.issueCount,
      criticalCount: audit.criticalCount,
      warningCount: audit.warningCount,
      totalDistanceKm: audit.totalDistanceKm,
      maxLegKm: audit.maxLegKm,
      issues: audit.issues.slice(0, 8),
    },
  });
}

function routeStopLimitMessage(stopCount: number) {
  return `Esta rota tem ${stopCount} paradas e excede o limite comercial atual de testes de ${ENV.maxRouteStops} paradas por rota. Volumes maiores serão liberados gradualmente conforme a evolução da infraestrutura. Divida a tabela em rotas menores.`;
}

async function assertRouteStopLimit(
  userId: number,
  stopCount: number,
  source: string,
  routeId?: number
) {
  if (stopCount <= ENV.maxRouteStops) return;

  await recordOperationalEvent(userId, {
    type: "route_stop_limit_exceeded",
    severity: "warning",
    source,
    title: `Limite de ${ENV.maxRouteStops} paradas excedido`,
    routeId,
    message: routeStopLimitMessage(stopCount),
    metadata: {
      stopCount,
      maxRouteStops: ENV.maxRouteStops,
    },
  });

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: routeStopLimitMessage(stopCount),
  });
}

async function setPasswordSession(
  ctx: any,
  openId: string,
  name: string | null,
  email: string | null
) {
  const sessionToken = await sdk.createSessionToken(openId, {
    name: name || "",
    email,
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS,
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (
        opts.ctx.user?.openId &&
        typeof opts.ctx.res.cookie === "function"
      ) {
        await setPasswordSession(
          opts.ctx,
          opts.ctx.user.openId,
          opts.ctx.user.name,
          opts.ctx.user.email
        );
      }

      return sanitizeUser(opts.ctx.user);
    }),
    login: publicProcedure.input(credentialsSchema)
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const user = await db.getUserByEmail(email);
        const isValidPassword = await verifyPassword(
          input.password,
          user?.passwordHash
        );

        if (!user || !isValidPassword) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha inválidos.",
          });
        }

        await db.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });
        await recordOperationalEvent(user.id, {
          type: "user_login",
          severity: "info",
          source: "auth.login",
          title: "Login realizado",
          message: user.email ?? undefined,
        });
        await setPasswordSession(
          ctx,
          user.openId,
          user.name,
          user.email
        );

        return {
          ...sanitizeUser((await db.getUserByOpenId(user.openId)) ?? user),
        };
      }),
    register: publicProcedure.input(registrationSchema)
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const existingUser = await db.getUserByEmail(email);

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ja existe uma conta com este e-mail.",
          });
        }

        const role = isAdminEmail(email, ENV.adminEmails) ? "admin" : "user";
        const passwordHash = await hashPassword(input.password);
        const openId = buildPasswordOpenId(email);
        const user = await db.createPasswordUser({
          openId,
          name: input.name.trim(),
          email,
          passwordHash,
          role,
          phone: input.phone.trim(),
          companyName: input.companyName?.trim() || null,
          city: input.city.trim(),
          state: input.state.trim(),
          vehicleType: input.vehicleType.trim(),
          acceptedTermsAt: new Date(),
        });

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível criar a conta.",
          });
        }

        await setPasswordSession(
          ctx,
          user.openId,
          user.name,
          user.email
        );
        await recordOperationalEvent(user.id, {
          type: "user_registered",
          severity: "info",
          source: "auth.register",
          title: "Novo cadastro",
          message: user.email ?? undefined,
          metadata: {
            role,
            city: input.city.trim(),
            state: input.state.trim(),
            vehicleType: input.vehicleType.trim(),
            companyName: input.companyName?.trim() || null,
          },
        });
        return {
          ...sanitizeUser(user),
        };
      }),
    requestPasswordReset: publicProcedure.input(passwordResetRequestSchema)
      .mutation(async ({ input }) => {
        const email = normalizeEmail(input.email);
        const allowed = isAdminEmail(email, ENV.adminEmails);

        if (allowed) {
          const user = await db.getUserByEmail(email);
          await recordOperationalEvent(user?.id ?? null, {
            type: "admin_password_reset_requested",
            severity: "warning",
            source: "auth.passwordReset",
            title: "Reset de senha administrativa solicitado",
            message: email,
            metadata: {
              allowed,
              instructions:
                "Somente os e-mails administrativos autorizados podem solicitar reset. Execute redefinicao operacional segura pelo banco/CLI.",
            },
          });
        }

        return {
          success: true,
          message:
            "Se o e-mail for autorizado para administracao, a solicitacao de reset sera registrada para tratamento seguro.",
        };
      }),
    updateProfile: protectedProcedure.input(profileUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const existingAcceptedTerms = Boolean(ctx.user.acceptedTermsAt);
        if (!existingAcceptedTerms && input.acceptTerms !== true) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Aceite os termos para atualizar o cadastro.",
          });
        }

        const updatedUser = await db.updateUserProfile(ctx.user.id, {
          name: input.name.trim(),
          phone: input.phone.trim(),
          companyName: input.companyName?.trim() || null,
          city: input.city.trim(),
          state: input.state.trim(),
          vehicleType: input.vehicleType.trim(),
          acceptedTermsAt: existingAcceptedTerms
            ? ctx.user.acceptedTermsAt
            : new Date(),
        });

        if (!updatedUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Usuario nao encontrado.",
          });
        }

        await recordOperationalEvent(ctx.user.id, {
          type: "user_profile_updated",
          severity: "info",
          source: "auth.updateProfile",
          title: "Cadastro atualizado",
          message: updatedUser.email ?? undefined,
          metadata: {
            city: input.city.trim(),
            state: input.state.trim(),
            vehicleType: input.vehicleType.trim(),
            companyName: input.companyName?.trim() || null,
          },
        });

        return sanitizeUser(updatedUser);
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  events: router({
    report: publicProcedure.input(operationalEventSchema)
      .mutation(async ({ ctx, input }) => {
        await recordOperationalEvent(ctx.user?.id ?? null, input);
        return { success: true };
      }),
  }),

  admin: router({
    dashboard: adminProcedure.query(async () => {
      const dashboard = await db.getAdminOperationalDashboard();
      const optimizationQueue = await getOptimizationQueueHealth();
      const optimizationWorkers = await getOptimizationWorkersDashboard();
      const queueIntegrity = await db.getQueueIntegrityDashboard();
      const disasterReadiness = await db.getDisasterReadinessDashboard();
      const performanceBenchmarks = await db.getPerformanceBenchmarkDashboard();
      const multiVehicleReadiness = await getMultiVehicleReadinessDashboard();
      const goLive500 = await db.getGoLive500Dashboard();
      return {
        ...dashboard,
        optimizationQueue,
        optimizationWorkers,
        queueIntegrity,
        disasterReadiness,
        performanceBenchmarks,
        multiVehicleReadiness,
        goLive500,
      };
    }),
    refreshDashboard: adminProcedure.mutation(() => db.refreshAdminDashboardMetrics()),
    routeMetrics: adminProcedure.input(z.object({
      days: z.number().min(1).max(365).default(30),
    }))
      .query(({ input }) => db.getRouteMetricsDashboard(input.days)),
    geocodingImpact: adminProcedure.query(() => db.getGeocodingImpactDashboard()),
    geocodingExecutiveReport: adminProcedure.query(() =>
      db.getGeocodingExecutiveReport()
    ),
    operationExecutionReport: adminProcedure.query(() =>
      db.getOperationExecutionReport()
    ),
    workers: adminProcedure.query(() => getOptimizationWorkersDashboard()),
    queueIntegrity: adminProcedure.query(() => db.getQueueIntegrityDashboard()),
    disasterReadiness: adminProcedure.query(() => db.getDisasterReadinessDashboard()),
    performanceBenchmarks: adminProcedure.query(() =>
      db.getPerformanceBenchmarkDashboard()
    ),
    goLive500: adminProcedure.query(() => db.getGoLive500Dashboard()),
    multiVehicleReadiness: adminProcedure.query(() =>
      getMultiVehicleReadinessDashboard()
    ),
    events: adminProcedure.input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(30),
    }))
      .query(({ input }) => db.getAdminDashboardEvents(input.page, input.limit)),
    cleanupE2eUsers: adminProcedure.mutation(async ({ ctx }) => {
      const result = await db.cleanupE2eTestUsers();
      await recordOperationalEvent(ctx.user.id, {
        type: "admin_cleanup_e2e_users",
        severity: "info",
        source: "admin.cleanup",
        title: "Usuarios E2E removidos",
        message: `${result.deletedCount} usuario(s) de teste removido(s).`,
        metadata: {
          deletedCount: result.deletedCount,
          deletedUsers: result.deletedUsers,
        },
      });
      return result;
    }),
  }),

  routes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const routes = await db.getUserRoutes(ctx.user.id);
      return Promise.all(
        routes.map(async (route: any) => {
          const latestOptimizationEvent = await db.getLatestRouteOptimizationEvent(
            route.id,
            ctx.user.id
          );
          const latestMetadata = isLatestOptimizationContextFresh(
            route,
            latestOptimizationEvent
          )
            ? latestOptimizationEvent?.metadata
            : undefined;
          return {
            ...route,
            ...getRouteOperationalOutcomeFromMetadata(route, latestMetadata),
          };
        })
      );
    }),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const route = await db.getRouteById(input.id, ctx.user.id);
        if (!route) return null;
        const latestOptimizationEvent = await db.getLatestRouteOptimizationEvent(
          input.id,
          ctx.user.id
        );
        const latestMetadata = isLatestOptimizationContextFresh(
          route,
          latestOptimizationEvent
        )
          ? latestOptimizationEvent?.metadata
          : undefined;
        return {
          ...route,
          ...getRouteOperationalOutcomeFromMetadata(route, latestMetadata),
        };
      }),
    audit: protectedProcedure.input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const route = await requireUserRoute(input.id, ctx.user.id);
        const routeStops = await db.getRouteStops(input.id);
        const latestOptimizationEvent = await db.getLatestRouteOptimizationEvent(
          input.id,
          ctx.user.id
        );
        const hasFreshOptimizationContext = isLatestOptimizationContextFresh(
          route,
          latestOptimizationEvent
        );
        const latestMetadata = hasFreshOptimizationContext
          ? latestOptimizationEvent?.metadata
          : undefined;
        const auditSource = readStringMetadata(latestMetadata, "auditSource");
        const auditPolicy =
          readStringMetadata(latestMetadata, "auditPolicy") ??
          (isShopeeStopPreservedRoute(routeStops, readBooleanMetadata(latestMetadata, "respectInputSequence"))
            ? SHOPEE_STOP_AUDIT_POLICY
            : null);
        const usedRoadMetrics = readBooleanMetadata(
          latestMetadata,
          "auditUsedRoadMetrics"
        ) ?? (auditSource ? auditSource.startsWith("road-") : undefined);
        const respectInputSequence = readBooleanMetadata(
          latestMetadata,
          "respectInputSequence"
        );
        const requireStartLocation = readBooleanMetadata(
          latestMetadata,
          "auditRequireStartLocation"
        ) ?? false;
        const startLocation = toOptionalLocation(
          route.startLocation,
          route.startLatitude,
          route.startLongitude
        );

        const report = applyShopeeStopAuditPolicy(
          auditRouteSequence(
            routeStopsToAuditableStops(routeStops),
            {
              startLocation,
              requireStartLocation,
              actualTotalDistanceKm: Number(route.totalDistance ?? 0),
              usedRoadMetrics,
              respectInputSequence,
            }
          ),
          auditPolicy
        );
        const operationalOutcome = getRouteOperationalOutcome(report, auditPolicy, {
          usedRoadMetrics,
        });

        return {
          ...report,
          context: {
            auditSource: auditSource ?? null,
            usedRoadMetrics: usedRoadMetrics ?? null,
            respectInputSequence: respectInputSequence ?? null,
            requireStartLocation,
            auditPolicy,
            routingStrategy: getRoutingStrategy(auditPolicy),
            structuralAuditOnly: auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
            coherenceAuditSkipped: auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
            operationalStatus: operationalOutcome.status,
            operationalStatusLabel: operationalOutcome.label,
            commerciallySatisfactory: operationalOutcome.commerciallySatisfactory,
            sequenceCoherenceVerified: operationalOutcome.sequenceCoherenceVerified,
            remainingCoherenceIssues: operationalOutcome.remainingCoherenceIssues,
            lastOptimizationEventId: latestOptimizationEvent?.id ?? null,
            staleOptimizationContext: !hasFreshOptimizationContext && Boolean(latestOptimizationEvent),
          },
        };
      }),
    create: protectedProcedure.input(routeCreateSchema)
      .mutation(async ({ ctx, input }) => {
        const route = await db.createRoute(ctx.user.id, input);
        if (route) {
          await recordOperationalEvent(ctx.user.id, {
            type: "route_created",
            severity: "info",
            source: "routes.create",
            title: "Rota criada",
            routeId: route.id,
            message: route.name,
            metadata: { mode: input.mode },
          });
        }
        return route;
      }),
    createAndOptimize: protectedProcedure.input(routeCreateSchema.extend({
      stops: z.array(stopCreateSchema).min(2),
      respectInputSequence: z.boolean().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        const { stops, respectInputSequence, ...routeInput } = input;
        await assertRouteStopLimit(
          ctx.user.id,
          stops.length,
          "routes.createAndOptimize"
        );
        const route = await db.createRoute(ctx.user.id, routeInput);

        if (!route) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível criar a rota.",
          });
        }

        try {
          await db.createStops(route.id, stops);
          const optimized = await optimizeUserRoute(route.id, ctx.user.id, input.mode, {
            respectInputSequence,
          });
          const updatedRoute = await db.getRouteById(route.id, ctx.user.id);
          await recordOperationalEvent(ctx.user.id, {
            type: "route_optimized",
            severity: optimized.commerciallySatisfactory ? "info" : "warning",
            source: "routes.createAndOptimize",
            title: optimized.operationalStatusLabel ?? "Rota criada e otimizada",
            routeId: route.id,
            message: route.name,
            metadata: {
              stops: stops.length,
              mode: input.mode,
              respectInputSequence: Boolean(respectInputSequence),
              totalDistance: optimized.totalDistance,
              totalTime: optimized.totalTime,
              auditSource: optimized.auditSource,
              auditStatus: optimized.audit?.status,
              auditScore: optimized.audit?.score,
              auditIssueCount: optimized.audit?.issueCount,
              auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
              auditRequireStartLocation: true,
              auditPolicy: optimized.auditPolicy ?? null,
              routingStrategy: getRoutingStrategy(optimized.auditPolicy ?? null),
              structuralAuditOnly: optimized.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
              coherenceAuditSkipped: optimized.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
              operationalStatus: optimized.operationalStatus,
              operationalStatusLabel: optimized.operationalStatusLabel,
              commerciallySatisfactory: optimized.commerciallySatisfactory,
              sequenceCoherenceVerified: optimized.sequenceCoherenceVerified,
              remainingCoherenceIssues: optimized.remainingCoherenceIssues,
            },
          });
          await recordRouteAuditEvent(
            ctx.user.id,
            route.id,
            optimized.audit ?? undefined,
            optimized.auditSource
          );

          return {
            route: updatedRoute ?? route,
            optimization: optimized,
          };
        } catch (error) {
          console.error("[Routes] Optimization failed after route creation:", error);
          await recordOperationalEvent(ctx.user.id, {
            type: "route_optimization_failed",
            severity: "error",
            source: "routes.createAndOptimize",
            title: "Falha ao otimizar rota",
            routeId: route.id,
            message: error instanceof Error ? error.message : "Erro desconhecido",
            metadata: {
              stops: stops.length,
              mode: input.mode,
              respectInputSequence: Boolean(respectInputSequence),
              routingStrategy: respectInputSequence
                ? ROUTING_STRATEGY_SHOPEE_STOP
                : ROUTING_STRATEGY_OPTIMIZED,
            },
          });
          await db.updateRoute(route.id, ctx.user.id, {
            status: "draft",
            totalDistance: 0,
            totalTime: 0,
          });
          const savedRoute = await db.getRouteById(route.id, ctx.user.id);

          return {
            route: savedRoute ?? route,
            optimization: null,
            warning:
              error instanceof Error
                ? `A rota foi salva como rascunho, mas não foi possível otimizar agora. ${error.message}`
                : "A rota foi salva como rascunho, mas não foi possível otimizar agora. Abra a rota e tente otimizar novamente.",
          };
        }
      }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      mode: routeModeSchema.optional(),
      totalDistance: z.number().optional(),
      totalTime: z.number().optional(),
      status: z.enum(["draft", "optimized", "completed", "cancelled"]).optional(),
      startLocation: z.string().nullable().optional(),
      startLatitude: z.number().nullable().optional(),
      startLongitude: z.number().nullable().optional(),
      endLocation: z.string().nullable().optional(),
      endLatitude: z.number().nullable().optional(),
      endLongitude: z.number().nullable().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateRoute(id, ctx.user.id, data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) =>
        db.deleteRoute(input.id, ctx.user.id)
      ),
    optimize: protectedProcedure.input(z.object({
      id: z.number(),
      mode: routeModeSchema.optional(),
      localityMode: localityModeSchema.optional(),
      startLatitude: z.number().optional(),
      startLongitude: z.number().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        const route = await requireUserRoute(input.id, ctx.user.id);
        const currentStops = await db.getRouteStops(input.id);
        const preserveShopeeStopSequence = await shouldPreserveShopeeStopSequenceForOptimization(
          route,
          ctx.user.id,
          currentStops
        );
        await assertRouteStopLimit(
          ctx.user.id,
          currentStops.length,
          "routes.optimize",
          input.id
        );
        const startLocation =
          Number.isFinite(input.startLatitude) && Number.isFinite(input.startLongitude)
            ? {
                latitude: Number(input.startLatitude),
                longitude: Number(input.startLongitude),
                address: "Local atual do motorista",
              }
            : undefined;

        const optimized = await optimizeUserRoute(input.id, ctx.user.id, input.mode, {
          startLocation,
          localityMode: input.localityMode,
          respectInputSequence: preserveShopeeStopSequence,
        });
        await recordOperationalEvent(ctx.user.id, {
          type: input.localityMode === "strict" ? "route_user_requested_better_sequence" : "route_reoptimized",
          severity: input.localityMode === "strict" || !optimized.commerciallySatisfactory ? "warning" : "info",
          source: "routes.optimize",
          title: input.localityMode === "strict" ? "Usuário pediu sequência melhor" : "Rota reotimizada",
          routeId: input.id,
          metadata: {
            mode: input.mode,
            localityMode: input.localityMode,
            respectInputSequence: preserveShopeeStopSequence,
            totalDistance: optimized.totalDistance,
            totalTime: optimized.totalTime,
            startedFromCurrentLocation: Boolean(startLocation),
            auditSource: optimized.auditSource,
            auditStatus: optimized.audit?.status,
            auditScore: optimized.audit?.score,
            auditIssueCount: optimized.audit?.issueCount,
            auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
            auditRequireStartLocation: true,
            auditPolicy: optimized.auditPolicy ?? null,
            routingStrategy: getRoutingStrategy(optimized.auditPolicy ?? null),
            structuralAuditOnly: optimized.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
            coherenceAuditSkipped: optimized.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
            operationalStatus: optimized.operationalStatus,
            operationalStatusLabel: optimized.operationalStatusLabel,
            commerciallySatisfactory: optimized.commerciallySatisfactory,
            sequenceCoherenceVerified: optimized.sequenceCoherenceVerified,
            remainingCoherenceIssues: optimized.remainingCoherenceIssues,
          },
        });
        await recordRouteAuditEvent(
          ctx.user.id,
          input.id,
          optimized.audit ?? undefined,
          optimized.auditSource
        );
        return optimized;
      }),
    optimizeRemaining: protectedProcedure.input(z.object({
      id: z.number(),
      mode: routeModeSchema.optional(),
      excludeStopIds: z.array(z.number()).default([]),
      localityMode: localityModeSchema.optional(),
      startLatitude: z.number().optional(),
      startLongitude: z.number().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        const route = await requireUserRoute(input.id, ctx.user.id);
        const currentStops = await db.getRouteStops(input.id);
        const preserveShopeeStopSequence = await shouldPreserveShopeeStopSequenceForOptimization(
          route,
          ctx.user.id,
          currentStops
        );
        await assertRouteStopLimit(
          ctx.user.id,
          currentStops.length,
          "routes.optimizeRemaining",
          input.id
        );
        const hasStartLocation =
          Number.isFinite(input.startLatitude) && Number.isFinite(input.startLongitude);

        if (input.excludeStopIds.length === 0 && !hasStartLocation) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhuma parada concluída foi informada para deixar fora.",
          });
        }

        const startLocation =
          hasStartLocation
            ? {
                latitude: Number(input.startLatitude),
                longitude: Number(input.startLongitude),
                address: "Local atual do motorista",
              }
            : undefined;

        const optimized = await optimizeUserRoute(input.id, ctx.user.id, input.mode, {
          excludeStopIds: input.excludeStopIds,
          startLocation,
          localityMode: input.localityMode,
          respectInputSequence: preserveShopeeStopSequence,
        });
        await recordOperationalEvent(ctx.user.id, {
          type: "route_remaining_reoptimized",
          severity: optimized.commerciallySatisfactory ? "info" : "warning",
          source: "routes.optimizeRemaining",
          title: optimized.operationalStatusLabel ?? "Restantes reotimizadas",
          routeId: input.id,
          metadata: {
            excludedStops: input.excludeStopIds.length,
            localityMode: input.localityMode,
            respectInputSequence: preserveShopeeStopSequence,
            totalDistance: optimized.totalDistance,
            totalTime: optimized.totalTime,
            startedFromCurrentLocation: Boolean(startLocation),
            auditSource: optimized.auditSource,
            auditStatus: optimized.audit?.status,
            auditScore: optimized.audit?.score,
            auditIssueCount: optimized.audit?.issueCount,
            auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
            auditRequireStartLocation: true,
            auditPolicy: optimized.auditPolicy ?? null,
            routingStrategy: getRoutingStrategy(optimized.auditPolicy ?? null),
            structuralAuditOnly: optimized.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
            coherenceAuditSkipped: optimized.auditPolicy === SHOPEE_STOP_AUDIT_POLICY,
            operationalStatus: optimized.operationalStatus,
            operationalStatusLabel: optimized.operationalStatusLabel,
            commerciallySatisfactory: optimized.commerciallySatisfactory,
            sequenceCoherenceVerified: optimized.sequenceCoherenceVerified,
            remainingCoherenceIssues: optimized.remainingCoherenceIssues,
          },
        });
        await recordRouteAuditEvent(
          ctx.user.id,
          input.id,
          optimized.audit ?? undefined,
          optimized.auditSource
        );
        return optimized;
      }),
  }),

  stops: router({
    list: protectedProcedure.input(z.object({ routeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.getRouteStops(input.routeId);
      }),
    create: protectedProcedure.input(z.object({
      routeId: z.number(),
      stops: z.array(stopCreateSchema),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        const currentStops = await db.getRouteStops(input.routeId);
        await assertRouteStopLimit(
          ctx.user.id,
          currentStops.length + input.stops.length,
          "stops.create",
          input.routeId
        );
        const createdStops = await db.createStops(input.routeId, input.stops);
        await db.updateRoute(input.routeId, ctx.user.id, { status: "draft" });
        return createdStops;
      }),
    update: protectedProcedure.input(stopUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        const currentStops = await db.getRouteStops(input.routeId);
        const currentStopRaw = currentStops.find(
          (stop: any) => Number(stop.id) === Number(input.stopId)
        );
        const currentStop = currentStopRaw ? { ...currentStopRaw } : null;
        const updatedStop = await db.updateStop(input.routeId, input.stopId, {
          address: input.address.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          sequence: input.sequence,
          notes: input.notes?.trim() || null,
          sourceProvider: input.sourceProvider,
          originalStop: input.originalStop,
          isUnsequencedStop: input.isUnsequencedStop,
          metadata: normalizeStopMetadata(input.metadata),
          geocodingConfidenceScore: input.geocodingConfidenceScore,
          geocodingMethod: input.geocodingMethod,
          geocodingSuspect: input.geocodingSuspect,
        });

        if (!updatedStop) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parada não encontrada.",
          });
        }

        await db.updateRoute(input.routeId, ctx.user.id, { status: "draft" });

        if (currentStop) {
          const previousAddress = String(currentStop.address || "").trim();
          const nextAddress = String(updatedStop.address || "").trim();
          const previousLatitude = Number(currentStop.latitude);
          const previousLongitude = Number(currentStop.longitude);
          const nextLatitude = Number(updatedStop.latitude);
          const nextLongitude = Number(updatedStop.longitude);
          const addressChanged = previousAddress !== nextAddress;
          const coordinatesChanged =
            Number.isFinite(previousLatitude) &&
            Number.isFinite(previousLongitude) &&
            Number.isFinite(nextLatitude) &&
            Number.isFinite(nextLongitude) &&
            (Math.abs(previousLatitude - nextLatitude) > 0.000001 ||
              Math.abs(previousLongitude - nextLongitude) > 0.000001);

          if (addressChanged || coordinatesChanged) {
            await db.createAddressCorrection({
              userId: ctx.user.id,
              routeId: input.routeId,
              stopId: input.stopId,
              originalAddress: previousAddress || nextAddress,
              correctedAddress: nextAddress || previousAddress,
              latitude: Number.isFinite(nextLatitude) ? nextLatitude : null,
              longitude: Number.isFinite(nextLongitude) ? nextLongitude : null,
            });
            await db.createOperationalEvent({
              userId: ctx.user.id,
              routeId: input.routeId,
              stopId: input.stopId,
              type: "geocoding_manual_correction",
              severity: "info",
              source: "stops.update",
              title: "Correcao manual de endereco",
              message: "Parada editada manualmente pelo usuario.",
              metadata: {
                provider_used: "manual",
                addressChanged,
                coordinatesChanged,
                geocodingConfidenceScore:
                  updatedStop.geocodingConfidenceScore ?? null,
                geocodingMethod: updatedStop.geocodingMethod ?? null,
              },
            });
          }
        }

        return updatedStop;
      }),
    delete: protectedProcedure.input(z.object({
      routeId: z.number(),
      stopId: z.number(),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        const deleted = await db.deleteStop(input.routeId, input.stopId);

        if (!deleted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parada não encontrada.",
          });
        }

        await db.updateRoute(input.routeId, ctx.user.id, { status: "draft" });
        return { success: true };
      }),
    detectCommercial: protectedProcedure.input(z.object({
      routeId: z.number(),
      stopId: z.number(),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        const routeStops = await db.getRouteStops(input.routeId);
        const stop = routeStops.find(
          (item: any) => Number(item.id) === Number(input.stopId)
        );

        if (!stop) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parada nao encontrada.",
          });
        }

        const latitude = Number(stop.latitude);
        const longitude = Number(stop.longitude);
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          (latitude === 0 && longitude === 0)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parada sem coordenadas validas para consulta comercial.",
          });
        }

        const detection = await detectCommercialAtLocation(latitude, longitude);
        const updatedStop = await db.updateStop(input.routeId, input.stopId, {
          commercialDetectionStatus: detection.commercialDetectionStatus,
          commercialConfidence: detection.commercialConfidence,
          commercialPlaceName: detection.commercialPlaceName,
          commercialCategory: detection.commercialCategory,
          commercialOpeningHours: detection.commercialOpeningHours,
          commercialSource: detection.commercialSource,
          commercialLastCheckedAt: detection.commercialLastCheckedAt,
        });
        const eta = estimateEtaForStop(routeStops, input.stopId);
        const etaAlert = buildCommercialEtaAlert(detection, eta);

        await db.createOperationalEvent({
          userId: ctx.user.id,
          routeId: input.routeId,
          stopId: input.stopId,
          type: "commercial_detection_checked",
          severity:
            etaAlert.severity === "danger"
              ? "warning"
              : detection.commercialDetectionStatus === "unknown"
                ? "info"
                : "info",
          source: "stops.detectCommercial",
          title: "Consulta de estabelecimento no local",
          message:
            detection.commercialDetectionStatus === "unknown"
              ? "Nenhuma evidencia comercial encontrada no local."
              : "Evidencia comercial consultada por coordenadas.",
          metadata: {
            commercialDetectionStatus: detection.commercialDetectionStatus,
            commercialConfidence: detection.commercialConfidence,
            commercialPlaceName: detection.commercialPlaceName,
            commercialCategory: detection.commercialCategory,
            commercialOpeningHours: detection.commercialOpeningHours,
            commercialSource: detection.commercialSource,
            etaAlert,
          },
        }).catch((error) => {
          console.warn("[CommercialDetection] Failed to record event:", error);
        });

        return {
          stop: updatedStop,
          detection,
          etaAlert,
        };
      }),
  }),

  analytics: router({
    stats: protectedProcedure.input(z.object({ days: z.number().default(30) }))
      .query(({ ctx, input }) =>
        db.getUserStats(ctx.user.id, input.days)
      ),
    timeline: protectedProcedure.input(z.object({ days: z.number().default(30) }))
      .query(({ ctx, input }) =>
        db.getRouteStatsOverTime(ctx.user.id, input.days)
      ),
  }),

  chat: router({
    history: protectedProcedure.input(z.object({ routeId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (input.routeId !== undefined) {
          await requireUserRoute(input.routeId, ctx.user.id);
        }

        return db.getUserChatHistory(ctx.user.id, input.routeId);
      }),
    send: protectedProcedure.input(z.object({
      routeId: z.number().optional(),
      content: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        if (input.routeId !== undefined) {
          await requireUserRoute(input.routeId, ctx.user.id);
        }

        return db.addChatMessage(ctx.user.id, {
          routeId: input.routeId,
          role: "user",
          content: input.content,
        });
      }),
    respond: protectedProcedure.input(z.object({
      routeId: z.number().optional(),
      content: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        if (input.routeId !== undefined) {
          await requireUserRoute(input.routeId, ctx.user.id);
        }

        const history = await db.getUserChatHistory(ctx.user.id, input.routeId);
        const previousMessages = formatChatHistory(history);

        const response = await chatWithLLM(
          ctx.user.id,
          input.content,
          input.routeId,
          previousMessages
        );

        await db.addChatMessage(ctx.user.id, {
          routeId: input.routeId,
          role: "user",
          content: input.content,
        });

        await db.addChatMessage(ctx.user.id, {
          routeId: input.routeId,
          role: "assistant",
          content: response,
        });

        return response;
      }),
  }),

  imile: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const integration = await db.getUserIntegration(ctx.user.id, IMILE_PROVIDER);
      const overrides = integration ? await getUserImileOverrides(ctx.user.id) : undefined;
      return {
        ...getImileConnectionStatus(overrides),
        userCredentialConfigured: Boolean(integration),
      };
    }),
    credential: protectedProcedure.query(async ({ ctx }) => {
      const integration = await db.getUserIntegration(ctx.user.id, IMILE_PROVIDER);

      return {
        configured: Boolean(integration),
        label: integration?.label ?? "",
        baseUrl: integration?.baseUrl ?? "",
        fallbackBaseUrls: integration?.fallbackBaseUrls ?? "",
        deliveriesPath: integration?.deliveriesPath ?? "",
        authHeader: integration?.authHeader ?? "Authorization",
        country: integration?.country ?? "BRA",
        lang: integration?.lang ?? "pt-BR",
        resourceCode: integration?.resourceCode ?? "BRA",
        timezone: integration?.timezone ?? "America/Sao_Paulo",
        hubCode: integration?.hubCode ?? "",
        appVersion: integration?.appVersion ?? "2.2.78",
        sourceName: integration?.sourceName ?? "REDeliveryApp",
      };
    }),
    saveCredential: protectedProcedure.input(imileCredentialInput)
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getUserIntegration(ctx.user.id, IMILE_PROVIDER);
        const authToken = input.authToken.trim();
        const authTokenEncrypted = authToken
          ? encryptIntegrationSecret(authToken)
          : existing?.authTokenEncrypted;

        if (!authTokenEncrypted) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe o token/API key do Rider Delivery.",
          });
        }

        await db.upsertUserIntegration(ctx.user.id, IMILE_PROVIDER, {
          label: cleanText(input.label) ?? "Rider Delivery",
          baseUrl: cleanText(input.baseUrl),
          fallbackBaseUrls: cleanText(input.fallbackBaseUrls),
          deliveriesPath: cleanText(input.deliveriesPath),
          authHeader: cleanText(input.authHeader) ?? "Authorization",
          authTokenEncrypted,
          country: cleanText(input.country) ?? "BRA",
          lang: cleanText(input.lang) ?? "pt-BR",
          resourceCode: cleanText(input.resourceCode) ?? "BRA",
          timezone: cleanText(input.timezone) ?? "America/Sao_Paulo",
          hubCode: cleanText(input.hubCode),
          appVersion: cleanText(input.appVersion) ?? "2.2.78",
          sourceName: cleanText(input.sourceName) ?? "REDeliveryApp",
          isActive: true,
        });

        return { configured: true };
      }),
    deleteCredential: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteUserIntegration(ctx.user.id, IMILE_PROVIDER);
      return { configured: false };
    }),
    deliveries: protectedProcedure.input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      status: z.string().optional(),
    }))
      .query(async ({ ctx, input }) => {
        const overrides = await getUserImileOverrides(ctx.user.id);
        return fetchImileDeliveries(input, overrides);
      }),
  }),

  schedules: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserSchedules(ctx.user.id)
    ),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(({ ctx, input }) =>
        db.getScheduleById(input.id, ctx.user.id)
      ),
    create: protectedProcedure.input(z.object({
      routeId: z.number(),
      recurrenceType: z.enum(["once", "daily", "weekly"]),
      scheduledDate: z.date(),
      scheduledTime: z.string().optional(),
      daysOfWeek: z.string().optional(),
      nextExecution: z.date().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.createSchedule(ctx.user.id, input);
      }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      isActive: z.boolean().optional(),
      nextExecution: z.date().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateSchedule(id, ctx.user.id, data);
      }),
  }),

  history: router({
    list: protectedProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
      .query(({ ctx, input }) =>
        db.getUserRouteHistory(ctx.user.id, input.limit, input.offset)
      ),
    getByRoute: protectedProcedure.input(z.object({ routeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.getRouteHistory(input.routeId, ctx.user.id);
      }),
    create: protectedProcedure.input(z.object({
      routeId: z.number(),
      actualDistance: z.number().optional(),
      actualTime: z.number().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.createHistory(ctx.user.id, input);
      }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
      actualDistance: z.number().optional(),
      actualTime: z.number().optional(),
      storageKey: z.string().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateHistory(id, ctx.user.id, data);
      }),
    export: protectedProcedure.input(z.object({
      format: z.enum(["pdf", "csv"]),
      fileName: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        const { exportHistoryToS3 } = await import("./export");
        return exportHistoryToS3(
          ctx.user.id,
          input.format,
          input.fileName,
          ctx.user.name || "Usuário"
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;

