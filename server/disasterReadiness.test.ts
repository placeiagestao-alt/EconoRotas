import { describe, expect, it } from "vitest";
import {
  evaluateDisasterReadiness,
  type DisasterReadinessInput,
} from "./disasterReadiness";

const NOW = new Date("2026-07-09T12:00:00.000Z");

function buildInput(
  overrides: Partial<DisasterReadinessInput> = {}
): DisasterReadinessInput {
  return {
    now: NOW,
    rpoTargetHours: 24,
    rtoTargetHours: 4,
    restoreMaxAgeHours: 168,
    retentionDays: 14,
    policyExplicit: true,
    scheduleEnabled: true,
    lastBackupAt: new Date("2026-07-09T06:00:00.000Z"),
    backupStatus: "completed",
    restoreTestAt: new Date("2026-07-06T12:00:00.000Z"),
    restoreStatus: "passed",
    restoreDurationMs: 45_000,
    history: {
      backupCompleted: 3,
      backupFailed: 0,
      restorePassed: 3,
      restoreFailed: 0,
    },
    tableErrors: [],
    ...overrides,
  };
}

describe("Disaster Recovery readiness policy", () => {
  it("reports ok only with fresh recurring and explicit evidence", () => {
    const result = evaluateDisasterReadiness(buildInput());

    expect(result.status).toBe("ok");
    expect(result.backupWithinRpo).toBe(true);
    expect(result.restoreWithinWindow).toBe(true);
    expect(result.rtoMet).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports warning when the backup exceeds the configured RPO", () => {
    const result = evaluateDisasterReadiness(
      buildInput({
        lastBackupAt: new Date("2026-07-08T06:00:00.000Z"),
      })
    );

    expect(result.status).toBe("warning");
    expect(result.backupWithinRpo).toBe(false);
    expect(result.issues.some(issue => issue.type === "backup_stale")).toBe(
      true
    );
  });

  it("reports no-go when backup evidence is absent", () => {
    const result = evaluateDisasterReadiness(
      buildInput({
        lastBackupAt: null,
        backupStatus: "unknown",
      })
    );

    expect(result.status).toBe("no-go");
    expect(result.issues.some(issue => issue.type === "backup_missing")).toBe(
      true
    );
  });

  it("reports warning when the restore drill is older than its window", () => {
    const result = evaluateDisasterReadiness(
      buildInput({
        restoreTestAt: new Date("2026-06-30T11:00:00.000Z"),
      })
    );

    expect(result.status).toBe("warning");
    expect(result.restoreWithinWindow).toBe(false);
    expect(
      result.issues.some(issue => issue.type === "restore_test_stale")
    ).toBe(true);
  });

  it("reports no-go when the latest restore drill failed", () => {
    const result = evaluateDisasterReadiness(
      buildInput({
        restoreStatus: "failed",
      })
    );

    expect(result.status).toBe("no-go");
    expect(
      result.issues.some(issue => issue.type === "restore_test_failed")
    ).toBe(true);
  });

  it("reports attention when policy and schedule are not explicit", () => {
    const result = evaluateDisasterReadiness(
      buildInput({
        policyExplicit: false,
        scheduleEnabled: false,
      })
    );

    expect(result.status).toBe("attention");
    expect(result.nextAction).toContain("Configurar");
  });

  it("reports warning when a successful restore misses the RTO", () => {
    const result = evaluateDisasterReadiness(
      buildInput({
        restoreDurationMs: 5 * 3_600_000,
      })
    );

    expect(result.status).toBe("warning");
    expect(result.rtoMet).toBe(false);
    expect(
      result.issues.some(issue => issue.type === "restore_rto_missed")
    ).toBe(true);
  });
});
