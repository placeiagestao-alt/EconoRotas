import "dotenv/config";
import { getDatabaseHealth } from "../server/db";
import { getOptimizationQueueHealth } from "../server/optimizationQueue";

const database = await getDatabaseHealth();
const queue = await getOptimizationQueueHealth();
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

if (!ok) {
  process.exitCode = 1;
}
