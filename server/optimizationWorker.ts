import { createOptimizationWorker } from "./optimizationQueue";
import { optimizeUserRoute } from "./routers";

const worker = createOptimizationWorker(async (payload) => {
  await optimizeUserRoute(payload.routeId, payload.userId, payload.mode, {
    localityMode: payload.localityMode,
    respectInputSequence: payload.respectInputSequence,
    excludeStopIds: payload.excludeStopIds,
    allowLargeSync: true,
  });
});

worker.on("completed", (job) => {
  console.log(`[OptimizationWorker] Job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`[OptimizationWorker] Job ${job?.id ?? "unknown"} failed:`, error);
});

console.log("[OptimizationWorker] Started.");
