import { afterEach, describe, expect, it } from "vitest";
import * as db from "./db";
import { __routeOptimizationTestHooks, appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(
  userId: number,
  role: "user" | "admin" = "user"
): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `route-endpoints-user-${userId}`,
    email: `route-endpoints-${userId}@example.com`,
    name: "Route Endpoints User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Route endpoints", () => {
  afterEach(() => {
    ENV.osrmRequired = false;
    ENV.osrmRequiredMinStops = 101;
    ENV.maxSyncStops = 160;
    ENV.maxRouteStops = 160;
    ENV.maxGeographicFallbackStops = 160;
    ENV.optimizationQueueEnabled = true;
    ENV.bullmqRedisUrl = "";
    ENV.adminEmails = "";
  });

  const makeStops = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      address: `Rua Limite ${index + 1}, Presidente Prudente - SP`,
      latitude: -22.1207 + index * 0.00001,
      longitude: -51.3889 + index * 0.00001,
      sequence: index,
    }));

  it("promotes a clearly nearer stop before a later distant planned stop during the local sweep", () => {
    const swept =
      __routeOptimizationTestHooks.buildLocalCoherenceSweepLocations(
        {
          sequence: [0, 1, 2],
          totalDistance: 0,
          totalTime: 0,
          waypoints: [
            {
              address: "Rua Distante, 100, Presidente Prudente - SP",
              latitude: -22.01,
              longitude: -51.01,
              sequence: 0,
            },
            {
              address: "Rua Muito Perto, 10, Presidente Prudente - SP",
              latitude: -22.0005,
              longitude: -51.0005,
              sequence: 1,
            },
            {
              address: "Rua Distante 2, 300, Presidente Prudente - SP",
              latitude: -22.02,
              longitude: -51.02,
              sequence: 2,
            },
          ],
        },
        {
          startLocation: {
            address: "Meu local",
            latitude: -22.0001,
            longitude: -51.0001,
          },
        }
      );

    expect(swept?.map(stop => stop.address)).toEqual([
      "Rua Muito Perto, 10, Presidente Prudente - SP",
      "Rua Distante, 100, Presidente Prudente - SP",
      "Rua Distante 2, 300, Presidente Prudente - SP",
    ]);
  });

  it("can force a nearest-stop sweep as a last resort when normal thresholds are not enough", () => {
    const route = {
      sequence: [0, 1],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [
        {
          address: "Rua Planejada, Presidente Prudente - SP",
          latitude: -22.0008,
          longitude: -51.0008,
          sequence: 0,
        },
        {
          address: "Rua Levemente Mais Perto, Presidente Prudente - SP",
          latitude: -22.0007,
          longitude: -51.0007,
          sequence: 1,
        },
      ],
    };
    const startLocation = {
      address: "Meu local",
      latitude: -22,
      longitude: -51,
    };

    expect(
      __routeOptimizationTestHooks.buildLocalCoherenceSweepLocations(route, {
        startLocation,
      })
    ).toBeNull();

    expect(
      __routeOptimizationTestHooks
        .buildLocalCoherenceSweepLocations(route, {
          startLocation,
          forceNearest: true,
        })
        ?.map(stop => stop.address)
    ).toEqual([
      "Rua Levemente Mais Perto, Presidente Prudente - SP",
      "Rua Planejada, Presidente Prudente - SP",
    ]);
  });

  it("does not accept a local sweep candidate that creates more visual route crossings", () => {
    const baseAudit = {
      status: "attention" as const,
      score: 70,
      quality: "attention" as const,
      stopCount: 3,
      issueCount: 1,
      criticalCount: 0,
      warningCount: 1,
      totalDistanceKm: 3,
      maxLegKm: 1,
      clusterMetrics: {
        clusterCount: 1,
        averageRadiusKm: 1,
        maxRadiusKm: 1,
        spreadClusters: [],
      },
      issues: [
        {
          type: "route_crossing" as const,
          severity: "low" as const,
          title: "Cruzamento",
          message: "Rota cruza uma vez.",
        },
      ],
    };

    const current = {
      optimized: {
        sequence: [0, 1, 2],
        totalDistance: 10,
        totalTime: 10,
        waypoints: [],
      },
      audit: baseAudit,
    };
    const candidate = {
      optimized: {
        sequence: [0, 1, 2],
        totalDistance: 9,
        totalTime: 9,
        waypoints: [],
      },
      audit: {
        ...baseAudit,
        issueCount: 2,
        issues: [
          ...baseAudit.issues,
          {
            type: "route_crossing" as const,
            severity: "low" as const,
            title: "Cruzamento adicional",
            message: "Rota cruza duas vezes.",
          },
        ],
      },
    };

    expect(
      __routeOptimizationTestHooks.isAuditAttemptBetter(current, candidate)
    ).toBe(false);
  });

  it("accepts a sweep candidate that resolves coherence despite visual crossings", () => {
    const current = {
      optimized: {
        sequence: [0, 1, 2],
        totalDistance: 10,
        totalTime: 10,
        waypoints: [],
      },
      audit: {
        status: "critical" as const,
        score: 35,
        quality: "poor" as const,
        stopCount: 3,
        issueCount: 1,
        criticalCount: 1,
        warningCount: 0,
        totalDistanceKm: 10,
        maxLegKm: 5,
        clusterMetrics: {
          clusterCount: 1,
          averageRadiusKm: 1,
          maxRadiusKm: 1,
          spreadClusters: [],
        },
        issues: [
          {
            type: "nearby_stop_skipped" as const,
            severity: "high" as const,
            title: "Parada proxima pulada",
            message: "A rota pulou uma parada proxima.",
          },
        ],
      },
    };
    const candidate = {
      optimized: {
        sequence: [0, 1, 2],
        totalDistance: 8,
        totalTime: 8,
        waypoints: [],
      },
      audit: {
        ...current.audit,
        status: "attention" as const,
        score: 80,
        quality: "attention" as const,
        criticalCount: 0,
        warningCount: 1,
        issues: [
          {
            type: "route_crossing" as const,
            severity: "low" as const,
            title: "Cruzamento",
            message: "A rota passou a cruzar visualmente.",
          },
        ],
      },
    };

    expect(
      __routeOptimizationTestHooks.isAuditAttemptBetter(current, candidate)
    ).toBe(true);
  });

  it("accepts a sweep candidate that resolves coherence despite more non-blocking alerts", () => {
    const current = {
      optimized: {
        sequence: [0, 1, 2],
        totalDistance: 10,
        totalTime: 10,
        waypoints: [],
      },
      audit: {
        status: "critical" as const,
        score: 35,
        quality: "poor" as const,
        stopCount: 3,
        issueCount: 1,
        criticalCount: 1,
        warningCount: 0,
        totalDistanceKm: 10,
        maxLegKm: 5,
        clusterMetrics: {
          clusterCount: 1,
          averageRadiusKm: 1,
          maxRadiusKm: 1,
          spreadClusters: [],
        },
        issues: [
          {
            type: "nearby_stop_skipped" as const,
            severity: "high" as const,
            title: "Parada proxima pulada",
            message: "A rota pulou uma parada proxima.",
          },
        ],
      },
    };
    const candidate = {
      optimized: {
        sequence: [0, 1, 2],
        totalDistance: 8,
        totalTime: 8,
        waypoints: [],
      },
      audit: {
        ...current.audit,
        status: "attention" as const,
        score: 80,
        quality: "attention" as const,
        issueCount: 2,
        criticalCount: 0,
        warningCount: 2,
        issues: [
          {
            type: "duplicate_coordinates" as const,
            severity: "medium" as const,
            title: "Coordenadas repetidas",
            message: "Duas paradas compartilham coordenadas.",
          },
          {
            type: "low_geocoding_confidence" as const,
            severity: "medium" as const,
            title: "Baixa confianca",
            message: "Endereco com baixa confianca.",
          },
        ],
      },
    };

    expect(
      __routeOptimizationTestHooks.isAuditAttemptBetter(current, candidate)
    ).toBe(true);
  });

  it("classifies residual nearby skipped stops as strong attention instead of clean optimization", () => {
    const outcome = __routeOptimizationTestHooks.getRouteOperationalOutcome(
      {
        status: "attention" as const,
        score: 39,
        quality: "attention" as const,
        stopCount: 3,
        issueCount: 1,
        criticalCount: 0,
        warningCount: 1,
        totalDistanceKm: 4,
        maxLegKm: 1,
        clusterMetrics: {
          clusterCount: 1,
          averageRadiusKm: 1,
          maxRadiusKm: 1,
          spreadClusters: [],
        },
        issues: [
          {
            type: "nearby_stop_skipped" as const,
            severity: "high" as const,
            title: "Parada proxima pulada",
            message: "A rota pulou uma parada mais proxima.",
          },
        ],
      },
      null
    );

    expect(outcome.status).toBe("attention_strong");
    expect(outcome.commerciallySatisfactory).toBe(false);
    expect(outcome.sequenceCoherenceVerified).toBe(false);
  });

  it("keeps route crossings as visual attention instead of strong operational incoherence", () => {
    const outcome = __routeOptimizationTestHooks.getRouteOperationalOutcome(
      {
        status: "attention" as const,
        score: 82,
        quality: "good" as const,
        stopCount: 4,
        issueCount: 1,
        criticalCount: 0,
        warningCount: 1,
        totalDistanceKm: 4,
        maxLegKm: 1,
        clusterMetrics: {
          clusterCount: 1,
          averageRadiusKm: 1,
          maxRadiusKm: 1,
          spreadClusters: [],
        },
        issues: [
          {
            type: "route_crossing" as const,
            severity: "low" as const,
            title: "Cruzamento visual no trajeto",
            message: "O trecho cruza outro trecho no mapa.",
          },
        ],
      },
      null
    );

    expect(outcome.status).toBe("optimized_attention");
    expect(outcome.commerciallySatisfactory).toBe(true);
    expect(outcome.sequenceCoherenceVerified).toBe(true);
    expect(outcome.remainingCoherenceIssues).toBe(0);
  });

  it("does not approve a geographic fallback as a road-optimized route", () => {
    const outcome = __routeOptimizationTestHooks.getRouteOperationalOutcome(
      {
        status: "attention" as const,
        score: 82,
        quality: "good" as const,
        stopCount: 4,
        issueCount: 1,
        criticalCount: 0,
        warningCount: 1,
        totalDistanceKm: 4,
        maxLegKm: 1,
        clusterMetrics: {
          clusterCount: 1,
          averageRadiusKm: 1,
          maxRadiusKm: 1,
          spreadClusters: [],
        },
        issues: [
          {
            type: "osrm_fallback" as const,
            severity: "high" as const,
            title: "Metrica rodoviaria indisponivel",
            message: "A rota foi estimada por distancia geografica.",
          },
        ],
      },
      null,
      { usedRoadMetrics: false }
    );

    expect(outcome.status).toBe("attention_strong");
    expect(outcome.label).toBe("Sem calculo por ruas");
    expect(outcome.roadMetricsVerified).toBe(false);
    expect(outcome.commerciallySatisfactory).toBe(false);
    expect(outcome.sequenceCoherenceVerified).toBe(true);
  });

  it("marks a road matrix with estimated cells as partial instead of verified", () => {
    const outcome = __routeOptimizationTestHooks.getRouteOperationalOutcome(
      {
        status: "approved" as const,
        score: 100,
        quality: "excellent" as const,
        stopCount: 2,
        issueCount: 0,
        criticalCount: 0,
        warningCount: 0,
        totalDistanceKm: 2.5,
        maxLegKm: 2.5,
        clusterMetrics: {
          clusterCount: 1,
          averageRadiusKm: 1,
          maxRadiusKm: 1,
          spreadClusters: [],
        },
        issues: [],
      },
      null,
      { usedRoadMetrics: true, roadMetricsDegraded: true }
    );

    expect(outcome.status).toBe("optimized_attention");
    expect(outcome.label).toBe("Otimizada com estimativas parciais");
    expect(outcome.roadMetricsDegraded).toBe(true);
    expect(outcome.roadMetricsVerified).toBe(false);
    expect(outcome.commerciallySatisfactory).toBe(false);
  });

  it("prioritizes high-impact regional issues before small nearby fixes in the global audit plan", () => {
    const plan = __routeOptimizationTestHooks.buildBatchAuditRepairPlan({
      status: "attention" as const,
      score: 50,
      quality: "attention" as const,
      stopCount: 6,
      issueCount: 3,
      criticalCount: 0,
      warningCount: 3,
      totalDistanceKm: 8,
      maxLegKm: 4,
      clusterMetrics: {
        clusterCount: 2,
        averageRadiusKm: 0.5,
        maxRadiusKm: 1,
        spreadClusters: [],
      },
      issues: [
        {
          type: "nearby_stop_skipped" as const,
          severity: "high" as const,
          title: "Parada proxima pulada",
          message: "Pequeno ajuste local.",
          toSequence: 2,
          nearestSequence: 5,
          distanceKm: 0.4,
          nearestDistanceKm: 0.2,
          gapKm: 0.2,
        },
        {
          type: "region_revisited" as const,
          severity: "high" as const,
          title: "Retorno de regiao",
          message: "Retorno caro para regiao ja visitada.",
          toSequence: 4,
          nearestSequence: 6,
          distanceKm: 3.2,
          nearestDistanceKm: 0.1,
        },
        {
          type: "premature_region_exit" as const,
          severity: "high" as const,
          title: "Saida prematura",
          message: "Saiu da regiao antes de concluir pendencias.",
          toSequence: 3,
          pendingSequences: [4, 5],
          distanceKm: 1.5,
        },
      ],
    });

    expect(plan.selectedIssues.map(issue => issue.type)).toEqual([
      "premature_region_exit",
      "region_revisited",
      "nearby_stop_skipped",
    ]);
  });

  it("creates stops and optimizes route in one backend operation", async () => {
    const caller = appRouter.createCaller(createAuthContext(8201));

    const result = await caller.routes.createAndOptimize({
      name: "Rota atomica",
      mode: "balanced",
      stops: [
        {
          address: "Rua A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua B, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
        },
      ],
    });

    expect(result.route.status).toBe("optimized");
    expect(result.optimization.totalDistance).toBeGreaterThan(0);

    const stops = await caller.stops.list({ routeId: result.route.id });
    expect(stops).toHaveLength(2);
  });

  it("blocks create and optimize above the commercial route stop limit", async () => {
    const caller = appRouter.createCaller(createAuthContext(8260));

    await expect(
      caller.routes.createAndOptimize({
        name: "Rota acima do limite",
        mode: "balanced",
        stops: makeStops(201),
      })
    ).rejects.toThrow("limite comercial");
  });

  it("blocks adding stops when the route would exceed the commercial limit", async () => {
    const caller = appRouter.createCaller(createAuthContext(8261));
    const route = await caller.routes.create({
      name: "Rota limite",
      mode: "balanced",
    });

    await expect(
      caller.stops.create({
        routeId: route.id,
        stops: makeStops(201),
      })
    ).rejects.toThrow("limite comercial");
  });

  it("persists route metrics for admin analytics after optimization", async () => {
    const caller = appRouter.createCaller(createAuthContext(8216));

    await caller.routes.createAndOptimize({
      name: "Rota com metricas",
      mode: "balanced",
      stops: [
        {
          address: "Rua Metrica A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Metrica B, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
        },
      ],
    });

    const metrics = await db.getRouteMetricsDashboard(30);
    expect(metrics.routeMetricCount).toBeGreaterThan(0);
    expect(metrics.averageQualityScore).toBeGreaterThanOrEqual(0);
    expect(metrics.averageOptimizationRuntimeMs).toBeGreaterThanOrEqual(0);
    expect(metrics.auditorCorrectionRate).toBeGreaterThanOrEqual(0);
    expect(metrics.regionalReworkIndex).toBeGreaterThanOrEqual(0);
    expect(metrics.osrmFallbackCount + metrics.osrmUsedCount).toBe(
      metrics.routeMetricCount
    );
    expect(metrics.geocodingConfidence.averageScore).toBeGreaterThanOrEqual(0);
    expect(
      metrics.geocodingConfidence.suspiciousStopRate
    ).toBeGreaterThanOrEqual(0);
  });

  it("exposes geocoding impact analytics for admin dashboards", async () => {
    await db.createOperationalEvent({
      type: "geocoding_cache_hit",
      severity: "info",
      source: "test",
      title: "Cache hit",
      metadata: {
        provider_used: "cache_backend",
        geocoding_cache_hit_backend: 2,
      },
    });
    await db.createOperationalEvent({
      type: "geocoding_cache_miss",
      severity: "info",
      source: "test",
      title: "Cache miss",
      metadata: {
        provider_used: "nominatim",
        geocoding_cache_miss: 1,
      },
    });

    const impact = await db.getGeocodingImpactDashboard();

    expect(impact.last7Days).toBeDefined();
    expect(impact.last30Days).toBeDefined();
    expect(impact.last30Days.cache.backendHits).toBeGreaterThanOrEqual(2);
    expect(impact.last30Days.cache.misses).toBeGreaterThanOrEqual(1);
    expect(impact.last30Days.cache.hitRate).toBeGreaterThanOrEqual(0);
    expect(impact.last30Days.providers.length).toBeGreaterThan(0);
    expect(
      impact.last30Days.confidenceDistribution.score_81_100
    ).toBeGreaterThanOrEqual(0);
  });

  it("records manual address corrections when a stop is edited", async () => {
    const caller = appRouter.createCaller(createAuthContext(8262));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com correcao manual",
      mode: "balanced",
      stops: [
        {
          address: "Rua Original A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Original B, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
        },
      ],
    });
    const [firstStop] = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.update({
      routeId: result.route.id,
      stopId: firstStop.id,
      address: "Rua Corrigida, 100, Presidente Prudente - SP",
      latitude: -22.1227,
      longitude: -51.3909,
      sequence: Number(firstStop.sequence),
      notes: firstStop.notes ?? undefined,
    });

    const report = await db.getGeocodingExecutiveReport();

    expect(report.manualCorrections).toBeGreaterThanOrEqual(1);
    expect(
      report.monthlyEvolution.manualCorrections.topAddresses.length
    ).toBeGreaterThan(0);
  });

  it("tracks operational execution analytics from route events", async () => {
    const caller = appRouter.createCaller(createAuthContext(8288));

    const completed = await caller.routes.createAndOptimize({
      name: "Rota execucao concluida",
      mode: "balanced",
      stops: [
        {
          address: "Rua Execucao A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Execucao B, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
        },
      ],
    });
    const abandoned = await caller.routes.createAndOptimize({
      name: "Rota execucao abandonada",
      mode: "balanced",
      stops: [
        {
          address: "Rua Abandono A, Presidente Prudente - SP",
          latitude: -22.1227,
          longitude: -51.3909,
          sequence: 0,
        },
        {
          address: "Rua Abandono B, Presidente Prudente - SP",
          latitude: -22.1237,
          longitude: -51.3919,
          sequence: 1,
        },
      ],
    });

    await caller.events.report({
      type: "route_started",
      severity: "info",
      source: "route.execution",
      title: "Execucao iniciada",
      routeId: completed.route.id,
      metadata: { test: true },
    });
    await caller.events.report({
      type: "route_completed",
      severity: "info",
      source: "route.execution",
      title: "Execucao concluida",
      routeId: completed.route.id,
      metadata: { test: true },
    });
    await caller.events.report({
      type: "route_started",
      severity: "info",
      source: "route.execution",
      title: "Execucao iniciada",
      routeId: abandoned.route.id,
      metadata: { test: true },
    });
    await caller.events.report({
      type: "route_abandoned",
      severity: "warning",
      source: "route.execution",
      title: "Execucao abandonada",
      routeId: abandoned.route.id,
      metadata: { reason: "manual_reset" },
    });
    await caller.events.report({
      type: "route_start_blocked",
      severity: "error",
      source: "route.execution",
      title: "Inicio bloqueado",
      routeId: abandoned.route.id,
      metadata: { reason: "invalid_coordinates" },
    });

    const report = await db.getOperationExecutionReport();

    expect(report.last30Days.optimizedRoutes).toBeGreaterThanOrEqual(2);
    expect(report.last30Days.startedRoutes).toBeGreaterThanOrEqual(2);
    expect(report.last30Days.completedRoutes).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.abandonedRoutes).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.startBlockedAttempts).toBeGreaterThanOrEqual(1);
    expect(
      report.last30Days.startBlockedByReason.invalid_coordinates
    ).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.startRate).toBeGreaterThan(0);
    expect(report.last30Days.completionRate).toBeGreaterThan(0);
  });

  it("exposes executive observability signals for admin decisions", async () => {
    await db.createRouteMetric({
      userId: 8298,
      routeId: 8298,
      qualityScore: 72,
      optimizationRuntimeMs: 1500,
      osrmUsed: false,
      osrmFallback: true,
      clusterCount: 2,
      averageClusterRadius: 0.4,
      maxClusterRadius: 0.9,
      regionRevisitedCount: 1,
      prematureRegionExitCount: 1,
      nearbyStopSkippedCount: 1,
      routeCrossingCount: 0,
      issuesDetectedCount: 3,
      issuesCorrectedCount: 1,
      issuesBlockedCount: 0,
      auditStatus: "attention",
      auditQuality: "attention",
      auditSource: "test",
      routeMode: "balanced",
      localityMode: "strict",
      executionStatus: "completed",
      startedAt: new Date(Date.now() - 60_000),
      completedAt: new Date(),
      executionDurationMs: 60_000,
      stopCount: 3,
      totalDistanceKm: 8,
      totalTimeMinutes: 18,
      metadata: {
        operationalStatus: "attention_strong",
      },
    });
    await db.createOperationalEvent({
      userId: 8298,
      routeId: 8298,
      stopId: 8298,
      type: "route_stop_delivered",
      severity: "warning",
      source: "route.execution",
      title: "Parada marcada como entregue",
      metadata: {
        remoteConfirmation: true,
        locationIntegrity: "remote_confirmation",
        distanceFromExpectedStopKm: 1.2,
      },
    });
    await db.createOperationalEvent({
      userId: 8298,
      routeId: 8298,
      stopId: 8298,
      type: "route_stop_remote_confirmation",
      severity: "error",
      source: "route.execution",
      title: "Entrega marcada longe do local",
      metadata: {
        remoteConfirmation: true,
        distanceFromExpectedStopKm: 1.2,
      },
    });

    const report = await db.getExecutiveObservabilityReport();

    expect(report.last30Days.optimizedRoutes).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.startedRoutes).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.completedRoutes).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.osrmFallbackCount).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.attentionStrongRoutes).toBeGreaterThanOrEqual(1);
    expect(
      report.last30Days.remoteDeliveryConfirmations
    ).toBeGreaterThanOrEqual(1);
    expect(report.last30Days.averageOptimizationRuntimeMs).toBeGreaterThan(0);
    expect(report.comparison.signals.map((signal: any) => signal.key)).toEqual(
      expect.arrayContaining([
        "completionRate",
        "osrmFallbackRate",
        "attentionStrongRate",
        "remoteDeliveryRate",
        "averageOptimizationRuntimeMs",
      ])
    );

    const dashboard = await db.getAdminOperationalDashboard();
    expect((dashboard as any).executiveObservability.last30Days).toBeDefined();
  });

  it("exposes disaster recovery readiness for admin dashboards", async () => {
    ENV.adminEmails = "route-endpoints-8299@example.com";
    const caller = appRouter.createCaller(createAuthContext(8299, "admin"));

    const readiness = await caller.admin.disasterReadiness();

    expect(readiness.rpoTargetHours).toBe(24);
    expect(readiness.rtoTargetHours).toBe(4);
    expect(readiness.criticalTables.map(table => table.table)).toEqual(
      expect.arrayContaining([
        "routes",
        "stops",
        "route_metrics",
        "optimization_jobs",
        "operationalEvents",
        "address_corrections",
        "osrm_matrix_cache",
        "admin_dashboard_metrics",
      ])
    );
    expect(readiness.status).toMatch(/healthy|warning|critical/);
    expect(Array.isArray(readiness.alerts)).toBe(true);
  });

  it("clears backup failure status when newer backup evidence exists", async () => {
    ENV.backupLastCompletedAt = "";
    ENV.backupStatus = "";
    ENV.restoreTestLastPassedAt = "";
    ENV.restoreTestPassed = false;

    await db.createOperationalEvent({
      userId: null,
      routeId: null,
      stopId: null,
      type: "backup_failed",
      severity: "fatal",
      source: "test.disasterRecovery",
      title: "Falha antiga de backup",
      message: "Falha anterior preservada para auditoria.",
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    await db.createOperationalEvent({
      userId: null,
      routeId: null,
      stopId: null,
      type: "backup_completed",
      severity: "info",
      source: "test.disasterRecovery",
      title: "Backup aprovado",
      message: "Backup mais recente aprovado.",
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    await db.createOperationalEvent({
      userId: null,
      routeId: null,
      stopId: null,
      type: "restore_test_passed",
      severity: "info",
      source: "test.disasterRecovery",
      title: "Restore aprovado",
      message: "Restore mais recente aprovado.",
    });

    const readiness = await db.getDisasterReadinessDashboard();

    expect(readiness.backupStatus).toBe("completed");
    expect(readiness.alerts.some(alert => alert.type === "backup_failed")).toBe(
      false
    );
    expect(readiness.restoreTestPassed).toBe(true);
  });

  it("persists performance benchmark history for admin dashboards", async () => {
    await db.createPerformanceBenchmark({
      scenario: "test-suite",
      stopCount: 250,
      runtimeMs: 12_000,
      peakMemoryMb: 180,
      queueWaitMs: 20,
      osrmLatencyMs: 40,
      auditCycles: 2,
      microClusterCount: 4,
      osrmCalls: 8,
      osrmFailures: 0,
      success: true,
    });

    const dashboard = await db.getPerformanceBenchmarkDashboard(30);

    const target250 = dashboard.targets.find(
      target => target.stopCount === 250
    );
    expect(dashboard.totalRuns).toBeGreaterThanOrEqual(1);
    expect(dashboard.successRate).toBeGreaterThan(0);
    expect(target250?.latestRuntimeMs).toBeGreaterThan(0);
    expect(target250?.status).toBe("ready");
  });

  it("includes performance benchmarks in the consolidated admin dashboard", async () => {
    ENV.adminEmails = "route-endpoints-8300@example.com";
    const caller = appRouter.createCaller(createAuthContext(8300, "admin"));

    const dashboard = await caller.admin.dashboard();

    expect((dashboard as any).performanceBenchmarks).toBeDefined();
    expect((dashboard as any).performanceBenchmarks.targets).toHaveLength(4);
  });

  it("exposes a consolidated multi-vehicle readiness decision", async () => {
    ENV.adminEmails = "route-endpoints-8301@example.com";
    const caller = appRouter.createCaller(createAuthContext(8301, "admin"));

    const readiness = await caller.admin.multiVehicleReadiness();

    expect(readiness.status).toMatch(/READY|PARTIAL|NO-GO/);
    expect(readiness.items.osrmEnterprise.status).toMatch(
      /READY|PARTIAL|NO-GO/
    );
    expect(readiness.items.workerRedundancy.status).toMatch(
      /READY|PARTIAL|NO-GO/
    );
    expect(readiness.items.disasterRecovery.status).toMatch(
      /READY|PARTIAL|NO-GO/
    );
    expect(readiness.items.benchmark250.evidence.stopCount).toBe(250);
    expect(readiness.items.benchmark500.evidence.stopCount).toBe(500);
    expect(readiness.items.benchmark1000.evidence.stopCount).toBe(1000);
    expect(readiness.items.benchmark2000.evidence.stopCount).toBe(2000);
  });

  it("optimizes with warning when a stop has low geocoding confidence but valid coordinates", async () => {
    const caller = appRouter.createCaller(createAuthContext(8261));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com baixa confianca",
      mode: "balanced",
      stops: [
        {
          address: "Rua Confianca Baixa A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          geocodingConfidenceScore: 45,
          geocodingMethod: "street_match",
          geocodingSuspect: true,
        },
        {
          address: "Rua Confianca Baixa B, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
          geocodingConfidenceScore: 95,
          geocodingMethod: "exact_address",
          geocodingSuspect: false,
        },
      ],
    });

    expect(result.route.status).toBe("optimized");
    expect(result.optimization).not.toBeNull();
    expect(
      result.optimization?.audit.issues.some(
        issue => issue.type === "low_geocoding_confidence"
      )
    ).toBe(true);
  });

  it("rejects optimization when OSRM is required and road metrics are unavailable", async () => {
    ENV.osrmRequired = true;
    ENV.osrmRequiredMinStops = 1;
    const caller = appRouter.createCaller(createAuthContext(8217));

    const route = await caller.routes.create({
      name: "Rota exige OSRM",
      mode: "balanced",
    });
    await caller.stops.create({
      routeId: route.id,
      stops: [
        {
          address: "Rua OSRM A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua OSRM B, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
        },
      ],
    });

    await expect(caller.routes.optimize({ id: route.id })).rejects.toThrow(
      "OSRM obrigatorio indisponivel"
    );

    const storedRoute = await caller.routes.get({ id: route.id });
    expect(storedRoute?.status).toBe("draft");
  });

  it("optimizes a 134-stop Shopee route with partitioned geographic fallback when OSRM is unavailable", async () => {
    const caller = appRouter.createCaller(createAuthContext(8228));
    const stops = Array.from({ length: 134 }, (_, index) => {
      const clusterOffset = index < 67 ? 0 : 0.04;
      const localIndex = index % 67;
      return {
        address: `Rua Shopee Otimizacao ${index + 1}, Presidente Prudente - SP`,
        latitude: -22.1207 + clusterOffset + localIndex * 0.00008,
        longitude: -51.3889 + clusterOffset + localIndex * 0.00008,
        sequence: index,
        sourceProvider: "shopee" as const,
        originalStop: index + 1,
        isUnsequencedStop: false,
      };
    });

    const result = await caller.routes.createAndOptimize({
      name: "Shopee otimizada 134 paradas sem OSRM",
      mode: "balanced",
      respectInputSequence: false,
      stops,
    });

    expect(result.route.status).toBe("optimized");
    expect(result.optimization?.routingStrategy).toBe("optimized_route");
    expect(result.optimization?.auditPolicy).toBeNull();
    expect(
      result.optimization?.audit.issues.some(
        (issue: any) => issue.type === "osrm_fallback"
      )
    ).toBe(true);
    expect(result.optimization?.auditSource).toBe("geo-default");
    expect(result.optimization?.metadata?.partitioned).toBe(true);
    expect(result.optimization?.operationalStatus).toBe("attention_strong");
    expect(result.optimization?.commerciallySatisfactory).toBe(false);
    expect(result.optimization?.sequenceCoherenceVerified).toBe(true);
  });

  it("queues large routes instead of optimizing them synchronously", async () => {
    ENV.maxSyncStops = 2;
    ENV.bullmqRedisUrl = "";
    const caller = appRouter.createCaller(createAuthContext(8270));

    const route = await caller.routes.create({
      name: "Rota grande para fila",
      mode: "balanced",
    });
    await caller.stops.create({
      routeId: route.id,
      stops: [
        {
          address: "Rua Fila A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Fila B, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
        },
        {
          address: "Rua Fila C, Presidente Prudente - SP",
          latitude: -22.1227,
          longitude: -51.3909,
          sequence: 2,
        },
      ],
    });

    await expect(caller.routes.optimize({ id: route.id })).rejects.toThrow(
      "Rota grande exige fila"
    );

    const jobs = await db.getOptimizationJobsDashboard(30);
    expect(jobs.queued).toBeGreaterThanOrEqual(1);
    expect(jobs.total).toBeGreaterThanOrEqual(1);

    const dashboard = await db.getAdminOperationalDashboard();
    expect(dashboard.optimizationJobs.queued).toBeGreaterThanOrEqual(1);
  });

  it("processes a large preserved STOP route without depending on the queue", async () => {
    ENV.maxSyncStops = 2;
    ENV.bullmqRedisUrl = "";
    const caller = appRouter.createCaller(createAuthContext(8271));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee STOP acima do limite sincrono",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua STOP 3, Presidente Prudente - SP",
          latitude: -22.123,
          longitude: -51.39,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
        {
          address: "Rua STOP 1, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.389,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua STOP 2, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.3895,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua sem STOP perto da primeira, Presidente Prudente - SP",
          latitude: -22.1212,
          longitude: -51.3891,
          sequence: 3,
          sourceProvider: "shopee",
          originalStop: 0,
          isUnsequencedStop: true,
        },
      ],
    });
    const savedStops = await caller.stops.list({ routeId: result.route.id });

    expect(result.route.status).toBe("optimized");
    expect(result.optimization?.queued).not.toBe(true);
    expect(result.optimization?.routingStrategy).toBe("shopee_stop_sequence");
    expect(savedStops.map((stop: any) => Number(stop.originalStop))).toEqual([
      1, 0, 2, 3,
    ]);
  });

  it("estimates commercial impact from corrected route metrics", async () => {
    await db.createRouteMetric({
      userId: 8220,
      routeId: 8220,
      qualityScore: 82,
      optimizationRuntimeMs: 120,
      osrmUsed: true,
      osrmFallback: false,
      clusterCount: 2,
      averageClusterRadius: 0.4,
      maxClusterRadius: 0.8,
      regionRevisitedCount: 1,
      prematureRegionExitCount: 0,
      nearbyStopSkippedCount: 1,
      routeCrossingCount: 0,
      issuesDetectedCount: 2,
      issuesCorrectedCount: 1,
      issuesBlockedCount: 0,
      auditStatus: "attention",
      auditQuality: "good",
      auditSource: "test",
      routeMode: "balanced",
      localityMode: "strict",
      stopCount: 4,
      totalDistanceKm: 10,
      totalTimeMinutes: 20,
      metadata: {
        firstBlockingIssue: {
          type: "nearby_stop_skipped",
          distanceKm: 3,
          nearestDistanceKm: 1,
        },
      },
    });

    const metrics = await db.getRouteMetricsDashboard(30);
    expect(metrics.commercialImpact.estimatedKmSaved).toBeGreaterThanOrEqual(2);
    expect(
      metrics.commercialImpact.estimatedMinutesSaved
    ).toBeGreaterThanOrEqual(5);
    expect(metrics.commercialImpact.estimatedFuelLitersSaved).toBeGreaterThan(
      0
    );
    expect(metrics.commercialImpact.estimatedCo2KgAvoided).toBeGreaterThan(0);
  });

  it("aggregates partitioned route metrics from optimization metadata", async () => {
    await db.createRouteMetric({
      userId: 8221,
      routeId: 8221,
      qualityScore: 88,
      optimizationRuntimeMs: 250,
      osrmUsed: true,
      osrmFallback: false,
      clusterCount: 4,
      averageClusterRadius: 0.5,
      maxClusterRadius: 0.9,
      regionRevisitedCount: 0,
      prematureRegionExitCount: 0,
      nearbyStopSkippedCount: 0,
      routeCrossingCount: 0,
      issuesDetectedCount: 0,
      issuesCorrectedCount: 0,
      issuesBlockedCount: 0,
      auditStatus: "approved",
      auditQuality: "good",
      auditSource: "road-default",
      routeMode: "balanced",
      localityMode: "strict",
      stopCount: 150,
      totalDistanceKm: 42,
      totalTimeMinutes: 80,
      metadata: {
        routeMetadata: {
          partitioned: true,
          partitionCount: 3,
          maxPartitionSize: 70,
          largestPartitionSize: 62,
        },
      },
    });

    const metrics = await db.getRouteMetricsDashboard(30);
    expect(metrics.partitioning.partitionedRouteCount).toBeGreaterThanOrEqual(
      1
    );
    expect(metrics.partitioning.averagePartitionCount).toBeGreaterThan(0);
    expect(metrics.partitioning.largestPartitionSize).toBeGreaterThanOrEqual(
      62
    );
  });

  it("keeps route as draft when optimization rejects invalid stops", async () => {
    const caller = appRouter.createCaller(createAuthContext(8202));

    const result = await caller.routes.createAndOptimize({
      name: "Rota invalida",
      mode: "balanced",
      stops: [
        {
          address: "Rua A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Parada sem coordenadas",
          latitude: 0,
          longitude: 0,
          sequence: 1,
        },
      ],
    });

    const routes = await caller.routes.list();
    const stops = await caller.stops.list({ routeId: result.route.id });

    expect(result.optimization).toBeNull();
    expect(result.warning).toContain("salva como rascunho");
    expect(routes).toHaveLength(1);
    expect(routes[0].status).toBe("draft");
    expect(stops).toHaveLength(2);
  });

  it("optimizes with warning when optimization finds a generic address with valid coordinates", async () => {
    const caller = appRouter.createCaller(createAuthContext(8211));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com parada generica",
      mode: "balanced",
      stops: [
        {
          address: "Entrega",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Valida, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 1,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });

    expect(result.optimization).not.toBeNull();
    expect(
      result.optimization?.audit.issues.some(
        issue => issue.type === "generic_address"
      )
    ).toBe(true);
    expect(route?.status).toBe("optimized");
  });

  it("does not run coherence correction when Shopee STOP sequence is preserved", async () => {
    const caller = appRouter.createCaller(createAuthContext(8212));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee STOP sem correcao de coerencia",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Auditoria, 100, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Auditoria, 300, Presidente Prudente - SP",
          latitude: -22.1218,
          longitude: -51.4,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Auditoria, 120, Presidente Prudente - SP",
          latitude: -22.1204,
          longitude: -51.4,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });

    expect(result.optimization).not.toBeNull();
    expect(result.optimization?.auditPolicy).toBe("shopee_stop_preserved");
    expect(result.optimization?.routingStrategy).toBe("shopee_stop_sequence");
    expect(result.optimization?.operationalStatus).toBe("shopee_stop_sequence");
    expect(result.optimization?.commerciallySatisfactory).toBe(false);
    expect(result.optimization?.auditSource).not.toContain("audit-global-plan");
    expect(route?.status).toBe("optimized");
    expect((route as any)?.operationalStatus).toBe("shopee_stop_sequence");
  });

  it("optimizes with attention when many addresses share approximate coordinates", async () => {
    const caller = appRouter.createCaller(createAuthContext(8213));
    const route = await caller.routes.create({
      name: "Rota com geocodificacao duplicada",
      mode: "balanced",
    });

    await caller.stops.create({
      routeId: route.id,
      stops: [
        {
          address: "Rua Duplicada A, 100, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Duplicada A, 200, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 1,
        },
        {
          address: "Rua Duplicada B, 100, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 2,
        },
        {
          address: "Rua Duplicada B, 200, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 3,
        },
        {
          address: "Rua Duplicada C, 100, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.402,
          sequence: 4,
        },
        {
          address: "Rua Duplicada C, 200, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.402,
          sequence: 5,
        },
      ],
    });

    const optimized = await caller.routes.optimize({ id: route.id });

    const routeAfter = await caller.routes.get({ id: route.id });
    const stopsAfter = await caller.stops.list({ routeId: route.id });

    expect(
      optimized.audit.issues.some(
        (issue: any) => issue.type === "duplicate_coordinates"
      )
    ).toBe(true);
    expect(routeAfter?.status).toBe("optimized");
    expect(stopsAfter).toHaveLength(6);
  });

  it("reoptimizes a route with duplicated sequence numbers by rebuilding the order", async () => {
    const caller = appRouter.createCaller(createAuthContext(8214));
    const route = await caller.routes.create({
      name: "Rota com sequencia duplicada corrigivel",
      mode: "balanced",
    });

    await caller.stops.create({
      routeId: route.id,
      stops: [
        {
          address: "Rua Sequencia A, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Sequencia B, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 0,
        },
        {
          address: "Rua Sequencia C, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.402,
          sequence: 2,
        },
      ],
    });

    const optimized = await caller.routes.optimize({ id: route.id });
    const stops = await caller.stops.list({ routeId: route.id });

    expect(optimized.totalDistance).toBeGreaterThan(0);
    expect(stops.map((stop: any) => Number(stop.sequence))).toEqual([0, 1, 2]);
  });

  it("ignores sequential request without Shopee STOP metadata and optimizes normally", async () => {
    const caller = appRouter.createCaller(createAuthContext(8203));

    const result = await caller.routes.createAndOptimize({
      name: "Rota nao Shopee com pedido sequencial",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Jose Bongiovani, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Jose Bongiovani, 200, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 1,
        },
        {
          address: "Rua Jose Bongiovani, 300, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    expect(result.optimization?.auditPolicy).toBeNull();
    expect(result.optimization?.routingStrategy).toBe("optimized_route");
    expect(result.optimization?.sequenceCoherenceVerified).toBe(true);
    expect(
      result.optimization?.audit.issues.some(
        (issue: any) =>
          issue.type === "nearby_stop_skipped" ||
          issue.type === "region_revisited"
      )
    ).toBe(false);
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Jose Bongiovani, 100, Presidente Prudente - SP",
      "Rua Jose Bongiovani, 300, Presidente Prudente - SP",
      "Rua Jose Bongiovani, 200, Presidente Prudente - SP",
    ]);
    expect(stops.map((stop: any) => Number(stop.sequence))).toEqual([0, 1, 2]);
  });

  it("keeps Shopee STOP order when the user chooses preserved STOP sequence", async () => {
    const caller = appRouter.createCaller(createAuthContext(8216));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee STOP preservado",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Shopee Stop 1, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Stop 2 longe, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Stop 3 perto, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    const audit = await caller.routes.audit({ id: result.route.id });

    expect(result.optimization?.auditPolicy).toBe("shopee_stop_preserved");
    expect(result.optimization?.routingStrategy).toBe("shopee_stop_sequence");
    expect(result.optimization?.operationalStatus).toBe("shopee_stop_sequence");
    expect(result.optimization?.auditSource).not.toContain("audit-global-plan");
    expect(audit.context.auditPolicy).toBe("shopee_stop_preserved");
    expect(audit.context.routingStrategy).toBe("shopee_stop_sequence");
    expect(audit.context.structuralAuditOnly).toBe(true);
    expect(audit.context.operationalStatus).toBe("shopee_stop_sequence");
    expect(audit.context.commerciallySatisfactory).toBe(false);
    expect(
      audit.issues.some((issue: any) =>
        [
          "nearby_stop_skipped",
          "region_revisited",
          "premature_region_exit",
          "bad_preserved_sequence",
        ].includes(issue.type)
      )
    ).toBe(false);
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Shopee Stop 1, Presidente Prudente - SP",
      "Rua Shopee Stop 2 longe, Presidente Prudente - SP",
      "Rua Shopee Stop 3 perto, Presidente Prudente - SP",
    ]);
    expect(stops.map((stop: any) => Number(stop.originalStop))).toEqual([
      1, 2, 3,
    ]);
  });

  it("preserves STOP and every grouped package identity after route optimization", async () => {
    const caller = appRouter.createCaller(createAuthContext(8330));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee com identidades persistidas",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Pacotes Agrupados, 10, Presidente Prudente, SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 7,
          isUnsequencedStop: false,
          metadata: {
            packageNumber: "BR-PKG-001",
            packageNumbers: ["BR-PKG-001", "BR-PKG-002"],
            groupedDeliveryCount: 2,
          },
        },
        {
          address: "Rua Pacote Unico, 20, Presidente Prudente, SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 8,
          isUnsequencedStop: false,
          metadata: {
            packageNumber: "BR-PKG-003",
          },
        },
      ],
    });

    const savedStops = await caller.stops.list({ routeId: result.route.id });

    expect(savedStops.map((stop: any) => Number(stop.originalStop))).toEqual([
      7, 8,
    ]);
    expect(savedStops[0].metadata).toMatchObject({
      packageNumber: "BR-PKG-001",
      packageNumbers: ["BR-PKG-001", "BR-PKG-002"],
      groupedDeliveryCount: 2,
    });
    expect(savedStops[1].metadata).toMatchObject({
      packageNumber: "BR-PKG-003",
      packageNumbers: ["BR-PKG-003"],
    });
  });

  it("does not block Shopee preserved STOP routes when road metrics are unavailable above fallback limit", async () => {
    ENV.maxGeographicFallbackStops = 2;
    const caller = appRouter.createCaller(createAuthContext(8218));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee STOP sequencial sem OSRM",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Shopee Grande 1, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Grande 2, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Grande 3, Presidente Prudente - SP",
          latitude: -22.1227,
          longitude: -51.3909,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const audit = await caller.routes.audit({ id: result.route.id });

    expect(result.route.status).toBe("optimized");
    expect(result.optimization).not.toBeNull();
    expect(result.optimization?.auditPolicy).toBe("shopee_stop_preserved");
    expect(result.optimization?.routingStrategy).toBe("shopee_stop_sequence");
    expect(result.optimization?.operationalStatus).toBe("shopee_stop_sequence");
    expect(audit.context.auditPolicy).toBe("shopee_stop_preserved");
    expect(audit.context.routingStrategy).toBe("shopee_stop_sequence");
    expect(audit.context.structuralAuditOnly).toBe(true);
    expect(audit.context.operationalStatus).toBe("shopee_stop_sequence");
  });

  it("keeps Shopee preserved STOP policy when an existing route is optimized again", async () => {
    ENV.maxGeographicFallbackStops = 2;
    const caller = appRouter.createCaller(createAuthContext(8219));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee STOP reotimizar protegido",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Shopee Reotimizar 1, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Reotimizar 2, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3899,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Reotimizar 3, Presidente Prudente - SP",
          latitude: -22.1227,
          longitude: -51.3909,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const optimizedAgain = await caller.routes.optimize({
      id: result.route.id,
    });
    const audit = await caller.routes.audit({ id: result.route.id });

    expect(optimizedAgain.auditPolicy).toBe("shopee_stop_preserved");
    expect(optimizedAgain.routingStrategy).toBe("shopee_stop_sequence");
    expect(optimizedAgain.operationalStatus).toBe("shopee_stop_sequence");
    expect(audit.context.auditPolicy).toBe("shopee_stop_preserved");
    expect(audit.context.routingStrategy).toBe("shopee_stop_sequence");
    expect(audit.context.structuralAuditOnly).toBe(true);
    expect(audit.context.operationalStatus).toBe("shopee_stop_sequence");
  });

  it("keeps full fiscal behavior for Shopee when STOP sequence is not preserved", async () => {
    const caller = appRouter.createCaller(createAuthContext(8217));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee otimizada",
      mode: "balanced",
      stops: [
        {
          address: "Rua Shopee Otimizada 1, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Otimizada 2 longe, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Otimizada 3 perto, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    const audit = await caller.routes.audit({ id: result.route.id });

    expect(result.optimization?.auditPolicy).toBeNull();
    expect(result.optimization?.routingStrategy).toBe("optimized_route");
    expect(result.optimization?.operationalStatus).not.toBe(
      "shopee_stop_sequence"
    );
    expect(audit.context.auditPolicy).toBeNull();
    expect(audit.context.routingStrategy).toBe("optimized_route");
    expect(audit.context.structuralAuditOnly).toBe(false);
    expect(audit.context.coherenceAuditSkipped).toBe(false);
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Shopee Otimizada 1, Presidente Prudente - SP",
      "Rua Shopee Otimizada 3 perto, Presidente Prudente - SP",
      "Rua Shopee Otimizada 2 longe, Presidente Prudente - SP",
    ]);
  });

  it("optimizes Shopee by geography when the user does not choose STOP sequence", async () => {
    const caller = appRouter.createCaller(createAuthContext(8221));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee otimizar sem STOP",
      mode: "balanced",
      respectInputSequence: false,
      startLocation: "Local atual do motorista",
      startLatitude: -22.1207,
      startLongitude: -51.3895,
      stops: [
        {
          address: "Rua Shopee Stop 2 distante, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Stop 1 inicio, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address:
            "Rua Shopee Stop 3 perto do inicio, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });

    expect(result.optimization?.auditPolicy).toBeNull();
    expect(result.optimization?.routingStrategy).toBe("optimized_route");
    expect(stops.map((stop: any) => Number(stop.originalStop))).not.toEqual([
      1, 2, 3,
    ]);
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Shopee Stop 1 inicio, Presidente Prudente - SP",
      "Rua Shopee Stop 3 perto do inicio, Presidente Prudente - SP",
      "Rua Shopee Stop 2 distante, Presidente Prudente - SP",
    ]);
  });

  it("does not restore Shopee STOP order when reoptimizing a route created in optimized mode", async () => {
    const caller = appRouter.createCaller(createAuthContext(8220));

    const result = await caller.routes.createAndOptimize({
      name: "Shopee otimizada permanece otimizada",
      mode: "balanced",
      respectInputSequence: false,
      stops: [
        {
          address: "Rua Shopee Reotimizada 1, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          sourceProvider: "shopee",
          originalStop: 1,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Reotimizada 2 longe, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 1,
          sourceProvider: "shopee",
          originalStop: 2,
          isUnsequencedStop: false,
        },
        {
          address: "Rua Shopee Reotimizada 3 perto, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
          sourceProvider: "shopee",
          originalStop: 3,
          isUnsequencedStop: false,
        },
      ],
    });

    const optimizedAgain = await caller.routes.optimize({
      id: result.route.id,
    });
    const stops = await caller.stops.list({ routeId: result.route.id });

    expect(optimizedAgain.auditPolicy).toBeNull();
    expect(optimizedAgain.routingStrategy).toBe("optimized_route");
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Shopee Reotimizada 1, Presidente Prudente - SP",
      "Rua Shopee Reotimizada 3 perto, Presidente Prudente - SP",
      "Rua Shopee Reotimizada 2 longe, Presidente Prudente - SP",
    ]);
  });

  it("keeps coherent input stop order when sequential routing is requested", async () => {
    const caller = appRouter.createCaller(createAuthContext(8215));

    const result = await caller.routes.createAndOptimize({
      name: "Rota por STOP coerente",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Sequencial, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Sequencial, 200, Presidente Prudente - SP",
          latitude: -22.1217,
          longitude: -51.3889,
          sequence: 1,
        },
        {
          address: "Rua Sequencial, 300, Presidente Prudente - SP",
          latitude: -22.1227,
          longitude: -51.3889,
          sequence: 2,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    expect(result.optimization?.auditSource).not.toContain("audit-corrected");
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Sequencial, 100, Presidente Prudente - SP",
      "Rua Sequencial, 200, Presidente Prudente - SP",
      "Rua Sequencial, 300, Presidente Prudente - SP",
    ]);
    expect(stops.map((stop: any) => Number(stop.sequence))).toEqual([0, 1, 2]);
  });

  it("optimizes imported stops by default instead of keeping spreadsheet order", async () => {
    const caller = appRouter.createCaller(createAuthContext(8204));

    const result = await caller.routes.createAndOptimize({
      name: "Rota importada otimizada",
      mode: "shortest_distance",
      stops: [
        {
          address: "Rua Fernando Costa, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Fernando Costa, 900, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
        },
        {
          address: "Rua Fernando Costa, 120, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.3892,
          sequence: 2,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });

    expect(result.optimization.totalDistance).toBeLessThan(1200);
    expect(stops.map((stop: any) => stop.address)).not.toEqual([
      "Rua Fernando Costa, 100, Presidente Prudente - SP",
      "Rua Fernando Costa, 900, Presidente Prudente - SP",
      "Rua Fernando Costa, 120, Presidente Prudente - SP",
    ]);
  });

  it("saves and clears start/end points for an existing route", async () => {
    const caller = appRouter.createCaller(createAuthContext(8101));
    const route = await caller.routes.create({
      name: "Rota com inicio e fim",
      mode: "balanced",
    });

    await caller.routes.update({
      id: route.id,
      startLocation: "Rua Inicio, 100, Presidente Prudente - SP",
      startLatitude: -22.1207,
      startLongitude: -51.3889,
      endLocation: "Rua Fim, 200, Presidente Prudente - SP",
      endLatitude: -22.1307,
      endLongitude: -51.3989,
    });

    const updatedRoute = await caller.routes.get({ id: route.id });

    expect(updatedRoute?.startLocation).toBe(
      "Rua Inicio, 100, Presidente Prudente - SP"
    );
    expect(Number(updatedRoute?.startLatitude)).toBe(-22.1207);
    expect(updatedRoute?.endLocation).toBe(
      "Rua Fim, 200, Presidente Prudente - SP"
    );
    expect(Number(updatedRoute?.endLongitude)).toBe(-51.3989);

    await caller.routes.update({
      id: route.id,
      startLocation: null,
      startLatitude: null,
      startLongitude: null,
      endLocation: null,
      endLatitude: null,
      endLongitude: null,
    });

    const clearedRoute = await caller.routes.get({ id: route.id });

    expect(clearedRoute?.startLocation).toBeNull();
    expect(clearedRoute?.startLatitude).toBeNull();
    expect(clearedRoute?.endLocation).toBeNull();
    expect(clearedRoute?.endLongitude).toBeNull();
  });

  it("updates an existing stop and marks the route for reoptimization", async () => {
    const caller = appRouter.createCaller(createAuthContext(8205));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com parada editavel",
      mode: "balanced",
      stops: [
        {
          address: "Rua A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          notes: "Pacote: 1",
        },
        {
          address: "Rua B, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
          notes: "Pacote: 2",
        },
      ],
    });
    const [firstStop] = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.update({
      routeId: result.route.id,
      stopId: firstStop.id,
      address: "Rua Editada, 1520, Presidente Prudente - SP",
      latitude: -22.1407,
      longitude: -51.4089,
      sequence: Number(firstStop.sequence),
      notes: "Pacote: 1520",
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    const route = await caller.routes.get({ id: result.route.id });

    expect(stops.some((stop: any) => stop.address.includes("1520"))).toBe(true);
    expect(stops.some((stop: any) => stop.notes === "Pacote: 1520")).toBe(true);
    expect(route?.status).toBe("draft");
  });

  it("deletes an existing stop and marks the route for reoptimization", async () => {
    const caller = appRouter.createCaller(createAuthContext(8206));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com parada removivel",
      mode: "balanced",
      stops: [
        {
          address: "Rua A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua B, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
        },
        {
          address: "Rua C, Presidente Prudente - SP",
          latitude: -22.1407,
          longitude: -51.4089,
          sequence: 2,
        },
      ],
    });
    const stopsBeforeDelete = await caller.stops.list({
      routeId: result.route.id,
    });

    await caller.stops.delete({
      routeId: result.route.id,
      stopId: stopsBeforeDelete[1].id,
    });

    const stopsAfterDelete = await caller.stops.list({
      routeId: result.route.id,
    });
    const route = await caller.routes.get({ id: result.route.id });

    expect(stopsAfterDelete).toHaveLength(2);
    expect(stopsAfterDelete.map((stop: any) => stop.id)).not.toContain(
      stopsBeforeDelete[1].id
    );
    expect(route?.status).toBe("draft");
  });

  it("reoptimizes only remaining stops and removes handled stops from the active route", async () => {
    const caller = appRouter.createCaller(createAuthContext(8207));

    const result = await caller.routes.createAndOptimize({
      name: "Rota restante",
      mode: "shortest_distance",
      stops: [
        {
          address: "Rua Doutor Gurgel, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Doutor Gurgel, 120, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.3892,
          sequence: 1,
        },
        {
          address: "Rua Doutor Gurgel, 140, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.3902,
          sequence: 2,
        },
        {
          address: "Rua Doutor Gurgel, 160, Presidente Prudente - SP",
          latitude: -22.123,
          longitude: -51.3912,
          sequence: 3,
        },
      ],
    });
    const stopsBeforeReoptimize = await caller.stops.list({
      routeId: result.route.id,
    });
    const handledStops = stopsBeforeReoptimize.filter((stop: any) =>
      [
        "Rua Doutor Gurgel, 100, Presidente Prudente - SP",
        "Rua Doutor Gurgel, 120, Presidente Prudente - SP",
      ].includes(stop.address)
    );

    await caller.routes.optimizeRemaining({
      id: result.route.id,
      mode: "shortest_distance",
      excludeStopIds: handledStops.map((stop: any) => stop.id),
    });

    const stopsAfterReoptimize = await caller.stops.list({
      routeId: result.route.id,
    });

    expect(stopsAfterReoptimize).toHaveLength(2);
    expect(
      stopsAfterReoptimize.map((stop: any) => stop.address).sort()
    ).toEqual([
      "Rua Doutor Gurgel, 140, Presidente Prudente - SP",
      "Rua Doutor Gurgel, 160, Presidente Prudente - SP",
    ]);
  });

  it("uses last optimization metadata when recalculating the route audit panel", async () => {
    const caller = appRouter.createCaller(createAuthContext(8208));

    const result = await caller.routes.createAndOptimize({
      name: "Rota auditada com ordem preservada",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 900, Presidente Prudente - SP",
          latitude: -22.14,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Doutor Jose Foz, 120, Presidente Prudente - SP",
          latitude: -22.12001,
          longitude: -51.40001,
          sequence: 1,
        },
      ],
    });

    const audit = await caller.routes.audit({ id: result.route.id });

    expect(audit.context.respectInputSequence).toBe(true);
    expect(audit.context.requireStartLocation).toBe(true);
    expect(
      audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")
    ).toBe(true);
    expect(
      audit.issues.some((issue: any) => issue.type === "missing_driver_origin")
    ).toBe(true);
  });

  it("does not reuse optimization audit metadata after manual route edits", async () => {
    const caller = appRouter.createCaller(createAuthContext(8209));

    const result = await caller.routes.createAndOptimize({
      name: "Rota auditada editada",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 900, Presidente Prudente - SP",
          latitude: -22.14,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Doutor Jose Foz, 120, Presidente Prudente - SP",
          latitude: -22.12001,
          longitude: -51.40001,
          sequence: 1,
        },
      ],
    });
    const stops = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.update({
      routeId: result.route.id,
      stopId: stops[0].id,
      address: stops[0].address,
      latitude: Number(stops[0].latitude),
      longitude: Number(stops[0].longitude),
      sequence: Number(stops[0].sequence),
      notes: "editada manualmente",
    });

    const audit = await caller.routes.audit({ id: result.route.id });

    expect(audit.context.staleOptimizationContext).toBe(true);
    expect(audit.context.respectInputSequence).toBeNull();
    expect(audit.context.requireStartLocation).toBe(false);
    expect(
      audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")
    ).toBe(false);
    expect(
      audit.issues.some((issue: any) => issue.type === "missing_driver_origin")
    ).toBe(false);
  });

  it("marks an optimized route as draft when a new stop is added", async () => {
    const caller = appRouter.createCaller(createAuthContext(8210));

    const result = await caller.routes.createAndOptimize({
      name: "Rota auditada com parada nova",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 900, Presidente Prudente - SP",
          latitude: -22.14,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Doutor Jose Foz, 120, Presidente Prudente - SP",
          latitude: -22.12001,
          longitude: -51.40001,
          sequence: 1,
        },
      ],
    });

    await caller.stops.create({
      routeId: result.route.id,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 140, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 2,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });
    const audit = await caller.routes.audit({ id: result.route.id });

    expect(route?.status).toBe("draft");
    expect(audit.context.staleOptimizationContext).toBe(true);
    expect(audit.context.respectInputSequence).toBeNull();
    expect(audit.context.requireStartLocation).toBe(false);
    expect(
      audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")
    ).toBe(false);
  });
});
