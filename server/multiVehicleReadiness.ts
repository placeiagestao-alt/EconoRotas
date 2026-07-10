import { ENV } from "./_core/env";
import { getOsrmConfiguration, getOsrmHealth } from "./osrm";
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
  actions: string[];
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
        setTimeout(
          () => reject(new Error(`Timeout apos ${timeoutMs}ms.`)),
          timeoutMs
        )
      ),
    ]);
  } catch (error) {
    return {
      ...(fallback as Record<string, unknown>),
      error: error instanceof Error ? error.message : String(error),
    } as T;
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
    blockers.push(...(target.failureReasons ?? []));
  }

  const actions = blockers.length
    ? [
        target?.recommendedAction ??
          `Executar benchmark controlado de ${stopCount} paradas com OSRM proprio.`,
      ]
    : [`Manter ao menos ${target.minimumSampleSize ?? 3} amostras validas.`];

  return {
    status: blockers.length ? "NO-GO" : "READY",
    evidence: {
      stopCount,
      targetMs: target?.targetMs ?? null,
      latestRuntimeMs: target?.latestRuntimeMs ?? null,
      runtimeWithinTarget: target?.latestRuntimeWithinTarget ?? false,
      latestSuccess: target?.latestSuccess ?? false,
      latestStoredCriteriaMet: target?.latestStoredCriteriaMet ?? false,
      latestQueueWaitMs: target?.latestQueueWaitMs ?? null,
      latestPeakMemoryMb: target?.latestPeakMemoryMb ?? null,
      latestOsrmLatencyMs: target?.latestOsrmLatencyMs ?? null,
      latestMicroClusterCount: target?.latestMicroClusterCount ?? null,
      latestCriteriaMet: target?.latestCriteriaMet ?? false,
      latestOsrmCalls: target?.latestOsrmCalls ?? 0,
      latestOsrmFailures: target?.latestOsrmFailures ?? 0,
      latestOsrmFailureRate: target?.latestOsrmFailureRate ?? null,
      latestMatrixCacheHit: target?.latestMatrixCacheHit ?? 0,
      latestMatrixCacheMiss: target?.latestMatrixCacheMiss ?? 0,
      latestProviderType: target?.latestProviderType ?? null,
      latestQualityScore: target?.latestQualityScore ?? null,
      latestQualityStatus: target?.latestQualityStatus ?? null,
      latestPayloadBytes: target?.latestPayloadBytes ?? null,
      latestExecutionMode: target?.latestExecutionMode ?? null,
      latestQueueUsed: target?.latestQueueUsed ?? false,
      latestWorkerUsed: target?.latestWorkerUsed ?? false,
      latestWorkerHostname: target?.latestWorkerHostname ?? null,
      latestAt: target?.latestAt ?? null,
      runs: target?.runs ?? 0,
      validRuns: target?.validRuns ?? 0,
      minimumSampleSize: target?.minimumSampleSize ?? 3,
      failureReasons: blockers,
      status: target?.status ?? "missing",
    },
    blockers,
    actions,
  };
}

function readinessStatus(items: ReadinessItem[]): ReadinessStatus {
  if (items.some(item => item.status === "NO-GO")) return "NO-GO";
  if (items.some(item => item.status === "PARTIAL")) return "PARTIAL";
  return "READY";
}

export function evaluateWorkerRedundancy(workers: {
  workerCount?: number;
  minimumWorkerCount?: number;
  workers?: Array<{ hostname?: string | null; workerHostname?: string | null }>;
}) {
  const workerCount = Number(workers.workerCount || 0);
  const minimumWorkerCount = Number(workers.minimumWorkerCount || 2);
  const workerHostnames = (workers.workers ?? [])
    .map(worker => worker.hostname ?? worker.workerHostname ?? null)
    .filter((hostname): hostname is string =>
      Boolean(typeof hostname === "string" && hostname.trim())
    );
  const distinctWorkerHosts = new Set(workerHostnames).size;
  const blockers: string[] = [];

  if (workerCount < minimumWorkerCount) {
    blockers.push(
      `Apenas ${workerCount} worker(s) online; minimo exigido: ${minimumWorkerCount}.`
    );
  } else if (distinctWorkerHosts < minimumWorkerCount) {
    blockers.push(
      `${workerCount} workers online, mas em apenas ${distinctWorkerHosts} host(s); sem redundancia de host.`
    );
  }

  return {
    workerCount,
    minimumWorkerCount,
    workerHostnames,
    distinctWorkerHosts,
    blockers,
  };
}

export async function getMultiVehicleReadinessDashboard() {
  const osrmConfiguration = getOsrmConfiguration();
  const [
    disasterRecovery,
    database,
    osrm,
    queue,
    workers,
    queueIntegrity,
    performanceBenchmarks,
  ] = await Promise.all([
    safeRead<any>(
      () => db.getDisasterReadinessDashboard(),
      {
        status: "no-go",
        reason: "Falha ao consultar Disaster Recovery.",
        nextAction: "Restaurar a consulta de evidencias DR.",
        lastBackupAt: null,
        backupAgeHours: null,
        backupStatus: "unknown",
        restoreTestAt: null,
        restoreAgeHours: null,
        restoreStatus: "missing",
        restoreTestPassed: false,
        rpoTargetHours: 24,
        rtoTargetHours: 4,
        restoreMaxAgeHours: 168,
        retentionDays: 14,
        recurringEvidence: false,
        alerts: [],
      },
      25_000
    ),
    safeRead<any>(() => db.getDatabaseHealth(), {
      configured: false,
      reachable: false,
      connected: false,
      schema: null,
      error: "Falha ao consultar banco.",
    }),
    safeRead(() => getOsrmHealth(), {
      enabled: ENV.osrmEnabled,
      required: ENV.osrmRequired,
      configured: osrmConfiguration.configured,
      configurationValid: false,
      reachable: false,
      baseUrl: osrmConfiguration.baseUrl,
      profile: ENV.osrmProfile,
      providerType: "invalid" as const,
      isPublic: false,
      productionEligible: false,
      productionReady: false,
      usable: false,
      fallbackPolicy: ENV.osrmRequired
        ? ("blocked" as const)
        : ("geographic_allowed" as const),
      status: "no-go" as const,
      reason: "Falha ao consultar OSRM.",
      timeoutMs: ENV.osrmHealthTimeoutMs,
      requestTimeoutMs: ENV.osrmRequestTimeoutMs,
      maxTableNodes: 0,
      retries: 0,
      services: ["route", "table"] as Array<"route" | "table">,
      healthCheckSkipped: false,
      error: "Falha ao consultar OSRM.",
    }),
    safeRead<any>(() => getOptimizationQueueHealth(), {
      configured: false,
      reachable: false,
      queueName: "econorota-optimization",
      counts: null,
      redis: {
        maxmemoryPolicy: null,
        policyTarget: "noeviction",
        policyCompliant: null,
        error: null,
      },
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
  if (!osrm.enabled) osrmBlockers.push("OSRM desativado.");
  if (!osrm.configured) osrmBlockers.push("OSRM_BASE_URL nao configurado.");
  if (!osrm.configurationValid)
    osrmBlockers.push("Configuracao OSRM invalida.");
  if (!osrm.reachable) osrmBlockers.push("OSRM nao respondeu ao health.");
  if (osrm.providerType !== "self_hosted") {
    osrmBlockers.push("OSRM ainda nao aponta para uma instancia propria.");
  }
  if (!osrm.productionEligible) {
    osrmBlockers.push(
      "OSRM nao atende a politica de producao propria com HTTPS."
    );
  }
  if (!osrm.required) {
    osrmBlockers.push("OSRM_REQUIRED ainda nao esta ativo.");
  }

  const osrmEnterprise: ReadinessItem = {
    status:
      osrmBlockers.length === 0
        ? "READY"
        : osrm.status === "no-go"
          ? "NO-GO"
          : osrm.reachable && osrm.enabled
            ? "PARTIAL"
            : "NO-GO",
    evidence: {
      enabled: osrm.enabled,
      required: osrm.required,
      configured: osrm.configured,
      reachable: osrm.reachable,
      baseUrl: osrm.baseUrl,
      profile: osrm.profile,
      providerType: osrm.providerType,
      isPublic: osrm.isPublic,
      timeoutMs: osrm.timeoutMs,
      productionEligible: osrm.productionEligible,
      productionReady: osrm.productionReady,
      fallbackPolicy: osrm.fallbackPolicy,
      status: osrm.status,
      reason: osrm.reason,
      error: osrm.error,
    },
    blockers: osrmBlockers,
    actions:
      osrmBlockers.length > 0
        ? [
            "Configurar OSRM_BASE_URL proprio com HTTPS, validar health e ativar OSRM_REQUIRED=true.",
          ]
        : ["Manter health do OSRM proprio monitorado."],
  };

  const redisPolicy = (queue as any).redis;
  const queueBlockers: string[] = [];
  if (!queue.configured) queueBlockers.push("Redis/BullMQ nao configurado.");
  if (!queue.reachable) queueBlockers.push("Fila BullMQ nao esta acessivel.");
  if (redisPolicy?.policyCompliant === false) {
    queueBlockers.push(
      `Redis maxmemory-policy esta ${redisPolicy.maxmemoryPolicy}; alvo operacional: ${redisPolicy.policyTarget}.`
    );
  }
  if (queueIntegrity.status !== "healthy") {
    queueBlockers.push("Integridade da fila nao esta saudavel.");
  }
  if (Number(queueIntegrity.staleQueuedJobs || 0) > 0) {
    queueBlockers.push(
      `${queueIntegrity.staleQueuedJobs} job(s) antigo(s) ficaram em queued sem execucao.`
    );
  }

  const queueInfrastructure: ReadinessItem = {
    status:
      queueBlockers.length === 0
        ? "READY"
        : queue.configured && queue.reachable
          ? "PARTIAL"
          : "NO-GO",
    evidence: {
      configured: queue.configured,
      reachable: queue.reachable,
      queueName: queue.queueName,
      counts: queue.counts,
      redisMaxmemoryPolicy: redisPolicy?.maxmemoryPolicy ?? null,
      redisPolicyTarget: redisPolicy?.policyTarget ?? "noeviction",
      redisPolicyCompliant: redisPolicy?.policyCompliant ?? null,
      redisPolicyError: redisPolicy?.error ?? null,
      integrityStatus: queueIntegrity.status,
      duplicateJobs: queueIntegrity.duplicateJobs,
      failedRecoveries: queueIntegrity.failedRecoveries,
      recentFailedRecoveries: queueIntegrity.recentFailedRecoveries ?? null,
      stalledJobs: queueIntegrity.stalledJobs,
      queuedJobs: queueIntegrity.queuedJobs ?? 0,
      staleQueuedJobs: queueIntegrity.staleQueuedJobs ?? 0,
      oldestQueuedMs: queueIntegrity.oldestQueuedMs ?? 0,
      error: queue.error ?? null,
    },
    blockers: queueBlockers,
    actions:
      queueBlockers.length > 0
        ? [
            "Corrigir conectividade/politica Redis e zerar alertas de integridade da fila.",
          ]
        : ["Manter fila e politica noeviction monitoradas."],
  };

  const workerEvaluation = evaluateWorkerRedundancy(workers);
  const workerBlockers = workerEvaluation.blockers;

  const workerRedundancy: ReadinessItem = {
    status: workerBlockers.length === 0 ? "READY" : "NO-GO",
    evidence: {
      queueConfigured: queue.configured,
      queueReachable: queue.reachable,
      workerCount: workers.workerCount,
      minimumWorkerCount: workers.minimumWorkerCount,
      workerHeartbeatCount: (queue as any).workerHeartbeatCount ?? null,
      workerHostnames: workerEvaluation.workerHostnames,
      distinctWorkerHosts: workerEvaluation.distinctWorkerHosts,
      workers: workers.workers,
    },
    blockers: workerBlockers,
    actions:
      workerBlockers.length > 0
        ? [
            "Executar pelo menos dois workers em hosts independentes e validar os heartbeats.",
          ]
        : ["Manter dois ou mais workers em hosts independentes."],
  };

  const databaseBlockers: string[] = [];
  if (!database.configured)
    databaseBlockers.push("DATABASE_URL nao configurada.");
  if (!database.reachable) databaseBlockers.push("Banco nao esta acessivel.");
  if (!database.connected) {
    databaseBlockers.push("Banco ou schema obrigatorio nao esta saudavel.");
  }

  const databasePersistence: ReadinessItem = {
    status: databaseBlockers.length === 0 ? "READY" : "NO-GO",
    evidence: {
      configured: database.configured,
      reachable: database.reachable ?? false,
      connected: database.connected,
      ssl: database.ssl ?? null,
      pool: database.pool ?? null,
      schema: database.schema ?? null,
      error: database.error ?? null,
    },
    blockers: databaseBlockers,
    actions:
      databaseBlockers.length > 0
        ? [
            "Restaurar conexao MySQL e validar o schema antes de liberar escala.",
          ]
        : ["Manter conexao, schema e pool MySQL monitorados."],
  };

  const disasterBlockers: string[] = [];
  if (disasterRecovery.status !== "ok") {
    disasterBlockers.push(
      disasterRecovery.reason ?? "Disaster Recovery nao esta pronto."
    );
  }
  if (!disasterRecovery.lastBackupAt) {
    disasterBlockers.push("Sem evidencia de backup real.");
  }
  if (!disasterRecovery.restoreTestPassed) {
    disasterBlockers.push("Sem evidencia de restore real aprovado.");
  }

  const disasterRecoveryItem: ReadinessItem = {
    status:
      disasterRecovery.status === "ok"
        ? "READY"
        : disasterRecovery.status === "no-go"
          ? "NO-GO"
          : "PARTIAL",
    evidence: {
      status: disasterRecovery.status,
      reason: disasterRecovery.reason,
      nextAction: disasterRecovery.nextAction,
      lastBackupAt: disasterRecovery.lastBackupAt,
      backupAgeHours: disasterRecovery.backupAgeHours,
      backupWithinRpo: disasterRecovery.backupWithinRpo,
      backupStatus: disasterRecovery.backupStatus,
      restoreTestAt: disasterRecovery.restoreTestAt,
      restoreAgeHours: disasterRecovery.restoreAgeHours,
      restoreStatus: disasterRecovery.restoreStatus,
      restoreWithinWindow: disasterRecovery.restoreWithinWindow,
      restoreTestPassed: disasterRecovery.restoreTestPassed,
      restoreDurationMs: disasterRecovery.restoreDurationMs,
      rtoMet: disasterRecovery.rtoMet,
      rpoTargetHours: disasterRecovery.rpoTargetHours,
      rtoTargetHours: disasterRecovery.rtoTargetHours,
      restoreMaxAgeHours: disasterRecovery.restoreMaxAgeHours,
      retentionDays: disasterRecovery.retentionDays,
      recurringEvidence: disasterRecovery.recurringEvidence,
      configuration: disasterRecovery.configuration,
      history: disasterRecovery.history,
      alertCount: disasterRecovery.alerts?.length ?? 0,
      error: disasterRecovery.error ?? null,
    },
    blockers: disasterBlockers,
    actions: disasterBlockers.length
      ? [
          disasterRecovery.nextAction ??
            "Executar backup e restore drill dentro das janelas definidas.",
        ]
      : ["Manter backup diario e restore drill semanal."],
  };

  const benchmark50 = benchmarkItem(performanceBenchmarks, 50);
  const benchmark150 = benchmarkItem(performanceBenchmarks, 150);
  const benchmark250 = benchmarkItem(performanceBenchmarks, 250);
  const benchmark500 = benchmarkItem(performanceBenchmarks, 500);
  const benchmark1000 = benchmarkItem(performanceBenchmarks, 1000);
  const benchmark2000 = benchmarkItem(performanceBenchmarks, 2000);

  const items = {
    databasePersistence,
    queueInfrastructure,
    osrmEnterprise,
    workerRedundancy,
    disasterRecovery: disasterRecoveryItem,
    benchmark50,
    benchmark150,
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
      failedItems: Object.entries(items)
        .filter(([, item]) => item.status !== "READY")
        .map(([key, item]) => ({
          key,
          status: item.status,
          blockers: item.blockers,
          actions: item.actions,
        })),
      checkedAt: new Date().toISOString(),
    },
    blockers: Object.entries(items).flatMap(([key, item]) =>
      item.blockers.map(blocker => `${key}: ${blocker}`)
    ),
    actions: Array.from(new Set(itemList.flatMap(item => item.actions))),
  };

  return {
    status: multiVehicle.status,
    items,
    multiVehicle,
    checkedAt: new Date().toISOString(),
  };
}
