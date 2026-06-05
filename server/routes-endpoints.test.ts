import { afterEach, describe, expect, it } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number, role: "user" | "admin" = "user"): TrpcContext {
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
    ENV.maxSyncStops = 250;
    ENV.bullmqRedisUrl = "";
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
    expect(metrics.geocodingConfidence.suspiciousStopRate).toBeGreaterThanOrEqual(0);
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
    expect(impact.last30Days.confidenceDistribution.score_81_100).toBeGreaterThanOrEqual(0);
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
    expect(report.monthlyEvolution.manualCorrections.topAddresses.length).toBeGreaterThan(0);
  });

  it("blocks optimization when a stop has low geocoding confidence", async () => {
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

    expect(result.route.status).toBe("draft");
    expect(result.optimization).toBeNull();
    expect(result.warning).toContain("Coordenada com baixa confianca");
  });

  it("blocks route optimization when OSRM is required and road metrics are unavailable", async () => {
    ENV.osrmRequired = true;
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
    expect(metrics.commercialImpact.estimatedMinutesSaved).toBeGreaterThanOrEqual(5);
    expect(metrics.commercialImpact.estimatedFuelLitersSaved).toBeGreaterThan(0);
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
    expect(metrics.partitioning.partitionedRouteCount).toBeGreaterThanOrEqual(1);
    expect(metrics.partitioning.averagePartitionCount).toBeGreaterThanOrEqual(3);
    expect(metrics.partitioning.largestPartitionSize).toBeGreaterThanOrEqual(62);
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

  it("keeps route as draft when optimization finds a generic address", async () => {
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

    expect(result.optimization).toBeNull();
    expect(result.warning).toContain("Endereco generico");
    expect(route?.status).toBe("draft");
  });

  it("reoptimizes automatically when the auditor finds a poor preserved sequence", async () => {
    const caller = appRouter.createCaller(createAuthContext(8212));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com sequencia reprovada",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Auditoria, 100, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Auditoria, 300, Presidente Prudente - SP",
          latitude: -22.1218,
          longitude: -51.4,
          sequence: 1,
        },
        {
          address: "Rua Auditoria, 120, Presidente Prudente - SP",
          latitude: -22.1204,
          longitude: -51.4,
          sequence: 2,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });

    expect(result.optimization).not.toBeNull();
    expect(result.optimization?.auditSource).toContain("audit-corrected");
    expect(
      result.optimization?.audit.issues.some(
        (issue: any) => issue.type === "nearby_stop_skipped"
      )
    ).toBe(false);
    expect(route?.status).toBe("optimized");
  });

  it("rejects reoptimization when too many addresses share approximate coordinates", async () => {
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

    await expect(caller.routes.optimize({ id: route.id })).rejects.toThrow(
      "Geocodificacao imprecisa"
    );

    const routeAfter = await caller.routes.get({ id: route.id });
    const stopsAfter = await caller.stops.list({ routeId: route.id });

    expect(routeAfter?.status).toBe("draft");
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

  it("corrects incoherent input stop order even when sequential routing is requested", async () => {
    const caller = appRouter.createCaller(createAuthContext(8203));

    const result = await caller.routes.createAndOptimize({
      name: "Rota por STOP",
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
    expect(result.optimization?.auditSource).toContain("audit");
    expect(
      result.optimization?.audit.issues.some(
        (issue: any) =>
          issue.type === "nearby_stop_skipped" || issue.type === "region_revisited"
      )
    ).toBe(false);
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Jose Bongiovani, 100, Presidente Prudente - SP",
      "Rua Jose Bongiovani, 300, Presidente Prudente - SP",
      "Rua Jose Bongiovani, 200, Presidente Prudente - SP",
    ]);
    expect(stops.map((stop: any) => Number(stop.sequence))).toEqual([0, 1, 2]);
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
    expect(updatedRoute?.endLocation).toBe("Rua Fim, 200, Presidente Prudente - SP");
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
    const stopsBeforeDelete = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.delete({
      routeId: result.route.id,
      stopId: stopsBeforeDelete[1].id,
    });

    const stopsAfterDelete = await caller.stops.list({ routeId: result.route.id });
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
    const stopsBeforeReoptimize = await caller.stops.list({ routeId: result.route.id });
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

    const stopsAfterReoptimize = await caller.stops.list({ routeId: result.route.id });

    expect(stopsAfterReoptimize).toHaveLength(2);
    expect(stopsAfterReoptimize.map((stop: any) => stop.address).sort()).toEqual([
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
    expect(audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")).toBe(
      true
    );
    expect(audit.issues.some((issue: any) => issue.type === "missing_driver_origin")).toBe(
      true
    );
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
    expect(audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")).toBe(
      false
    );
    expect(audit.issues.some((issue: any) => issue.type === "missing_driver_origin")).toBe(
      false
    );
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
    expect(audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")).toBe(
      false
    );
  });
});
