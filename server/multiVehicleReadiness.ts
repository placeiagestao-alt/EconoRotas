import { ENV } from "./_core/env";
import { getOsrmHealth } from "./osrm";
import {
  getOptimizationQueueHealth,
  getOptimizationWorkersDashboard,
} from "./optimizationQueue";
import * as db from "./db";

type ReadinessStatus = "READY" | "PARTIAL" | "NO-GO";

type ReadinessItem = {
  status: ReadinessStatus;
  evidence: Record<string, unknown>;
  blockers: string[];
};

async function safeRead<T>(
  reader: () => Promise<T>,
  fallback: T,
  timeoutMs = 12_000
): Promise<T> {
  try {
    return await Promise.race([
      reader(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout apos ${timeoutMs}ms.`)), timeoutMs)
      ),
    ]);
  } catch (error) {
    return {
      ...(fallback as Record<string, unknown>),
      error: error instanceof Error ? error.message : String(error),
    } as T;
  }
}

function isEnterpriseOsrm(baseUrl: string | null) {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && url.hostname === "osrm.econorotas.com";
  } catch {
    return false;
  }
}

function benchmarkItem(
  performanceBenchmarks: any,
  stopCount: number
): ReadinessItem {
  const target = performanceBenchmarks?.targets?.find(
    (item: any) => Number(item.stopCount) === stopCount
  );
  const blockers: string[] = [];

  if (!target) {
    blockers.push(`Sem benchmark persistido para ${stopCount} paradas.`);
  } else {
    if (target.status !== "ready") {
      blockers.push(
        `Benchmark ${stopCount} paradas nao atingiu a meta comprovada.`
      );
    }
    if (Number(target.latestRuntimeMs || 0) <= 0) {
      blockers.push(`Benchmark ${stopCount} paradas sem runtime valido.`);
    }
  }

  return {
    status: blockers.length ? "NO-GO" : "READY",
    evidence: {
      stopCount,
      targetMs: target?.targetMs ?? null,
      latestRuntimeMs: target?.latestRuntimeMs ?? null,
      latestQueueWaitMs: target?.latestQueueWaitMs ?? null,
      latestPeakMemoryMb: target?.latestPeakMemoryMb ?? null,
      latestOsrmLatencyMs: target?.latestOsrmLatencyMs ?? null,
      latestMicroClusterCount: target?.latestMicroClusterCount ?? null,
      latestCriteriaMet: target?.latestCriteriaMet ?? false,
      latestAt: target?.latestAt ?? null,
      runs: target?.runs ?? 0,
      status: target?.status ?? "missing",
    },
    blockers,
  };
}

function readinessStatus(items: ReadinessItem[]): ReadinessStatus {
  if (items.some((item) => item.status === "NO-GO")) return "NO-GO";
  if (items.some((item) => item.status === "PARTIAL")) return "PARTIAL";
  return "READY";
}

export async function getMultiVehicleReadinessDashboard() {
  const disasterRecovery = await safeRead<any>(
    () => db.getDisasterReadinessDashboard(),
    {
      status: "critical",
      lastBackupAt: null,
      backupAgeHours: null,
      backupStatus: "unknown",
      restoreTestAt: null,
      restoreTestPassed: false,
      rpoTargetHours: 24,
      rtoTargetHours: 4,
      alerts: [],
    },
    25_000
  );
  const [osrm, queue, workers, queueIntegrity, performanceBenchmarks] =
    await Promise.all([
      safeRead(() => getOsrmHealth(), {
        enabled: ENV.osrmEnabled,
        required: ENV.osrmRequired,
        configured: Boolean(ENV.osrmBaseUrl),
        reachable: false,
        baseUrl: ENV.osrmBaseUrl || null,
        timeoutMs: ENV.osrmHealthTimeoutMs,
        error: "Falha ao consultar OSRM.",
      }),
      safeRead(() => getOptimizationQueueHealth(), {
        configured: false,
        reachable: false,
        queueName: "econorota-optimization",
        counts: null,
        error: "Falha ao consultar fila.",
      }),
      safeRead(() => getOptimizationWorkersDashboard(), {
        minimumWorkerCount: 2,
        workerCount: 0,
        status: "warning",
        alert: null,
        workerJobsProcessed: 0,
        workerJobsFailed: 0,
        workerAverageRuntime: 0,
        workers: [],
      }),
      safeRead<any>(
        () => db.getQueueIntegrityDashboard(),
        {
          status: "attention",
          duplicateJobs: 0,
          failedRecoveries: 0,
          stalledJobs: 0,
        },
        25_000
      ),
      safeRead<any>(
        () => db.getPerformanceBenchmarkDashboard(),
        {
          status: "unavailable",
          targets: [],
          totalRuns: 0,
        },
        25_000
      ),
    ]);

  const osrmBlockers: string[] = [];
  const enterprise = isEnterpriseOsrm(osrm.baseUrl);
  if (!osrm.enabled) osrmBlockers.push("OSRM desativado.");
  if (!osrm.configured) osrmBlockers.push("OSRM_BASE_URL nao configurado.");
  if (!osrm.reachable) osrmBlockers.push("OSRM nao respondeu ao health.");
  if (!enterprise) {
    osrmBlockers.push("OSRM_BASE_URL ainda nao aponta para https://osrm.econorotas.com.");
  }
  if (!osrm.required) {
    osrmBlockers.push("OSRM_REQUIRED ainda nao esta ativo.");
  }

  const osrmEnterprise: ReadinessItem = {
    status:
      osrmBlockers.length === 0
        ? "READY"
        : osrm.reachable && osrm.enabled
          ? "PARTIAL"
          : "NO-GO",
    evidence: {
      enabled: osrm.enabled,
      required: osrm.required,
      configured: osrm.configured,
      reachable: osrm.reachable,
      baseUrl: osrm.baseUrl,
      timeoutMs: osrm.timeoutMs,
      requiredMinStops: ENV.osrmRequiredMinStops,
      enterprise,
      error: osrm.error,
    },
    blockers: osrmBlockers,
  };

  const workerBlockers: string[] = [];
  if (!queue.configured) workerBlockers.push("Redis/BullMQ nao configurado.");
  if (!queue.reachable) workerBlockers.push("Fila BullMQ nao esta acessivel.");
  if (Number(workers.workerCount || 0) < Number(workers.minimumWorkerCount || 2)) {
    workerBlockers.push(
      `Apenas ${workers.workerCount || 0} worker(s) online; minimo exigido: ${workers.minimumWorkerCount || 2}.`
    );
  }
  if (queueIntegrity.status !== "healthy") {
    workerBlockers.push("Integridade da fila nao esta saudavel.");
  }

  const workerRedundancy: ReadinessItem = {
    status: workerBlockers.length === 0 ? "READY" : queue.reachable ? "PARTIAL" : "NO-GO",
    evidence: {
      queueConfigured: queue.configured,
      queueReachable: queue.reachable,
      workerCount: workers.workerCount,
      minimumWorkerCount: workers.minimumWorkerCount,
      workerHeartbeatCount: (queue as any).workerHeartbeatCount ?? null,
      queueIntegrityStatus: queueIntegrity.status,
      duplicateJobs: queueIntegrity.duplicateJobs,
      failedRecoveries: queueIntegrity.failedRecoveries,
      stalledJobs: queueIntegrity.stalledJobs,
      workers: workers.workers,
    },
    blockers: workerBlockers,
  };

  const disasterBlockers: string[] = [];
  if (disasterRecovery.status !== "healthy") {
    disasterBlockers.push("Disaster Recovery nao esta healthy.");
  }
  if (!disasterRecovery.lastBackupAt) {
    disasterBlockers.push("Sem evidencia de backup real.");
  }
  if (!disasterRecovery.restoreTestPassed) {
    disasterBlockers.push("Sem evidencia de restore real aprovado.");
  }

  const disasterRecoveryItem: ReadinessItem = {
    status: disasterBlockers.length === 0 ? "READY" : "NO-GO",
    evidence: {
      status: disasterRecovery.status,
      lastBackupAt: disasterRecovery.lastBackupAt,
      backupAgeHours: disasterRecovery.backupAgeHours,
      backupStatus: disasterRecovery.backupStatus,
      restoreTestAt: disasterRecovery.restoreTestAt,
      restoreTestPassed: disasterRecovery.restoreTestPassed,
      rpoTargetHours: disasterRecovery.rpoTargetHours,
      rtoTargetHours: disasterRecovery.rtoTargetHours,
      alertCount: disasterRecovery.alerts?.length ?? 0,
      error: disasterRecovery.error ?? null,
    },
    blockers: disasterBlockers,
  };

  const benchmark250 = benchmarkItem(performanceBenchmarks, 250);
  const benchmark500 = benchmarkItem(performanceBenchmarks, 500);
  const benchmark1000 = benchmarkItem(performanceBenchmarks, 1000);
  const benchmark2000 = benchmarkItem(performanceBenchmarks, 2000);

  const items = {
    osrmEnterprise,
    workerRedundancy,
    disasterRecovery: disasterRecoveryItem,
    benchmark250,
    benchmark500,
    benchmark1000,
    benchmark2000,
  };
  const itemList = Object.values(items);
  const multiVehicle: ReadinessItem = {
    status: readinessStatus(itemList),
    evidence: {
      requiredReadyItems: Object.keys(items),
      checkedAt: new Date().toISOString(),
    },
    blockers: itemList.flatMap((item) => item.blockers),
  };

  return {
    status: multiVehicle.status,
    items,
    multiVehicle,
    checkedAt: new Date().toISOString(),
  };
}
