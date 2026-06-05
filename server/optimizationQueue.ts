import { Queue, Worker, type Job } from "bullmq";
import { ENV } from "./_core/env";
import * as db from "./db";

export const OPTIMIZATION_QUEUE_NAME = "econorota:optimization";

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
        attempts: 2,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }
  return queue;
}

export async function enqueueOptimizationJob(payload: OptimizationQueuePayload) {
  const optimizationQueue = getOptimizationQueue();
  if (!optimizationQueue) return null;

  return optimizationQueue.add("optimize-route", payload, {
    jobId: `route-${payload.routeId}-job-${payload.optimizationJobId}`,
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
      await db.updateOptimizationJob(job.data.optimizationJobId, {
        status: "running",
        startedAt,
      });
      const startedMs = Date.now();

      try {
        await processor(job.data, job);
        await db.updateOptimizationJob(job.data.optimizationJobId, {
          status: "completed",
          finishedAt: new Date(),
          runtimeMs: Date.now() - startedMs,
          errorMessage: null,
        });
      } catch (error) {
        await db.updateOptimizationJob(job.data.optimizationJobId, {
          status: "failed",
          finishedAt: new Date(),
          runtimeMs: Date.now() - startedMs,
          errorMessage:
            error instanceof Error ? error.message : "Falha desconhecida no worker.",
        });
        throw error;
      }
    },
    { connection }
  );
}
