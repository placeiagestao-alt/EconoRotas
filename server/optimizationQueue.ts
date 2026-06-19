import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import os from "node:os";
import { ENV } from "./_core/env";
import * as db from "./db";

export const OPTIMIZATION_QUEUE_NAME = "econorota-optimization";
const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000];
const WORKER_HEARTBEATS_KEY = `${OPTIMIZATION_QUEUE_NAME}:worker-heartbeats`;
const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
const WORKER_HEARTBEAT_TTL_MS = 90_000;
const MIN_WORKER_COUNT = 2;
const WORKER_UNDER_REPLICATED_ALERT_INTERVAL_MS = 30 * 60_000;
const REDIS_RECONNECT_ALERT_INTERVAL_MS = 60_000;
let lastUnderReplicatedWorkerAlertAt = 0;
let lastRedisReconnectEventAt = 0;

export type OptimizationQueuePayload = {
  optimizationJobId: number;
  routeId: number;
  userId: number;
  mode?: "shortest_distance" | "shortest_time" | "balanced";
  localityMode?: "balanced" | "local" | "strict";
  respectInputSequence?: boolean;
  excludeStopIds?: number[];
};

let queue: Queue<OptimizationQueuePayload> | null = null;
let heartbeatRedis: IORedis | null = null;
let heartbeatRedisListenersAttached = false;
let queueListenersAttached = false;

type WorkerHeartbeat = {
  workerId: string;
  hostname: string | null;
  status: "online";
  startedAt: string | null;
  lastHeartbeat: string;
};

function getConnectionOptions() {
  if (!ENV.bullmqRedisUrl) return null;
  const parsed = new URL(ENV.bullmqRedisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function sanitizeQueueError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/rediss?:\/\/[^@\s]+@/gi, "redis://[redacted]@")
    .replace(/(password|token|auth)["':=\s]+[^,\s}\]]+/gi, "$1=[redacted]");
}

function getHeartbeatRedis() {
  const connection = getConnectionOptions();
  if (!connection) return null;
  if (!heartbeatRedis) {
    heartbeatRedis = new IORedis(connection);
  }
  if (!heartbeatRedisListenersAttached) {
    heartbeatRedisListenersAttached = true;
    heartbeatRedis.on("reconnecting", () => {
      recordRedisReconnectDetected().catch((error) => {
        console.warn(
          "[OptimizationQueue] Failed to record Redis reconnect:",
          sanitizeQueueError(error)
        );
      });
    });
    heartbeatRedis.on("error", (error) => {
      console.warn("[OptimizationQueue] Redis heartbeat error:", sanitizeQueueError(error));
    });
  }
  return heartbeatRedis;
}

export function isOptimizationQueueConfigured() {
  return Boolean(ENV.bullmqRedisUrl);
}

export function getOptimizationQueue() {
  const connection = getConnectionOptions();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue<OptimizationQueuePayload>(OPTIMIZATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "fixed", delay: RETRY_BACKOFF_MS[0] },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }
  if (!queueListenersAttached) {
    queueListenersAttached = true;
    queue.on("error", (error) => {
      console.warn("[OptimizationQueue] Redis queue error:", sanitizeQueueError(error));
    });
  }
  return queue;
}

export async function getOptimizationQueueHealth() {
  if (!isOptimizationQueueConfigured()) {
    return {
      configured: false,
      reachable: false,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts: null,
      error: null,
    };
  }

  try {
    const optimizationQueue = getOptimizationQueue();
    if (!optimizationQueue) {
      return {
        configured: true,
        reachable: false,
        queueName: OPTIMIZATION_QUEUE_NAME,
        counts: null,
        error: "Fila nao inicializada.",
      };
    }

    await optimizationQueue.waitUntilReady();
    const counts = await optimizationQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );
    const workers = await optimizationQueue.getWorkers().catch(() => []);
    const workerHeartbeats = await getRecentWorkerHeartbeats().catch(() => []);
    const workerHeartbeatCount = workerHeartbeats.length;
    const workerCount = Math.max(workers.length, workerHeartbeatCount);
    await recordWorkerUnderReplicatedAlert(workerCount).catch(() => undefined);

    return {
      configured: true,
      reachable: true,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts,
      workerCount,
      workerHeartbeatCount,
      minimumWorkerCount: MIN_WORKER_COUNT,
      alert:
        workerCount < MIN_WORKER_COUNT
          ? {
              severity: "warning",
              type: "worker_under_replicated",
              message: `Fila com ${workerCount} worker(s) online. Meta minima: ${MIN_WORKER_COUNT}.`,
            }
          : null,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts: null,
      error: sanitizeQueueError(error),
    };
  }
}

export async function closeOptimizationQueueConnections() {
  const activeQueue = queue;
  const activeHeartbeatRedis = heartbeatRedis;
  queue = null;
  heartbeatRedis = null;
  queueListenersAttached = false;
  heartbeatRedisListenersAttached = false;
  await Promise.allSettled([
    activeQueue?.close(),
    activeHeartbeatRedis?.quit().catch(() => activeHeartbeatRedis.disconnect()),
  ]);
}

function encodeWorkerHeartbeat(worker: {
  workerId: string;
  hostname: string | null;
  startedAt: string | null;
}) {
  return JSON.stringify(worker);
}

function parseWorkerHeartbeat(member: string, score: number): WorkerHeartbeat | null {
  const lastHeartbeat = new Date(score).toISOString();
  try {
    const parsed = JSON.parse(member) as {
      workerId?: unknown;
      hostname?: unknown;
      startedAt?: unknown;
    };
    if (typeof parsed.workerId !== "string" || !parsed.workerId) return null;
    return {
      workerId: parsed.workerId,
      hostname: typeof parsed.hostname === "string" ? parsed.hostname : null,
      status: "online",
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
      lastHeartbeat,
    };
  } catch {
    if (!member) return null;
    return {
      workerId: member,
      hostname: null,
      status: "online",
      startedAt: null,
      lastHeartbeat,
    };
  }
}

async function recordWorkerHeartbeat(member: string) {
  const redis = getHeartbeatRedis();
  if (!redis) return;
  const now = Date.now();
  await redis
    .multi()
    .zadd(WORKER_HEARTBEATS_KEY, now, member)
    .zremrangebyscore(WORKER_HEARTBEATS_KEY, 0, now - WORKER_HEARTBEAT_TTL_MS)
    .expire(WORKER_HEARTBEATS_KEY, Math.ceil(WORKER_HEARTBEAT_TTL_MS / 1000))
    .exec();
}

async function removeWorkerHeartbeat(member: string) {
  const redis = getHeartbeatRedis();
  if (!redis) return;
  await redis.zrem(WORKER_HEARTBEATS_KEY, member);
}

async function getRecentWorkerHeartbeatCount() {
  return (await getRecentWorkerHeartbeats()).length;
}

async function getRecentWorkerHeartbeats() {
  const redis = getHeartbeatRedis();
  if (!redis) return [];
  const now = Date.now();
  await redis.zremrangebyscore(WORKER_HEARTBEATS_KEY, 0, now - WORKER_HEARTBEAT_TTL_MS);
  const membersWithScores = await redis.zrange(
    WORKER_HEARTBEATS_KEY,
    0,
    -1,
    "WITHSCORES"
  );
  const heartbeats: WorkerHeartbeat[] = [];
  for (let index = 0; index < membersWithScores.length; index += 2) {
    const heartbeat = parseWorkerHeartbeat(
      membersWithScores[index],
      Number(membersWithScores[index + 1])
    );
    if (heartbeat) heartbeats.push(heartbeat);
  }
  return heartbeats.sort((a, b) => a.workerId.localeCompare(b.workerId));
}

async function recordWorkerUnderReplicatedAlert(workerCount: number) {
  if (workerCount >= MIN_WORKER_COUNT) return;
  const now = Date.now();
  if (now - lastUnderReplicatedWorkerAlertAt < WORKER_UNDER_REPLICATED_ALERT_INTERVAL_MS) {
    return;
  }
  lastUnderReplicatedWorkerAlertAt = now;
  await db.createOperationalEvent({
    userId: null,
    routeId: null,
    stopId: null,
    type: "worker_under_replicated",
    severity: "warning",
    source: "optimization.queue.health",
    title: "Workers abaixo da meta",
    message: `Fila com ${workerCount} worker(s) online. Meta minima: ${MIN_WORKER_COUNT}.`,
    runtime: null,
    url: null,
    userAgent: null,
    appVersion: null,
    metadata: {
      workerCount,
      minimumWorkerCount: MIN_WORKER_COUNT,
    },
  });
}

async function recordRedisReconnectDetected() {
  const now = Date.now();
  if (now - lastRedisReconnectEventAt < REDIS_RECONNECT_ALERT_INTERVAL_MS) {
    return;
  }
  lastRedisReconnectEventAt = now;
  await db.createOperationalEvent({
    userId: null,
    routeId: null,
    stopId: null,
    type: "redis_reconnect_detected",
    severity: "warning",
    source: "optimization.queue.redis",
    title: "Redis reconectando",
    message: "Conexao Redis da fila entrou em ciclo de reconexao.",
    runtime: null,
    url: null,
    userAgent: null,
    appVersion: null,
    metadata: {
      redisReconnectCount: 1,
      queueName: OPTIMIZATION_QUEUE_NAME,
    },
  });
}

async function recordQueueIntegrityEvent(args: {
  type: string;
  severity: "info" | "warning" | "error" | "fatal";
  title: string;
  message: string;
  payload?: OptimizationQueuePayload;
  job?: Job<OptimizationQueuePayload>;
  metadata?: Record<string, unknown>;
}) {
  await db.createOperationalEvent({
    userId: args.payload?.userId ?? null,
    routeId: args.payload?.routeId ?? null,
    stopId: null,
    type: args.type,
    severity: args.severity,
    source: "optimization.queue.integrity",
    title: args.title,
    message: args.message,
    runtime: null,
    url: null,
    userAgent: null,
    appVersion: null,
    metadata: {
      optimizationJobId: args.payload?.optimizationJobId ?? null,
      providerJobId: args.job?.id ? String(args.job.id) : null,
      ...args.metadata,
    },
  }).catch((eventError) => {
    console.warn("[OptimizationQueue] Failed to record integrity event:", eventError);
  });
}

async function inspectJobTakeover(args: {
  payload: OptimizationQueuePayload;
  job: Job<OptimizationQueuePayload>;
  workerId: string;
  workerHostname: string;
  startedAt: Date;
}) {
  const previousJob = await db.getOptimizationJobById(args.payload.optimizationJobId);
  if (!previousJob || previousJob.status !== "running") return;
  const previousWorkerId = String(previousJob.workerId || "");
  if (!previousWorkerId || previousWorkerId === args.workerId) return;

  const previousStartedAt = previousJob.workerStartedAt || previousJob.startedAt;
  const previousStartedMs = previousStartedAt
    ? new Date(previousStartedAt).getTime()
    : 0;
  const ageMs = previousStartedMs > 0 ? Date.now() - previousStartedMs : 0;
  const metadata = {
    duplicateJobDetected: ageMs > 0 && ageMs <= WORKER_HEARTBEAT_TTL_MS,
    workerCrashRecovered: ageMs > WORKER_HEARTBEAT_TTL_MS,
    jobRecoveredAfterCrash: ageMs > WORKER_HEARTBEAT_TTL_MS,
    previousWorkerId,
    newWorkerId: args.workerId,
    previousWorkerStartedAt: previousStartedAt,
    takeoverAgeMs: ageMs,
    workerHostname: args.workerHostname,
    attemptCount: getJobAttemptCount(args.job),
  };

  if (metadata.duplicateJobDetected) {
    await recordQueueIntegrityEvent({
      type: "duplicate_job_detected",
      severity: "error",
      title: "Possivel dupla execucao de job",
      message: `Job ${args.payload.optimizationJobId} ja estava em execucao por outro worker.`,
      payload: args.payload,
      job: args.job,
      metadata,
    });
    return;
  }

  await recordQueueIntegrityEvent({
    type: "worker_crash_recovered",
    severity: "warning",
    title: "Crash de worker recuperado",
    message: `Job ${args.payload.optimizationJobId} foi retomado por outro worker.`,
    payload: args.payload,
    job: args.job,
    metadata,
  });
  await recordQueueIntegrityEvent({
    type: "job_recovered_after_crash",
    severity: "info",
    title: "Job recuperado apos crash",
    message: `Job ${args.payload.optimizationJobId} retomado sem perda operacional.`,
    payload: args.payload,
    job: args.job,
    metadata,
  });
}

export async function getOptimizationWorkersDashboard() {
  const heartbeats = await getRecentWorkerHeartbeats().catch(() => []);
  const stats = await db.getOptimizationWorkerJobStats(30).catch(() => []);
  const statsByWorker = new Map(stats.map((item) => [item.workerId, item]));
  const workers = heartbeats.map((worker) => {
    const workerStats = statsByWorker.get(worker.workerId);
    return {
      ...worker,
      jobsProcessed: workerStats?.jobsProcessed ?? 0,
      jobsFailed: workerStats?.jobsFailed ?? 0,
      workerAverageRuntime: workerStats?.workerAverageRuntime ?? 0,
    };
  });
  const totalJobsProcessed = workers.reduce(
    (total, worker) => total + worker.jobsProcessed,
    0
  );
  const totalJobsFailed = workers.reduce((total, worker) => total + worker.jobsFailed, 0);
  const runtimeValues = workers
    .map((worker) => worker.workerAverageRuntime)
    .filter((value) => value > 0);

  return {
    minimumWorkerCount: MIN_WORKER_COUNT,
    workerCount: workers.length,
    status: workers.length >= MIN_WORKER_COUNT ? "healthy" : "warning",
    alert:
      workers.length < MIN_WORKER_COUNT
        ? {
            severity: "warning",
            type: "worker_under_replicated",
            message: `Fila com ${workers.length} worker(s) online. Meta minima: ${MIN_WORKER_COUNT}.`,
          }
        : null,
    workerJobsProcessed: totalJobsProcessed,
    workerJobsFailed: totalJobsFailed,
    workerAverageRuntime: runtimeValues.length
      ? Math.round(
          runtimeValues.reduce((total, value) => total + value, 0) / runtimeValues.length
        )
      : 0,
    workers,
  };
}

export async function enqueueOptimizationJob(payload: OptimizationQueuePayload) {
  const optimizationQueue = getOptimizationQueue();
  if (!optimizationQueue) return null;

  return optimizationQueue.add("optimize-route", payload, {
    jobId: `route-${payload.routeId}-job-${payload.optimizationJobId}`,
    attempts: 3,
    backoff: { type: "fixed", delay: RETRY_BACKOFF_MS[0] },
  });
}

function getJobAttemptCount(job: Job<OptimizationQueuePayload>) {
  return Number(job.attemptsMade || 0) + 1;
}

function getQueueWaitMs(job: Job<OptimizationQueuePayload>) {
  const timestamp = Number(job.timestamp || 0);
  return timestamp > 0 ? Math.max(0, Date.now() - timestamp) : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? sanitizeQueueError(error)
    : "Falha desconhecida no worker.";
}

function errorStack(error: unknown) {
  return error instanceof Error ? error.stack ?? null : null;
}

function getMemoryMb() {
  const usage = process.memoryUsage();
  return Math.round((usage.rss || usage.heapUsed || 0) / 1024 / 1024);
}

async function recordJobEvent(args: {
  type: string;
  severity: "info" | "warning" | "error" | "fatal";
  title: string;
  message: string;
  payload: OptimizationQueuePayload;
  job: Job<OptimizationQueuePayload>;
  metadata?: Record<string, unknown>;
}) {
  await db.createOperationalEvent({
    userId: args.payload.userId,
    routeId: args.payload.routeId,
    stopId: null,
    type: args.type,
    severity: args.severity,
    source: "optimization.queue",
    title: args.title,
    message: args.message,
    runtime: null,
    url: null,
    userAgent: null,
    appVersion: null,
    metadata: {
      optimizationJobId: args.payload.optimizationJobId,
      providerJobId: args.job.id ? String(args.job.id) : null,
      attemptsMade: args.job.attemptsMade,
      maxAttempts: args.job.opts.attempts ?? 3,
      ...args.metadata,
    },
  }).catch((eventError) => {
    console.warn("[OptimizationQueue] Failed to record job event:", eventError);
  });
}

export function createOptimizationWorker(
  processor: (payload: OptimizationQueuePayload, job: Job<OptimizationQueuePayload>) => Promise<void>
) {
  const connection = getConnectionOptions();
  if (!connection) {
    throw new Error("BULLMQ_REDIS_URL, ECONOROTAS_REDIS_URL ou REDIS_URL nao configurado para o worker.");
  }

  const workerStartedAt = new Date();
  const workerHostname = os.hostname();
  const workerInstanceId = [
    "worker",
    workerHostname,
    process.pid,
    workerStartedAt.getTime(),
    Math.random().toString(36).slice(2, 8),
  ].join("-");
  const workerHeartbeatMember = encodeWorkerHeartbeat({
    workerId: workerInstanceId,
    hostname: workerHostname,
    startedAt: workerStartedAt.toISOString(),
  });

  const worker = new Worker<OptimizationQueuePayload>(
    OPTIMIZATION_QUEUE_NAME,
    async (job) => {
      const startedAt = new Date();
      const queueWaitMs = getQueueWaitMs(job);
      const attemptCount = getJobAttemptCount(job);
      await inspectJobTakeover({
        payload: job.data,
        job,
        workerId: workerInstanceId,
        workerHostname,
        startedAt,
      });
      await db.updateOptimizationJob(job.data.optimizationJobId, {
        status: "running",
        startedAt,
        queueWaitMs,
        workerId: workerInstanceId,
        workerHostname,
        workerStartedAt: startedAt,
        workerFinishedAt: null,
        attemptCount,
        maxAttempts: job.opts.attempts ?? 3,
        providerJobId: job.id ? String(job.id) : null,
      });
      await recordJobEvent({
        type: "optimization_job_started",
        severity: attemptCount > 1 ? "warning" : "info",
        title: "Job de otimizacao iniciado",
        message: `Job de otimizacao iniciado na tentativa ${attemptCount}.`,
        payload: job.data,
        job,
        metadata: { queueWaitMs, attemptCount },
      });
      const startedMs = Date.now();
      const startedMemoryMb = getMemoryMb();
      let peakMemoryMb = startedMemoryMb;

      try {
        await processor(job.data, job);
        const runtimeMs = Date.now() - startedMs;
        peakMemoryMb = Math.max(peakMemoryMb, getMemoryMb());
        await db.updateOptimizationJob(job.data.optimizationJobId, {
          status: "completed",
          finishedAt: new Date(),
          runtimeMs,
          executionMs: runtimeMs,
          workerMemoryMb: getMemoryMb(),
          peakMemoryMb,
          workerId: workerInstanceId,
          workerHostname,
          workerFinishedAt: new Date(),
          errorMessage: null,
          stackTrace: null,
        });
        await recordJobEvent({
          type: "optimization_job_completed",
          severity: "info",
          title: "Job de otimizacao concluido",
          message: `Job de otimizacao concluido em ${runtimeMs} ms.`,
          payload: job.data,
          job,
          metadata: { runtimeMs, queueWaitMs, workerMemoryMb: getMemoryMb(), peakMemoryMb },
        });
      } catch (error) {
        const runtimeMs = Date.now() - startedMs;
        peakMemoryMb = Math.max(peakMemoryMb, getMemoryMb());
        const attempts = job.opts.attempts ?? 3;
        const finalFailure = attemptCount >= attempts;
        await db.updateOptimizationJob(job.data.optimizationJobId, {
          status: finalFailure ? "failed" : "queued",
          finishedAt: finalFailure ? new Date() : null,
          runtimeMs,
          executionMs: runtimeMs,
          workerMemoryMb: getMemoryMb(),
          peakMemoryMb,
          workerId: workerInstanceId,
          workerHostname,
          workerFinishedAt: finalFailure ? new Date() : null,
          errorMessage: errorMessage(error),
          stackTrace: errorStack(error),
        });
        await recordJobEvent({
          type: finalFailure ? "optimization_job_failed" : "optimization_job_retry",
          severity: finalFailure ? "error" : "warning",
          title: finalFailure
            ? "Job de otimizacao falhou"
            : "Job de otimizacao reagendado",
          message: finalFailure
            ? errorMessage(error)
            : `Falha na tentativa ${attemptCount}. Retry automatico ativo.`,
          payload: job.data,
          job,
          metadata: {
            runtimeMs,
            workerMemoryMb: getMemoryMb(),
            peakMemoryMb,
            attemptCount,
            maxAttempts: attempts,
            error: errorMessage(error),
            nextBackoffMs:
              RETRY_BACKOFF_MS[Math.min(attemptCount - 1, RETRY_BACKOFF_MS.length - 1)],
          },
        });
        throw error;
      }
    },
    {
      connection,
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          RETRY_BACKOFF_MS[
            Math.min(Math.max(0, attemptsMade - 1), RETRY_BACKOFF_MS.length - 1)
          ],
      },
    }
  );

  const sendHeartbeat = () => {
    recordWorkerHeartbeat(workerHeartbeatMember).catch((error) => {
      console.warn("[OptimizationQueue] Failed to record worker heartbeat:", error);
    });
  };
  sendHeartbeat();
  const heartbeatTimer = setInterval(sendHeartbeat, WORKER_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  worker.on("closed", () => {
    clearInterval(heartbeatTimer);
    removeWorkerHeartbeat(workerHeartbeatMember).catch(() => undefined);
  });

  worker.on("stalled", (jobId) => {
    recordQueueIntegrityEvent({
      type: "optimization_job_stalled",
      severity: "warning",
      title: "Job travado detectado",
      message: `BullMQ sinalizou job stalled: ${jobId}.`,
      metadata: {
        stalledCount: 1,
        providerJobId: String(jobId),
        workerId: workerInstanceId,
        workerHostname,
      },
    });
    recordQueueIntegrityEvent({
      type: "job_recovered_after_crash",
      severity: "info",
      title: "Job stalled entrou em recuperacao",
      message: `BullMQ vai retomar o job stalled: ${jobId}.`,
      metadata: {
        stalledRecoveredCount: 1,
        jobRecoveredAfterCrash: true,
        providerJobId: String(jobId),
        workerId: workerInstanceId,
        workerHostname,
      },
    });
  });

  return worker;
}
