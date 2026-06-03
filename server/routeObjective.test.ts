import { describe, expect, it } from "vitest";
import { calculateObjectiveCost, chooseObjective } from "./routeObjective";

describe("route objective modes", () => {
  it("uses explicit weights for each optimization mode", () => {
    expect(chooseObjective("shortest_distance")).toMatchObject({
      distanceWeight: 0.8,
      durationWeight: 0.2,
    });
    expect(chooseObjective("shortest_time")).toMatchObject({
      distanceWeight: 0.1,
      durationWeight: 0.9,
    });
    expect(chooseObjective("balanced")).toMatchObject({
      distanceWeight: 0.5,
      durationWeight: 0.5,
    });
  });

  it("produces distinct costs when distance and duration conflict", () => {
    const shortButSlow = { distanceKm: 1, durationMin: 4 };
    const longerButFast = { distanceKm: 2, durationMin: 2 };

    expect(
      calculateObjectiveCost(
        shortButSlow.distanceKm,
        shortButSlow.durationMin,
        chooseObjective("shortest_distance")
      )
    ).toBeLessThan(
      calculateObjectiveCost(
        longerButFast.distanceKm,
        longerButFast.durationMin,
        chooseObjective("shortest_distance")
      )
    );

    expect(
      calculateObjectiveCost(
        longerButFast.distanceKm,
        longerButFast.durationMin,
        chooseObjective("shortest_time")
      )
    ).toBeLessThan(
      calculateObjectiveCost(
        shortButSlow.distanceKm,
        shortButSlow.durationMin,
        chooseObjective("shortest_time")
      )
    );
  });
});
