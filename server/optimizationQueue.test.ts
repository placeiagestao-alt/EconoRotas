import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import {
  getOptimizationQueue,
  getOptimizationQueueHealth,
  isOptimizationQueueConfigured,
} from "./optimizationQueue";

const originalEnabled = ENV.optimizationQueueEnabled;
const originalRedisUrl = ENV.bullmqRedisUrl;

describe("optimization queue beta mode", () => {
  afterEach(() => {
    ENV.optimizationQueueEnabled = originalEnabled;
    ENV.bullmqRedisUrl = originalRedisUrl;
  });

  it("does not connect to Redis when the queue is explicitly disabled", async () => {
    ENV.optimizationQueueEnabled = false;
    ENV.bullmqRedisUrl = "rediss://user:secret@example.invalid:6379";

    expect(isOptimizationQueueConfigured()).toBe(false);
    expect(getOptimizationQueue()).toBeNull();
    await expect(getOptimizationQueueHealth()).resolves.toMatchObject({
      enabled: false,
      configured: false,
      reachable: false,
      maxSyncStops: ENV.maxSyncStops,
      error: null,
    });
  });

  it("reports an enabled queue without Redis as unconfigured", async () => {
    ENV.optimizationQueueEnabled = true;
    ENV.bullmqRedisUrl = "";

    expect(isOptimizationQueueConfigured()).toBe(false);
    await expect(getOptimizationQueueHealth()).resolves.toMatchObject({
      enabled: true,
      configured: false,
      reachable: false,
      error: null,
    });
  });
});
