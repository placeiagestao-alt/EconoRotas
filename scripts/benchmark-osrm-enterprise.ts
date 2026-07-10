import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import type { Location } from "../server/optimization";

for (const path of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.worker.production",
]) {
  if (fs.existsSync(path)) dotenv.config({ path, override: true });
}

const { getOsrmConfiguration, optimizeRouteWithRoadMetrics } =
  await import("../server/osrm");
const { ENV } = await import("../server/_core/env");
const { createOperationalEvent, createPerformanceBenchmark } =
  await import("../server/db");
const { auditRouteSequence } = await import("../server/routeAudit");
const {
  evaluatePerformanceBenchmarkRun,
  PERFORMANCE_BENCHMARK_MAX_OSRM_FAILURE_RATE,
  PERFORMANCE_BENCHMARK_MIN_QUALITY_SCORE,
  PERFORMANCE_BENCHMARK_SAMPLE_SIZE,
  PERFORMANCE_BENCHMARK_TARGETS,
} = await import("../server/performanceBenchmarkPolicy");
const osrmConfiguration = getOsrmConfiguration();

function memoryMb() {
  const usage = process.memoryUsage();
  return Math.round((usage.rss || usage.heapUsed || 0) / 1024 / 1024);
}

function generateStops(count: number): Location[] {
  const baseLat = -22.121;
  const baseLng = -51.407;
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 0.00055;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      latitude: baseLat + row * spacing,
      longitude: baseLng + column * spacing,
      address: `Benchmark OSRM ${index + 1}`,
      geocodingConfidenceScore: 100,
      geocodingMethod: "manual_coordinate",
      geocodingSuspect: false,
    };
  });
}

async function runScenario(stopCount: number) {
  let osrmCalls = 0;
  let osrmFailures = 0;
  let osrmTotalMs = 0;
  let matrixCacheHit = 0;
  let matrixCacheMiss = 0;
  let matrixGenerationMs = 0;
  const osrmFailureReasons: Record<string, number> = {};
  const locations = generateStops(stopCount);
  const payloadBytes = Buffer.byteLength(JSON.stringify(locations), "utf8");
  const addressCounts = new Map<string, number>();
  const coordinateCounts = new Map<string, number>();
  for (const location of locations) {
    const addressKey = String(location.address || "")
      .trim()
      .toLowerCase();
    const coordinateKey = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
    addressCounts.set(addressKey, (addressCounts.get(addressKey) || 0) + 1);
    coordinateCounts.set(
      coordinateKey,
      (coordinateCounts.get(coordinateKey) || 0) + 1
    );
  }
  const duplicateAddressCount = Array.from(addressCounts.values()).filter(
    count => count > 1
  ).length;
  const duplicateCoordinateCount = Array.from(coordinateCounts.values()).filter(
    count => count > 1
  ).length;
  const startMemory = memoryMb();
  let peakMemory = startMemory;
  const startedAt = Date.now();
  const startedCpu = process.cpuUsage();

  const route = await optimizeRouteWithRoadMetrics(locations, "balanced", 0, {
    localityMode: "local",
    telemetry: {
      recordOsrmCall(durationMs, success) {
        osrmCalls += 1;
        osrmTotalMs += durationMs;
        if (!success) osrmFailures += 1;
        peakMemory = Math.max(peakMemory, memoryMb());
      },
      recordOsrmMatrix(args) {
        if (args.cacheHit) matrixCacheHit += 1;
        else matrixCacheMiss += 1;
        matrixGenerationMs += args.durationMs;
        if (args.failureReason) {
          osrmFailureReasons[args.failureReason] =
            (osrmFailureReasons[args.failureReason] || 0) + 1;
        }
        peakMemory = Math.max(peakMemory, memoryMb());
      },
    },
  });

  const optimizationRuntimeMs = Date.now() - startedAt;
  const auditStartedAt = Date.now();
  const audit = route
    ? auditRouteSequence(
        route.waypoints.map((waypoint, sequence) => ({
          ...waypoint,
          sequence,
        })),
        {
          actualTotalDistanceKm: route.totalDistance,
          usedRoadMetrics: true,
        }
      )
    : null;
  const auditRuntimeMs = Date.now() - auditStartedAt;
  const runtimeMs = Date.now() - startedAt;
  const cpu = process.cpuUsage(startedCpu);
  peakMemory = Math.max(peakMemory, memoryMb());
  const osrmLatencyMs = osrmCalls > 0 ? Math.round(osrmTotalMs / osrmCalls) : 0;
  const targetMs = PERFORMANCE_BENCHMARK_TARGETS[stopCount] ?? 0;
  const evaluation = evaluatePerformanceBenchmarkRun({
    stopCount,
    runtimeMs,
    success: Boolean(route),
    osrmCalls,
    osrmFailures,
    matrixCacheHit,
    matrixCacheMiss,
    providerType: osrmConfiguration.providerType,
    qualityScore: audit?.score ?? null,
    qualityStatus: audit?.quality ?? null,
    duplicateAddressCount,
    duplicateCoordinateCount,
    payloadBytes,
  });

  const result = {
    stopCount,
    success: Boolean(route),
    runtimeMs,
    optimizationRuntimeMs,
    auditRuntimeMs,
    userResponseMs: runtimeMs,
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
    cpuTotalMs: Math.round((cpu.user + cpu.system) / 1000),
    memoryStartMb: startMemory,
    memoryEndMb: memoryMb(),
    peakMemoryMb: peakMemory,
    osrmCalls,
    osrmFailures,
    osrmLatencyMs,
    osrmFailureRate:
      osrmCalls > 0 ? Math.round((osrmFailures / osrmCalls) * 1000) / 10 : 0,
    matrixCacheHit,
    matrixCacheMiss,
    matrixGenerationMs,
    osrmFailureReasons,
    totalDistanceKm: route?.totalDistance ?? null,
    totalTimeMinutes: route?.totalTime ?? null,
    partitioned: Boolean(route?.metadata?.partitioned),
    partitionCount: route?.metadata?.partitionCount ?? null,
    auditCycles: audit ? 1 : 0,
    qualityScore: audit?.score ?? null,
    qualityStatus: audit?.quality ?? null,
    qualityIssueCount: audit?.issueCount ?? null,
    microClusterCount: Number(route?.metadata?.partitionCount ?? 0),
    payloadBytes,
    duplicateAddressCount,
    duplicateCoordinateCount,
    executionMode: "direct-sync",
    workerUsed: false,
    queueUsed: false,
    criteriaMet: evaluation.passed,
    criteriaVersion: evaluation.criteriaVersion,
    failureReasons: evaluation.failureReasons,
    recommendedAction: evaluation.recommendedAction,
  };

  const persisted = await createPerformanceBenchmark({
    scenario: "osrm-enterprise",
    stopCount,
    runtimeMs,
    peakMemoryMb: peakMemory,
    queueWaitMs: 0,
    osrmLatencyMs,
    auditCycles: result.auditCycles,
    microClusterCount: result.microClusterCount,
    osrmCalls,
    osrmFailures,
    matrixCacheHit,
    matrixCacheMiss,
    success: Boolean(route),
    criteriaMet: result.criteriaMet,
    metadata: {
      memoryStartMb: startMemory,
      memoryEndMb: memoryMb(),
      matrixGenerationMs,
      optimizationRuntimeMs,
      auditRuntimeMs,
      userResponseMs: runtimeMs,
      cpuUserMs: result.cpuUserMs,
      cpuSystemMs: result.cpuSystemMs,
      cpuTotalMs: result.cpuTotalMs,
      payloadBytes,
      duplicateAddressCount,
      duplicateCoordinateCount,
      qualityScore: result.qualityScore,
      qualityStatus: result.qualityStatus,
      qualityIssueCount: result.qualityIssueCount,
      executionMode: result.executionMode,
      workerUsed: result.workerUsed,
      workerId: null,
      workerHostname: os.hostname(),
      queueUsed: result.queueUsed,
      osrmFailureReasons,
      cacheMode:
        matrixCacheMiss > 0 ? (matrixCacheHit > 0 ? "mixed" : "cold") : "warm",
      criteriaVersion: evaluation.criteriaVersion,
      failureReasons: evaluation.failureReasons,
      recommendedAction: evaluation.recommendedAction,
      totalDistanceKm: route?.totalDistance ?? null,
      totalTimeMinutes: route?.totalTime ?? null,
      partitioned: result.partitioned,
      partitionCount: result.partitionCount,
      osrmBaseUrl: osrmConfiguration.baseUrl,
      providerType: osrmConfiguration.providerType,
    },
  });
  const benchmarkPersisted = Boolean(persisted);
  const finalFailureReasons = benchmarkPersisted
    ? result.failureReasons
    : [...result.failureReasons, "Resultado do benchmark nao foi persistido."];
  const finalCriteriaMet = result.criteriaMet && benchmarkPersisted;

  if (stopCount === 500) {
    await createOperationalEvent({
      userId: null,
      routeId: null,
      stopId: null,
      type: finalCriteriaMet ? "benchmark_500_passed" : "benchmark_500_failed",
      severity: finalCriteriaMet ? "info" : "error",
      source: "benchmark.go-live-500",
      title: finalCriteriaMet
        ? "Benchmark oficial 500 aprovado"
        : "Benchmark oficial 500 reprovado",
      message: `500 paradas em ${runtimeMs} ms. Meta: 30000 ms.`,
      runtime: String(runtimeMs),
      metadata: {
        stopCount,
        runtimeMs,
        targetMs,
        criteriaMet: finalCriteriaMet,
        osrmCalls,
        osrmFailures,
        osrmFailureRate: result.osrmFailureRate,
        osrmBaseUrl: osrmConfiguration.baseUrl,
        peakMemoryMb: peakMemory,
        matrixCacheHit,
        matrixCacheMiss,
        failureReasons: finalFailureReasons,
        recommendedAction:
          finalFailureReasons[0] ?? evaluation.recommendedAction,
      },
    });
  }

  return {
    ...result,
    criteriaMet: finalCriteriaMet,
    failureReasons: finalFailureReasons,
    recommendedAction: finalFailureReasons[0] ?? evaluation.recommendedAction,
    persisted: benchmarkPersisted,
  };
}

const scenarios = process.argv
  .slice(2)
  .map(Number)
  .filter(
    value =>
      Number.isFinite(value) &&
      Object.prototype.hasOwnProperty.call(PERFORMANCE_BENCHMARK_TARGETS, value)
  );
const stopCounts = scenarios.length
  ? scenarios
  : [50, 150, 250, 500, 1000, 2000];

console.log(
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      osrm: {
        enabled: ENV.osrmEnabled,
        required: ENV.osrmRequired,
        baseUrl: osrmConfiguration.baseUrl,
        timeoutMs: ENV.osrmRequestTimeoutMs,
      },
      scenarios: [],
    },
    null,
    2
  )
);

const results = [];
for (const stopCount of stopCounts) {
  results.push(await runScenario(stopCount));
}

console.log(
  JSON.stringify(
    {
      finishedAt: new Date().toISOString(),
      results,
      criteria: {
        "50": "< 5000 ms",
        "150": "< 10000 ms",
        "250": "< 15000 ms",
        "500": "< 30000 ms",
        "1000": "< 60000 ms",
        "2000": "< 180000 ms",
        osrmFailureRate: `< ${PERFORMANCE_BENCHMARK_MAX_OSRM_FAILURE_RATE}%`,
        minimumQualityScore: PERFORMANCE_BENCHMARK_MIN_QUALITY_SCORE,
        minimumSampleSize: PERFORMANCE_BENCHMARK_SAMPLE_SIZE,
        provider: "OSRM proprio",
        cache: "cold-cache comprovado",
      },
    },
    null,
    2
  )
);

process.exitCode = results.every(result => result.criteriaMet) ? 0 : 1;
