export type RouteMode = "shortest_distance" | "shortest_time" | "balanced";

export type RouteObjective = {
  mode: RouteMode;
  distanceWeight: number;
  durationWeight: number;
};

export function chooseObjective(mode: RouteMode = "balanced"): RouteObjective {
  if (mode === "shortest_distance") {
    return {
      mode,
      distanceWeight: 0.8,
      durationWeight: 0.2,
    };
  }

  if (mode === "shortest_time") {
    return {
      mode,
      distanceWeight: 0.1,
      durationWeight: 0.9,
    };
  }

  return {
    mode: "balanced",
    distanceWeight: 0.5,
    durationWeight: 0.5,
  };
}

export function calculateObjectiveCost(
  distanceKm: number,
  durationMin: number,
  objective: RouteObjective
) {
  return (
    distanceKm * objective.distanceWeight +
    durationMin * objective.durationWeight
  );
}
