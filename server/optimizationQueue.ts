import { Queue, Worker, type Job } from "bullmq";
import { ENV } from "./_core/env";
import * as db from "./db";

export const OPTIMIZATION_QUEUE_NAME = "econorota-optimization";
const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000];

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

    return {
      configured: true,
      reachable: true,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts,
      workerCount: workers.length,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts: null,
      error: error instanceof Error ? error.message : "Falha ao consultar fila.",
    };
  }
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
  return error instanceof Error ? error.message : "Falha desconhecida no worker.";
}

function errorStack(error: unknown) {
  return error instanceof Error ? error.stack ?? null : null;
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
    throw new Error("BULLMQ_REDIS_URL ou REDIS_URL nao configurado para o worker.");
  }

  return new Worker<OptimizationQueuePayload>(
    OPTIMIZATION_QUEUE_NAME,
    async (job) => {
      const startedAt = new Date();
      const queueWaitMs = getQueueWaitMs(job);
      const attemptCount = getJobAttemptCount(job);
      await db.updateOptimizationJob(job.data.optimizationJobId, {
        status: "running",
        startedAt,
        queueWaitMs,
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

      try {
        await processor(job.data, job);
        const runtimeMs = Date.now() - startedMs;
        await db.updateOptimizationJob(job.data.optimizationJobId, {
          status: "completed",
          finishedAt: new Date(),
          runtimeMs,
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
          metadata: { runtimeMs, queueWaitMs },
        });
      } catch (error) {
        const runtimeMs = Date.now() - startedMs;
        const attempts = job.opts.attempts ?? 3;
        const finalFailure = attemptCount >= attempts;
        await db.updateOptimizationJob(job.data.optimizationJobId, {
          status: finalFailure ? "failed" : "queued",
          finishedAt: finalFailure ? new Date() : null,
          runtimeMs,
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
}
