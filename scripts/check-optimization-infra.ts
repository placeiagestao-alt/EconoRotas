import fs from "node:fs";
import dotenv from "dotenv";

function isLocalDatabaseUrl(value: string | undefined) {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "mysql", "host.docker.internal"].includes(
      hostname
    );
  } catch {
    return true;
  }
}

function loadCheckEnvironment() {
  const configuredPath = process.env.DOTENV_CONFIG_PATH;
  if (configuredPath) {
    dotenv.config({ path: configuredPath, quiet: true });
    return configuredPath;
  }

  dotenv.config({ path: ".env", quiet: true });
  if (isLocalDatabaseUrl(process.env.DATABASE_URL) && fs.existsSync(".env.worker.production")) {
    dotenv.config({ path: ".env.worker.production", override: true, quiet: true });
    return ".env.worker.production";
  }

  return ".env";
}

const loadedEnvPath = loadCheckEnvironment();

const { getDatabaseHealth } = await import("../server/db");
const {
  closeOptimizationQueueConnections,
  getOptimizationQueueHealth,
} = await import("../server/optimizationQueue");

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
const redisPolicyCompliant = (queue as any).redis?.policyCompliant;
const ok = Boolean(
  database.connected &&
    queue.configured &&
    queue.reachable &&
    workerCount > 0 &&
    redisPolicyCompliant !== false
);

console.log(JSON.stringify({
  ok,
  env: {
    loadedFrom: loadedEnvPath,
  },
  database: {
    configured: database.configured,
    connected: database.connected,
    ssl: database.ssl,
    error: database.error,
  },
  queue,
}, null, 2));

await closeOptimizationQueueConnections();

process.exit(ok ? 0 : 1);
