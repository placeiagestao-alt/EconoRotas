import { describe, expect, it } from "vitest";
import { evaluatePerformanceBenchmarkRun } from "./performanceBenchmarkPolicy";

function validEvidence() {
  return {
    stopCount: 250,
    runtimeMs: 12_000,
    success: true,
    osrmCalls: 8,
    osrmFailures: 0,
    matrixCacheHit: 0,
    matrixCacheMiss: 1,
    providerType: "self_hosted",
    qualityScore: 90,
    qualityStatus: "good",
    duplicateAddressCount: 0,
    duplicateCoordinateCount: 0,
    payloadBytes: 4096,
  };
}

describe("performance benchmark policy", () => {
  it("approves complete evidence within the target", () => {
    const result = evaluatePerformanceBenchmarkRun(validEvidence());

    expect(result.passed).toBe(true);
    expect(result.runtimeWithinTarget).toBe(true);
    expect(result.failureReasons).toEqual([]);
  });

  it("rejects a fast run when the route and OSRM failed", () => {
    const result = evaluatePerformanceBenchmarkRun({
      ...validEvidence(),
      runtimeMs: 1931,
      success: false,
      osrmCalls: 1,
      osrmFailures: 1,
    });

    expect(result.runtimeWithinTarget).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain(
      "A otimizacao nao produziu uma rota valida."
    );
    expect(result.failureReasons).toContain(
      "OSRM falhou em 1/1 chamada(s) (100%)."
    );
  });

  it("rejects public OSRM and missing execution evidence", () => {
    const result = evaluatePerformanceBenchmarkRun({
      ...validEvidence(),
      osrmCalls: 0,
      matrixCacheMiss: 0,
      providerType: "public",
      qualityScore: null,
      qualityStatus: null,
      payloadBytes: null,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain("Uso do OSRM nao foi comprovado.");
    expect(result.failureReasons).toContain(
      "Benchmark oficial exige OSRM proprio."
    );
    expect(result.failureReasons).toContain(
      "Execucao cold-cache nao foi comprovada."
    );
  });

  it("rejects mixed cache evidence as an official cold-cache run", () => {
    const result = evaluatePerformanceBenchmarkRun({
      ...validEvidence(),
      matrixCacheHit: 2,
      matrixCacheMiss: 1,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain(
      "Execucao mista nao comprova cold cache: 2 cache hit(s)."
    );
  });

  it("rejects repeated addresses or coordinates in the dataset", () => {
    const result = evaluatePerformanceBenchmarkRun({
      ...validEvidence(),
      duplicateAddressCount: 2,
      duplicateCoordinateCount: 1,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain(
      "Dataset possui 2 endereco(s) repetido(s)."
    );
    expect(result.failureReasons).toContain(
      "Dataset possui 1 coordenada(s) repetida(s)."
    );
  });
});
