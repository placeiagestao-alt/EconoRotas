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
  estimateTravelTime,
  optimizeRoute,
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

const IMILE_PROVIDER = "imile_rider_delivery";
const BLOCKING_AUDIT_ISSUE_TYPES = new Set([
  "missing_coordinates",
  "invalid_coordinates",
  "empty_address",
  "generic_address",
]);
const DUPLICATE_COORDINATE_BLOCKING_GROUPS = 3;
const MAX_AUDIT_CORRECTION_ATTEMPTS = 20;

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

function isImileStopNotes(notes?: string | null) {
  return /\b(Status iMile|Distancia app|Entregas agrupadas|Destinatario|Telefone)\s*:/i.test(
    notes || ""
  );
}

function buildSequentialImilePackageNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function replaceImilePackageInNotes(notes: string | undefined, sequence: number) {
  if (!isImileStopNotes(notes)) return notes;

  const packageNote = `Pacote: ${buildSequentialImilePackageNumber(sequence)}`;
  const parts = (notes || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(Pacote|STOP)\s*:/i.test(part));

  return [packageNote, ...parts].join(" | ");
}

function routeToAuditableStops(route: OptimizedRoute): AuditableStop[] {
  return route.waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
    sequence: waypoint.sequence,
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
  }));
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

  const routeCrossing = audit.issues.find((issue) => issue.type === "route_crossing");
  if (routeCrossing) {
    return {
      issue: routeCrossing,
      message: `${routeCrossing.title}: ${routeCrossing.message}`,
    };
  }

  const duplicateCoordinateIssues = audit.issues.filter(
    (issue) => issue.type === "duplicate_coordinates"
  );
  if (duplicateCoordinateIssues.length >= DUPLICATE_COORDINATE_BLOCKING_GROUPS) {
    return {
      issue: duplicateCoordinateIssues[0],
      message: `Geocodificacao imprecisa: ${duplicateCoordinateIssues.length} grupos de enderecos cairam no mesmo ponto do mapa.`,
    };
  }

  return null;
}

function isSequenceCoherenceIssue(issue: RouteAuditReport["issues"][number]) {
  return (
    issue.type === "nearby_stop_skipped" ||
    issue.type === "region_revisited" ||
    issue.type === "premature_region_exit" ||
    issue.type === "route_crossing"
  );
}

function countAuditIssues(audit: RouteAuditReport, type: RouteAuditReport["issues"][number]["type"]) {
  return audit.issues.filter((issue) => issue.type === type).length;
}

function countCorrectedIssues(
  correctionAttempts: Array<{ blockingIssue: RouteAuditReport["issues"][number] }>
) {
  return correctionAttempts.length;
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
    return remainingWaypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      address: waypoint.address,
      notes: waypoint.notes,
    }));
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

  return waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
  }));
}

function assertRouteStopsReadyForOptimization(routeStops: any[]) {
  const audit = auditRouteSequence(routeStopsToAuditableStops(routeStops));
  const blockingIssues = getBlockingAuditIssues(audit);
  if (blockingIssues.length === 0) return;

  const firstIssue = blockingIssues[0];
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
  } = {}
): RouteAuditReport {
  return auditRouteSequence(routeToAuditableStops(route), {
    startLocation: options.startLocation,
    requireStartLocation: true,
    actualTotalDistanceKm: route.totalDistance,
    usedRoadMetrics: options.usedRoadMetrics,
    respectInputSequence: options.respectInputSequence,
  });
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

async function optimizeUserRoute(
  routeId: number,
  userId: number,
  requestedMode?: "shortest_distance" | "shortest_time" | "balanced",
  options?: {
    respectInputSequence?: boolean;
    excludeStopIds?: number[];
    startLocation?: Location;
    localityMode?: "balanced" | "local" | "strict";
  }
) {
  const optimizationStartedAt = Date.now();
  const route = await requireUserRoute(routeId, userId);
  const excludedStopIds = new Set(options?.excludeStopIds ?? []);
  const routeStops = (await db.getRouteStops(routeId)).filter(
    (stop: any) => !excludedStopIds.has(Number(stop.id))
  );

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

  assertRouteStopsReadyForOptimization(routeStops);

  const locations: Location[] = routeStops.map((stop: any) => ({
    latitude: parseFloat(String(stop.latitude ?? 0)),
    longitude: parseFloat(String(stop.longitude ?? 0)),
    address: stop.address,
    notes: stop.notes ?? undefined,
  }));

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
  async function buildOptimizationAttempt(attempt: {
    localityMode?: "balanced" | "local" | "strict";
    respectInputSequence?: boolean;
    auditSourceSuffix?: string;
    orderedLocations?: Location[];
  }) {
    const attemptLocations = attempt.orderedLocations ?? locations;
    const roadMetricOptions = {
      startLocation,
      endLocation,
      localityMode: attempt.localityMode,
    };
    let optimizedWithRoadMetrics: OptimizedRoute | null = null;
    let auditSource = "geo-default";

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

    const optimized = optimizedWithRoadMetrics
      ?? (attempt.respectInputSequence
        ? buildSequentialRoute(attemptLocations, roadMetricOptions)
        : attempt.orderedLocations
          ? buildSequentialRoute(attemptLocations, roadMetricOptions)
          : optimizeRoute(attemptLocations, mode, 0, roadMetricOptions));
    const audit = auditOptimizedRoute(optimized, {
      startLocation,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      respectInputSequence: Boolean(attempt.respectInputSequence),
    });

    return {
      optimized,
      audit,
      auditSource: attempt.auditSourceSuffix
        ? `${auditSource}-${attempt.auditSourceSuffix}`
        : auditSource,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      localityMode: attempt.localityMode,
      respectInputSequence: Boolean(attempt.respectInputSequence),
    };
  }

  let optimizationAttempt = await buildOptimizationAttempt({
    localityMode: options?.localityMode,
    respectInputSequence: Boolean(options?.respectInputSequence),
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
  }> = [];

  if (postOptimizationBlockingReason && isSequenceCoherenceIssue(postOptimizationBlockingReason.issue)) {
    const firstBlockingIssue = postOptimizationBlockingReason.issue;
    optimizationAttempt = await buildOptimizationAttempt({
      localityMode: "strict",
      respectInputSequence: false,
      auditSourceSuffix: "audit-corrected",
    });
    postOptimizationBlockingReason = getPostOptimizationBlockingReason(
      optimizationAttempt.audit
    );
    correctionAttempts.push({
      blockingIssue: firstBlockingIssue,
      auditSource: optimizationAttempt.auditSource,
      status: optimizationAttempt.audit.status,
      score: optimizationAttempt.audit.score,
      issueCount: optimizationAttempt.audit.issueCount,
    });

    const seenSignatures = new Set([routeWaypointSignature(optimizationAttempt.optimized)]);
    const maxRepairAttempts = Math.min(
      MAX_AUDIT_CORRECTION_ATTEMPTS,
      Math.max(1, locations.length * 2)
    );

    for (
      let repairAttempt = 0;
      postOptimizationBlockingReason &&
        isSequenceCoherenceIssue(postOptimizationBlockingReason.issue) &&
        repairAttempt < maxRepairAttempts;
      repairAttempt += 1
    ) {
      const repairedLocations = reorderRouteByAuditIssue(
        optimizationAttempt.optimized,
        postOptimizationBlockingReason.issue
      );
      if (!repairedLocations) break;

      const repairedAttempt = await buildOptimizationAttempt({
        localityMode: "strict",
        respectInputSequence: false,
        auditSourceSuffix: `audit-repaired-${repairAttempt + 1}`,
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
      });
      optimizationAttempt = repairedAttempt;
      postOptimizationBlockingReason = getPostOptimizationBlockingReason(
        optimizationAttempt.audit
      );
    }
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
        auditSource: optimizationAttempt.auditSource,
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record route audit correction event:", error);
    });
  }

  async function recordRouteMetricForAttempt(
    blockedReason: ReturnType<typeof getPostOptimizationBlockingReason>
  ) {
    const attemptAudit = optimizationAttempt.audit;
    await db.createRouteMetric({
      userId,
      routeId,
      qualityScore: attemptAudit.score,
      optimizationRuntimeMs: Date.now() - optimizationStartedAt,
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
      issuesDetectedCount: attemptAudit.issueCount + correctionAttempts.length,
      issuesCorrectedCount: blockedReason
        ? 0
        : countCorrectedIssues(correctionAttempts),
      issuesBlockedCount: blockedReason ? 1 : 0,
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
      },
    }).catch((error) => {
      console.warn("[Routes] Failed to record route metric:", error);
    });
  }

  const { optimized, audit, auditSource } = optimizationAttempt;
  if (postOptimizationBlockingReason) {
    await db.createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_audit_blocked_optimization",
      severity: "error",
      source: "routes.optimize",
      title: "Auditor bloqueou a otimizacao",
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
      console.warn("[Routes] Failed to record blocked route audit event:", error);
    });

    await recordRouteMetricForAttempt(postOptimizationBlockingReason);

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Auditor bloqueou a otimizacao. ${postOptimizationBlockingReason.message}`,
    });
  }

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
    sequence: wp.sequence,
    notes: replaceImilePackageInNotes(wp.notes, wp.sequence),
  }));
  await db.createStops(routeId, updatedStops);

  await recordRouteMetricForAttempt(null);

  return { ...optimized, audit, auditSource };
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
const stopCreateSchema = z.object({
  address: z.string().min(1, "Informe o endereço da parada."),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sequence: z.number(),
  notes: z.string().optional(),
});
const stopUpdateSchema = z.object({
  routeId: z.number(),
  stopId: z.number(),
  address: z.string().min(1, "Informe o endereço da parada."),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  sequence: z.number().optional(),
  notes: z.string().nullable().optional(),
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
    dashboard: adminProcedure.query(() => db.getAdminOperationalDashboard()),
    routeMetrics: adminProcedure.input(z.object({
      days: z.number().min(1).max(365).default(30),
    }))
      .query(({ input }) => db.getRouteMetricsDashboard(input.days)),
    events: adminProcedure.input(z.object({
      limit: z.number().min(1).max(200).default(100),
    }))
      .query(({ input }) => db.getRecentOperationalEvents(input.limit)),
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
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserRoutes(ctx.user.id)
    ),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(({ ctx, input }) =>
        db.getRouteById(input.id, ctx.user.id)
      ),
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

        const report = auditRouteSequence(
          routeStopsToAuditableStops(routeStops),
          {
            startLocation,
            requireStartLocation,
            actualTotalDistanceKm: Number(route.totalDistance ?? 0),
            usedRoadMetrics,
            respectInputSequence,
          }
        );

        return {
          ...report,
          context: {
            auditSource: auditSource ?? null,
            usedRoadMetrics: usedRoadMetrics ?? null,
            respectInputSequence: respectInputSequence ?? null,
            requireStartLocation,
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
            severity: "info",
            source: "routes.createAndOptimize",
            title: "Rota criada e otimizada",
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
            },
          });
          await recordRouteAuditEvent(
            ctx.user.id,
            route.id,
            optimized.audit,
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
        });
        await recordOperationalEvent(ctx.user.id, {
          type: input.localityMode === "strict" ? "route_user_requested_better_sequence" : "route_reoptimized",
          severity: input.localityMode === "strict" ? "warning" : "info",
          source: "routes.optimize",
          title: input.localityMode === "strict" ? "Usuário pediu sequência melhor" : "Rota reotimizada",
          routeId: input.id,
          metadata: {
            mode: input.mode,
            localityMode: input.localityMode,
            totalDistance: optimized.totalDistance,
            totalTime: optimized.totalTime,
            startedFromCurrentLocation: Boolean(startLocation),
            auditSource: optimized.auditSource,
            auditStatus: optimized.audit?.status,
            auditScore: optimized.audit?.score,
            auditIssueCount: optimized.audit?.issueCount,
            auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
            auditRequireStartLocation: true,
          },
        });
        await recordRouteAuditEvent(
          ctx.user.id,
          input.id,
          optimized.audit,
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
        });
        await recordOperationalEvent(ctx.user.id, {
          type: "route_remaining_reoptimized",
          severity: "info",
          source: "routes.optimizeRemaining",
          title: "Restantes reotimizadas",
          routeId: input.id,
          metadata: {
            excludedStops: input.excludeStopIds.length,
            localityMode: input.localityMode,
            totalDistance: optimized.totalDistance,
            totalTime: optimized.totalTime,
            startedFromCurrentLocation: Boolean(startLocation),
            auditSource: optimized.auditSource,
            auditStatus: optimized.audit?.status,
            auditScore: optimized.audit?.score,
            auditIssueCount: optimized.audit?.issueCount,
            auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
            auditRequireStartLocation: true,
          },
        });
        await recordRouteAuditEvent(
          ctx.user.id,
          input.id,
          optimized.audit,
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
        const createdStops = await db.createStops(input.routeId, input.stops);
        await db.updateRoute(input.routeId, ctx.user.id, { status: "draft" });
        return createdStops;
      }),
    update: protectedProcedure.input(stopUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        const updatedStop = await db.updateStop(input.routeId, input.stopId, {
          address: input.address.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          sequence: input.sequence,
          notes: input.notes?.trim() || null,
        });

        if (!updatedStop) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parada não encontrada.",
          });
        }

        await db.updateRoute(input.routeId, ctx.user.id, { status: "draft" });
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

