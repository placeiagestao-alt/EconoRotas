export const PERFORMANCE_BENCHMARK_TARGETS: Record<number, number> = {
  50: 5_000,
  150: 10_000,
  250: 15_000,
  500: 30_000,
  1000: 60_000,
  2000: 180_000,
};

export const PERFORMANCE_BENCHMARK_SAMPLE_SIZE = 3;
export const PERFORMANCE_BENCHMARK_MIN_QUALITY_SCORE = 70;
export const PERFORMANCE_BENCHMARK_MAX_OSRM_FAILURE_RATE = 1;

export type PerformanceBenchmarkRunEvidence = {
  stopCount: number;
  runtimeMs: number;
  success: boolean;
  osrmCalls: number;
  osrmFailures: number;
  matrixCacheHit: number;
  matrixCacheMiss: number;
  providerType: string | null;
  qualityScore: number | null;
  qualityStatus: string | null;
  duplicateAddressCount: number | null;
  duplicateCoordinateCount: number | null;
  payloadBytes: number | null;
};

export function evaluatePerformanceBenchmarkRun(
  evidence: PerformanceBenchmarkRunEvidence
) {
  const targetMs = PERFORMANCE_BENCHMARK_TARGETS[evidence.stopCount] ?? null;
  const osrmFailureRate =
    evidence.osrmCalls > 0
      ? Math.round((evidence.osrmFailures / evidence.osrmCalls) * 1000) / 10
      : 0;
  const failureReasons: string[] = [];

  if (!evidence.success) {
    failureReasons.push("A otimizacao nao produziu uma rota valida.");
  }
  if (evidence.runtimeMs <= 0) {
    failureReasons.push("Runtime ausente ou invalido.");
  } else if (targetMs !== null && evidence.runtimeMs >= targetMs) {
    failureReasons.push(
      `Runtime ${evidence.runtimeMs}ms excede a meta de ${targetMs}ms.`
    );
  }
  if (evidence.osrmFailures > 0) {
    failureReasons.push(
      `OSRM falhou em ${evidence.osrmFailures}/${evidence.osrmCalls} chamada(s) (${osrmFailureRate}%).`
    );
  }
  if (osrmFailureRate >= PERFORMANCE_BENCHMARK_MAX_OSRM_FAILURE_RATE) {
    failureReasons.push(
      `Taxa de falha OSRM precisa ficar abaixo de ${PERFORMANCE_BENCHMARK_MAX_OSRM_FAILURE_RATE}%.`
    );
  }
  if (evidence.osrmCalls <= 0) {
    failureReasons.push("Uso do OSRM nao foi comprovado.");
  }
  if (evidence.providerType !== "self_hosted") {
    failureReasons.push("Benchmark oficial exige OSRM proprio.");
  }
  if (evidence.matrixCacheMiss <= 0) {
    failureReasons.push("Execucao cold-cache nao foi comprovada.");
  } else if (evidence.matrixCacheHit > 0) {
    failureReasons.push(
      `Execucao mista nao comprova cold cache: ${evidence.matrixCacheHit} cache hit(s).`
    );
  }
  if (evidence.qualityScore === null || evidence.qualityStatus === null) {
    failureReasons.push("Qualidade da rota nao foi auditada.");
  } else if (
    evidence.qualityScore < PERFORMANCE_BENCHMARK_MIN_QUALITY_SCORE ||
    evidence.qualityStatus === "critical" ||
    evidence.qualityStatus === "blocked"
  ) {
    failureReasons.push(
      `Qualidade da rota reprovada: score ${evidence.qualityScore}, status ${evidence.qualityStatus}.`
    );
  }
  if (evidence.duplicateAddressCount === null) {
    failureReasons.push("Dataset nao informou enderecos repetidos.");
  } else if (evidence.duplicateAddressCount > 0) {
    failureReasons.push(
      `Dataset possui ${evidence.duplicateAddressCount} endereco(s) repetido(s).`
    );
  }
  if (evidence.duplicateCoordinateCount === null) {
    failureReasons.push("Dataset nao informou coordenadas repetidas.");
  } else if (evidence.duplicateCoordinateCount > 0) {
    failureReasons.push(
      `Dataset possui ${evidence.duplicateCoordinateCount} coordenada(s) repetida(s).`
    );
  }
  if (evidence.payloadBytes === null || evidence.payloadBytes <= 0) {
    failureReasons.push("Tamanho do payload nao foi registrado.");
  }

  return {
    criteriaVersion: 3,
    targetMs,
    runtimeWithinTarget:
      targetMs === null
        ? evidence.runtimeMs > 0
        : evidence.runtimeMs > 0 && evidence.runtimeMs < targetMs,
    osrmFailureRate,
    passed: failureReasons.length === 0,
    failureReasons,
    recommendedAction:
      failureReasons[0] ??
      "Repetir o benchmark ate completar a amostra minima.",
  };
}
