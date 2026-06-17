import dotenv from "dotenv";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const { getDatabaseHealth } = await import("../server/db");
const { getOptimizationQueueHealth } = await import("../server/optimizationQueue");

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 20_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs} ms`)), timeoutMs)
    ),
  ]);
}

let database;
try {
  database = await withTimeout(getDatabaseHealth(), "database");
} catch (error) {
  database = {
    configured: Boolean(process.env.DATABASE_URL),
    connected: false,
    ssl: false,
    error: error instanceof Error ? error.message : "database timeout",
  };
}

let queue;
try {
  queue = await withTimeout(getOptimizationQueueHealth(), "queue");
} catch (error) {
  queue = {
    configured: Boolean(
      process.env.BULLMQ_REDIS_URL ||
        process.env.ECONOROTAS_REDIS_URL ||
        process.env.REDIS_URL
    ),
    reachable: false,
    queueName: "econorota-optimization",
    counts: null,
    workerCount: 0,
    error: error instanceof Error ? error.message : "queue timeout",
  };
}
const workerCount = "workerCount" in queue ? Number(queue.workerCount || 0) : 0;
const ok = Boolean(database.connected && queue.configured && queue.reachable && workerCount > 0);

console.log(JSON.stringify({
  ok,
  database: {
    configured: database.configured,
    connected: database.connected,
    ssl: database.ssl,
    error: database.error,
  },
  queue,
}, null, 2));

process.exit(ok ? 0 : 1);
