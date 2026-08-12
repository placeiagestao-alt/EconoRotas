import { describe, expect, it } from "vitest";
import {
  getFirstPendingStopIndex,
  isRouteExecutionCoherenceBlocked,
} from "./routeProgress";

describe("getFirstPendingStopIndex", () => {
  it("advances to the next untreated stop", () => {
    expect(getFirstPendingStopIndex(5, [0, 1], [])).toBe(2);
  });

  it("skips delivered and failed stops", () => {
    expect(getFirstPendingStopIndex(5, [0, 2], [1, 3])).toBe(4);
  });

  it("keeps the saved route order after an out-of-order result", () => {
    expect(getFirstPendingStopIndex(5, [3], [])).toBe(0);
  });

  it("returns -1 when the route is complete", () => {
    expect(getFirstPendingStopIndex(3, [0, 2], [1])).toBe(-1);
  });
});

describe("isRouteExecutionCoherenceBlocked", () => {
  it("blocks optimized routes with strong attention", () => {
    expect(
      isRouteExecutionCoherenceBlocked({
        routingStrategy: "optimized_route",
        operationalStatus: "attention_strong",
        sequenceCoherenceVerified: false,
      })
    ).toBe(true);
  });

  it("allows a verified sequence even when infrastructure still needs attention", () => {
    expect(
      isRouteExecutionCoherenceBlocked({
        routingStrategy: "optimized_route",
        operationalStatus: "attention_strong",
        sequenceCoherenceVerified: true,
        auditIssues: [{ type: "road_metrics_unavailable", severity: "high" }],
      })
    ).toBe(false);
  });

  it("blocks a high-impact nearby stop skip", () => {
    expect(
      isRouteExecutionCoherenceBlocked({
        routingStrategy: "optimized_route",
        operationalStatus: "optimized_attention",
        auditIssues: [{ type: "nearby_stop_skipped", severity: "high" }],
      })
    ).toBe(true);
  });

  it("allows visual-only attention and preserved Shopee sequences", () => {
    expect(
      isRouteExecutionCoherenceBlocked({
        routingStrategy: "optimized_route",
        operationalStatus: "optimized_attention",
        sequenceCoherenceVerified: true,
        auditIssues: [{ type: "route_crossing", severity: "low" }],
      })
    ).toBe(false);
    expect(
      isRouteExecutionCoherenceBlocked({
        routingStrategy: "shopee_stop_sequence",
        operationalStatus: "shopee_stop_sequence",
        sequenceCoherenceVerified: false,
      })
    ).toBe(false);
  });
});
