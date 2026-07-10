import { describe, expect, it } from "vitest";
import { evaluateWorkerRedundancy } from "./multiVehicleReadiness";

describe("multi-vehicle worker readiness", () => {
  it("rejects two workers running on the same host", () => {
    const result = evaluateWorkerRedundancy({
      workerCount: 2,
      minimumWorkerCount: 2,
      workers: [{ hostname: "host-a" }, { hostname: "host-a" }],
    });

    expect(result.distinctWorkerHosts).toBe(1);
    expect(result.blockers).toContain(
      "2 workers online, mas em apenas 1 host(s); sem redundancia de host."
    );
  });

  it("accepts workers on independent hosts", () => {
    const result = evaluateWorkerRedundancy({
      workerCount: 2,
      minimumWorkerCount: 2,
      workers: [{ hostname: "host-a" }, { hostname: "host-b" }],
    });

    expect(result.distinctWorkerHosts).toBe(2);
    expect(result.blockers).toEqual([]);
  });

  it("rejects an under-replicated worker pool", () => {
    const result = evaluateWorkerRedundancy({
      workerCount: 1,
      minimumWorkerCount: 2,
      workers: [{ hostname: "host-a" }],
    });

    expect(result.blockers).toContain(
      "Apenas 1 worker(s) online; minimo exigido: 2."
    );
  });
});
