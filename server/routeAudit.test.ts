import { describe, expect, it } from "vitest";
import {
  auditRouteSequence,
  detectRouteCrossings,
  type AuditableStop,
} from "./routeAudit";

describe("Route auditor", () => {
  it("flags a nearby pending stop skipped by the saved sequence", () => {
    const stops: AuditableStop[] = [
      {
        latitude: -22.1209,
        longitude: -51.4009,
        address: "Parada escolhida distante",
        sequence: 0,
      },
      {
        latitude: -22.12001,
        longitude: -51.40001,
        address: "Casa de esquina a poucos metros",
        sequence: 1,
      },
    ];

    const report = auditRouteSequence(stops, {
      startLocation: {
        latitude: -22.12,
        longitude: -51.4,
      },
    });

    expect(report.status).toBe("critical");
    expect(report.issues.some((issue) => issue.type === "nearby_stop_skipped")).toBe(
      true
    );
  });

  it("flags long jumps between consecutive stops", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.1,
        longitude: -51.4,
        address: "A",
        sequence: 0,
      },
      {
        latitude: -22.14,
        longitude: -51.4,
        address: "B",
        sequence: 1,
      },
    ]);

    expect(report.status).toBe("attention");
    expect(report.maxLegKm).toBeGreaterThan(2.5);
    expect(report.issues.some((issue) => issue.type === "long_jump")).toBe(true);
  });

  it("flags different addresses sharing the same coordinate", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.1107398,
        longitude: -51.381769,
        address: "Rua Coronel Albino, 70",
        sequence: 0,
      },
      {
        latitude: -22.1107398,
        longitude: -51.381769,
        address: "Rua Coronel Albino, 550",
        sequence: 1,
      },
    ]);

    expect(report.status).toBe("attention");
    expect(
      report.issues.some((issue) => issue.type === "duplicate_coordinates")
    ).toBe(true);
  });

  it("approves a compact route without skipped nearby stops", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.12,
        longitude: -51.4,
        address: "A",
        sequence: 0,
      },
      {
        latitude: -22.1202,
        longitude: -51.4002,
        address: "B",
        sequence: 1,
      },
      {
        latitude: -22.1204,
        longitude: -51.4004,
        address: "C",
        sequence: 2,
      },
    ]);

    expect(report.status).toBe("approved");
    expect(report.issueCount).toBe(0);
  });

  it("flags missing driver origin only when the caller requires it", () => {
    const stops: AuditableStop[] = [
      { latitude: -22.12, longitude: -51.4, address: "A", sequence: 0 },
      { latitude: -22.121, longitude: -51.401, address: "B", sequence: 1 },
    ];

    const report = auditRouteSequence(stops, { requireStartLocation: true });

    expect(report.status).toBe("attention");
    expect(report.issues.some((issue) => issue.type === "missing_driver_origin")).toBe(
      true
    );
  });

  it("flags OSRM fallback when road metrics were not used", () => {
    const report = auditRouteSequence(
      [
        { latitude: -22.12, longitude: -51.4, address: "A", sequence: 0 },
        { latitude: -22.121, longitude: -51.401, address: "B", sequence: 1 },
      ],
      { usedRoadMetrics: false }
    );

    expect(report.issues.some((issue) => issue.type === "osrm_fallback")).toBe(true);
  });

  it("flags a bad preserved spreadsheet sequence", () => {
    const report = auditRouteSequence(
      [
        { latitude: -22.14, longitude: -51.4, address: "Longe", sequence: 0 },
        { latitude: -22.12001, longitude: -51.40001, address: "Perto", sequence: 1 },
      ],
      {
        startLocation: { latitude: -22.12, longitude: -51.4 },
        respectInputSequence: true,
      }
    );

    expect(report.issues[0]?.type).toBe("bad_preserved_sequence");
  });

  it("flags leaving and returning to the same region", () => {
    const report = auditRouteSequence([
      { latitude: -22.14, longitude: -51.4, address: "Sai da regiao", sequence: 0 },
      { latitude: -22.1201, longitude: -51.4001, address: "Volta perto", sequence: 1 },
    ], {
      startLocation: { latitude: -22.12, longitude: -51.4 },
    });

    expect(report.issues.some((issue) => issue.type === "region_revisited")).toBe(
      true
    );
  });

  it("flags missing and invalid coordinates explicitly", () => {
    const report = auditRouteSequence([
      {
        latitude: Number.NaN,
        longitude: -51.4,
        address: "Rua sem latitude",
        sequence: 0,
      },
      {
        latitude: 0,
        longitude: 0,
        address: "Coordenada zerada",
        sequence: 1,
      },
      {
        latitude: 91,
        longitude: -51.4,
        address: "Coordenada fora da faixa",
        sequence: 2,
      },
    ]);

    expect(report.status).toBe("critical");
    expect(report.issues.some((issue) => issue.type === "missing_coordinates")).toBe(
      true
    );
    expect(report.issues.some((issue) => issue.type === "invalid_coordinates")).toBe(
      true
    );
  });

  it("flags empty and generic addresses", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.12,
        longitude: -51.4,
        address: "",
        sequence: 0,
      },
      {
        latitude: -22.121,
        longitude: -51.401,
        address: "Entrega",
        sequence: 1,
      },
      {
        latitude: -22.122,
        longitude: -51.402,
        address: "Cliente 123",
        sequence: 2,
      },
    ]);

    expect(report.status).toBe("critical");
    expect(report.issues.some((issue) => issue.type === "empty_address")).toBe(true);
    expect(
      report.issues.filter((issue) => issue.type === "generic_address")
    ).toHaveLength(2);
  });

  it("flags duplicated sequence numbers", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.12,
        longitude: -51.4,
        address: "A",
        sequence: 0,
      },
      {
        latitude: -22.121,
        longitude: -51.401,
        address: "B",
        sequence: 0,
      },
    ]);

    expect(report.status).toBe("attention");
    expect(report.issues.some((issue) => issue.type === "duplicate_sequence")).toBe(
      true
    );
  });

  it("detects route segments crossing each other", () => {
    const stops: AuditableStop[] = [
      {
        latitude: -22.1,
        longitude: -51.4,
        address: "Rua Alfa, 100",
        sequence: 0,
      },
      {
        latitude: -22.12,
        longitude: -51.38,
        address: "Rua Beta, 200",
        sequence: 1,
      },
      {
        latitude: -22.1,
        longitude: -51.38,
        address: "Rua Gama, 300",
        sequence: 2,
      },
      {
        latitude: -22.12,
        longitude: -51.4,
        address: "Rua Delta, 400",
        sequence: 3,
      },
    ];

    expect(detectRouteCrossings(stops)).toHaveLength(1);

    const report = auditRouteSequence(stops);

    expect(report.status).toBe("attention");
    expect(report.score).toBeLessThan(100);
    expect(report.issues.some((issue) => issue.type === "route_crossing")).toBe(true);
  });

  it("flags leaving a region before finishing pending stops in that region", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.1200,
        longitude: -51.4000,
        address: "Rua Centro, 100",
        sequence: 0,
      },
      {
        latitude: -22.1300,
        longitude: -51.3900,
        address: "Rua Norte, 200",
        sequence: 1,
      },
      {
        latitude: -22.1301,
        longitude: -51.3901,
        address: "Rua Norte, 220",
        sequence: 2,
      },
      {
        latitude: -22.1201,
        longitude: -51.4001,
        address: "Rua Centro, 120",
        sequence: 3,
      },
    ]);

    const exit = report.issues.find(
      (issue) => issue.type === "premature_region_exit"
    );

    expect(exit).toBeTruthy();
    expect(exit?.pendingSequences).toEqual([3]);
    expect(report.score).toBeLessThanOrEqual(75);
  });

  it("reports cluster compactness and flags very spread regions", () => {
    const stops: AuditableStop[] = Array.from({ length: 31 }, (_, index) => ({
      latitude: -22.2 + index * 0.0045,
      longitude: -51.4,
      address: `Rua Longa, ${100 + index}`,
      sequence: index,
    }));

    const report = auditRouteSequence(stops);

    expect(report.clusterMetrics.clusterCount).toBe(1);
    expect(report.clusterMetrics.maxRadiusKm).toBeGreaterThan(5);
    expect(
      report.issues.some((issue) => issue.type === "cluster_spread_high")
    ).toBe(true);
  });

  it("uses explicit route quality penalties by issue type", () => {
    const report = auditRouteSequence([
      {
        latitude: -22.12,
        longitude: -51.4,
        address: "Cliente 123",
        sequence: 0,
      },
      {
        latitude: -22.121,
        longitude: -51.401,
        address: "Rua Valida, 45",
        sequence: 1,
      },
    ]);

    expect(report.issues.some((issue) => issue.type === "generic_address")).toBe(true);
    expect(report.score).toBe(95);
    expect(report.quality).toBe("excellent");
  });
});
