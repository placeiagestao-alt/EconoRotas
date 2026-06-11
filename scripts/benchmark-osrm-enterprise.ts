import dotenv from "dotenv";
import fs from "node:fs";
import type { Location } from "../server/optimization";

for (const path of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.worker.production",
]) {
  if (fs.existsSync(path)) dotenv.config({ path, override: true });
}

const { optimizeRouteWithRoadMetrics } = await import("../server/osrm");
const { ENV } = await import("../server/_core/env");
const { createOperationalEvent, createPerformanceBenchmark } = await import("../server/db");

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
  const startMemory = memoryMb();
  let peakMemory = startMemory;
  const startedAt = Date.now();

  const route = await optimizeRouteWithRoadMetrics(
    generateStops(stopCount),
    "balanced",
    0,
    {
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
          peakMemory = Math.max(peakMemory, memoryMb());
        },
      },
    }
  );

  const runtimeMs = Date.now() - startedAt;
  peakMemory = Math.max(peakMemory, memoryMb());
  const osrmLatencyMs = osrmCalls > 0 ? Math.round(osrmTotalMs / osrmCalls) : 0;
  const targetMs =
    stopCount === 250
      ? 15_000
      : stopCount === 500
        ? 30_000
        : stopCount === 1000
          ? 60_000
          : stopCount === 2000
            ? 180_000
            : 0;

  const result = {
    stopCount,
    success: Boolean(route),
    runtimeMs,
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
    totalDistanceKm: route?.totalDistance ?? null,
    totalTimeMinutes: route?.totalTime ?? null,
    partitioned: Boolean(route?.metadata?.partitioned),
    partitionCount: route?.metadata?.partitionCount ?? null,
    auditCycles: 0,
    microClusterCount: Number(route?.metadata?.partitionCount ?? 0),
    criteriaMet: Boolean(route) && (targetMs > 0 ? runtimeMs < targetMs : true),
  };

  await createPerformanceBenchmark({
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
      totalDistanceKm: route?.totalDistance ?? null,
      totalTimeMinutes: route?.totalTime ?? null,
      partitioned: result.partitioned,
      partitionCount: result.partitionCount,
      osrmBaseUrl: ENV.osrmBaseUrl,
    },
  });

  if (stopCount === 500) {
    await createOperationalEvent({
      userId: null,
      routeId: null,
      stopId: null,
      type: result.criteriaMet ? "benchmark_500_passed" : "benchmark_500_failed",
      severity: result.criteriaMet ? "info" : "error",
      source: "benchmark.go-live-500",
      title: result.criteriaMet
        ? "Benchmark oficial 500 aprovado"
        : "Benchmark oficial 500 reprovado",
      message: `500 paradas em ${runtimeMs} ms. Meta: 30000 ms.`,
      runtime: String(runtimeMs),
      metadata: {
        stopCount,
        runtimeMs,
        targetMs,
        criteriaMet: result.criteriaMet,
        osrmCalls,
        osrmFailures,
        osrmFailureRate: result.osrmFailureRate,
        osrmBaseUrl: ENV.osrmBaseUrl,
        peakMemoryMb: peakMemory,
        matrixCacheHit,
        matrixCacheMiss,
      },
    });
  }

  return result;
}

const scenarios = process.argv
  .slice(2)
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0);
const stopCounts = scenarios.length ? scenarios : [250, 500, 1000, 2000];

console.log(
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      osrm: {
        enabled: ENV.osrmEnabled,
        required: ENV.osrmRequired,
        baseUrl: ENV.osrmBaseUrl,
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
        "250": "< 15000 ms",
        "500": "< 30000 ms",
        "1000": "< 60000 ms",
        "2000": "< 180000 ms",
        osrmFailureRate: "< 1%",
      },
    },
    null,
    2
  )
);

process.exit(0);
