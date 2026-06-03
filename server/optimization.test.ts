import { describe, expect, it } from "vitest";
import {
  calculateDistance,
  estimateTravelTime,
  optimizeRouteNearestNeighbor,
  optimizeRoute,
  calculateTotalDistance,
  calculateTotalTime,
  clusterStops,
  validateLocations,
  type Location,
} from "./optimization";

function bruteForceBestDistance(locations: Location[], options: {
  startLocation?: Location;
  endLocation?: Location;
} = {}) {
  const permutations = (items: number[]): number[][] => {
    if (items.length <= 1) return [items];

    return items.flatMap((item, index) =>
      permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
        (rest) => [item, ...rest]
      )
    );
  };

  const routeDistance = (sequence: number[]) => {
    let total = 0;

    if (options.startLocation) {
      total += calculateDistance(options.startLocation, locations[sequence[0]]);
    }

    for (let i = 0; i < sequence.length - 1; i++) {
      total += calculateDistance(locations[sequence[i]], locations[sequence[i + 1]]);
    }

    if (options.endLocation) {
      total += calculateDistance(
        locations[sequence[sequence.length - 1]],
        options.endLocation
      );
    }

    return Math.round(total * 100) / 100;
  };

  return Math.min(
    ...permutations(locations.map((_, index) => index)).map(routeDistance)
  );
}

describe("Route Optimization", () => {
  describe("calculateDistance", () => {
    it("calculates distance between two points", () => {
      const loc1 = { latitude: -23.5505, longitude: -46.6333 }; // São Paulo
      const loc2 = { latitude: -22.9068, longitude: -43.1729 }; // Rio de Janeiro
      const distance = calculateDistance(loc1, loc2);

      // Distance is approximately 357 km
      expect(distance).toBeGreaterThan(350);
      expect(distance).toBeLessThan(365);
    });

    it("returns 0 for same location", () => {
      const loc = { latitude: 0, longitude: 0 };
      const distance = calculateDistance(loc, loc);
      expect(distance).toBe(0);
    });

    it("is symmetric", () => {
      const loc1 = { latitude: 40.7128, longitude: -74.006 }; // New York
      const loc2 = { latitude: 34.0522, longitude: -118.2437 }; // Los Angeles
      const d1 = calculateDistance(loc1, loc2);
      const d2 = calculateDistance(loc2, loc1);
      expect(d1).toBe(d2);
    });
  });

  describe("estimateTravelTime", () => {
    it("estimates travel time based on distance", () => {
      const time = estimateTravelTime(50); // 50 km
      // At 50 km/h average, should be 60 minutes
      expect(time).toBe(60);
    });

    it("returns 0 for 0 distance", () => {
      const time = estimateTravelTime(0);
      expect(time).toBe(0);
    });

    it("scales correctly", () => {
      const time1 = estimateTravelTime(100);
      const time2 = estimateTravelTime(50);
      expect(time1).toBe(2 * time2);
    });
  });

  describe("optimizeRouteNearestNeighbor", () => {
    it("handles empty locations", () => {
      const result = optimizeRouteNearestNeighbor([]);
      expect(result.sequence).toEqual([]);
      expect(result.totalDistance).toBe(0);
      expect(result.totalTime).toBe(0);
    });

    it("handles single location", () => {
      const locations: Location[] = [{ latitude: 0, longitude: 0 }];
      const result = optimizeRouteNearestNeighbor(locations);
      expect(result.sequence).toEqual([0]);
      expect(result.totalDistance).toBe(0);
      expect(result.totalTime).toBe(0);
    });

    it("optimizes two locations", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ];
      const result = optimizeRouteNearestNeighbor(locations);
      expect(result.sequence).toEqual([0, 1]);
      expect(result.totalDistance).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThan(0);
    });

    it("optimizes multiple locations", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 1, longitude: 1 },
      ];
      const result = optimizeRouteNearestNeighbor(locations);
      expect(result.sequence).toHaveLength(4);
      expect(result.sequence[0]).toBe(0); // Starts from first location
      expect(result.totalDistance).toBeGreaterThan(0);
      expect(result.waypoints).toHaveLength(4);
    });

    it("respects start index", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
        { latitude: 2, longitude: 0 },
      ];
      const result = optimizeRouteNearestNeighbor(locations, 1);
      expect(result.sequence[0]).toBe(1);
    });

    it("creates waypoints with sequence information", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0, address: "Start" },
        { latitude: 1, longitude: 1, address: "Stop 1" },
      ];
      const result = optimizeRouteNearestNeighbor(locations);
      expect(result.waypoints[0]).toEqual({
        latitude: 0,
        longitude: 0,
        address: "Start",
        sequence: 0,
      });
      expect(result.waypoints[1].sequence).toBe(1);
    });
  });

  describe("optimizeRoute", () => {
    it("optimizes with shortest_distance mode", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        { latitude: 2, longitude: 0 },
      ];
      const result = optimizeRoute(locations, "shortest_distance");
      expect(result.sequence).toHaveLength(3);
      expect(result.totalDistance).toBeGreaterThan(0);
    });

    it("optimizes with shortest_time mode", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        { latitude: 2, longitude: 0 },
      ];
      const result = optimizeRoute(locations, "shortest_time");
      expect(result.sequence).toHaveLength(3);
      expect(result.totalTime).toBeGreaterThan(0);
    });

    it("optimizes with balanced mode", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        { latitude: 2, longitude: 0 },
      ];
      const result = optimizeRoute(locations, "balanced");
      expect(result.sequence).toHaveLength(3);
    });

    it("uses default balanced mode", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ];
      const result = optimizeRoute(locations);
      expect(result.sequence).toHaveLength(2);
    });

    it("keeps fixed start and end outside delivery waypoints", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 1, address: "Stop A" },
        { latitude: 0, longitude: 2, address: "Stop B" },
      ];
      const result = optimizeRoute(locations, "balanced", 0, {
        startLocation: { latitude: 0, longitude: 0, address: "Start" },
        endLocation: { latitude: 0, longitude: 3, address: "End" },
      });

      expect(result.sequence).toEqual([0, 1]);
      expect(result.waypoints).toHaveLength(2);
      expect(result.waypoints[0].address).toBe("Stop A");
      expect(result.waypoints[1].address).toBe("Stop B");
      expect(result.totalDistance).toBeGreaterThan(
        calculateTotalDistance(locations, result.sequence)
      );
    });

    it("chooses the shortest open delivery sequence for small routes", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0, address: "A" },
        { latitude: 0, longitude: 3, address: "B" },
        { latitude: 1, longitude: 0, address: "C" },
        { latitude: 1, longitude: 3, address: "D" },
      ];

      const result = optimizeRoute(locations, "shortest_distance");
      const bestDistance = bruteForceBestDistance(locations);

      expect(result.totalDistance).toBe(bestDistance);
    });

  it("chooses the shortest sequence between fixed start and end", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 2, address: "B" },
        { latitude: 1, longitude: 0, address: "C" },
        { latitude: 0, longitude: 1, address: "A" },
        { latitude: 1, longitude: 2, address: "D" },
      ];
      const options = {
        startLocation: { latitude: 0, longitude: 0, address: "Start" },
        endLocation: { latitude: 1, longitude: 3, address: "End" },
      };

      const result = optimizeRoute(locations, "shortest_distance", 0, options);
      const bestDistance = bruteForceBestDistance(locations, options);

      expect(result.totalDistance).toBe(bestDistance);
      expect(result.waypoints.map((waypoint) => waypoint.address)).toEqual([
        "C",
        "A",
        "B",
        "D",
      ]);
    });
  });

  it("keeps the nearest first stop when optimizing from the current driver position", () => {
    const startLocation = { latitude: 0, longitude: 0 };
    const locations = [
      { latitude: 0, longitude: 0.001, address: "nearest" },
      { latitude: 0, longitude: 0.02, address: "farther" },
      { latitude: 0, longitude: 0.021, address: "farther cluster" },
    ];

    const result = optimizeRoute(locations, "shortest_distance", 0, {
      startLocation,
    });

    expect(result.sequence[0]).toBe(0);
    expect(result.waypoints[0].address).toBe("nearest");
  });

  it("does not leave a nearby pending stop to jump to a farther cluster", () => {
    const result = optimizeRoute(
      [
        { latitude: 0, longitude: 0.001, address: "near 1" },
        { latitude: 0, longitude: 0.002, address: "near 2" },
        { latitude: 0, longitude: 0.03, address: "far 1" },
        { latitude: 0, longitude: 0.031, address: "far 2" },
      ],
      "shortest_distance",
      0,
      { startLocation: { latitude: 0, longitude: 0 } }
    );

    expect(result.waypoints.slice(0, 2).map((waypoint) => waypoint.address)).toEqual([
      "near 1",
      "near 2",
    ]);
  });

  it("keeps dense neighborhood deliveries together before leaving the area", () => {
    const result = optimizeRoute(
      [
        { latitude: -22.113, longitude: -51.403, address: "current block 1" },
        { latitude: -22.1134, longitude: -51.4032, address: "current block 2" },
        { latitude: -22.114, longitude: -51.4027, address: "current block 3" },
        { latitude: -22.128, longitude: -51.392, address: "far neighborhood 1" },
        { latitude: -22.1285, longitude: -51.3916, address: "far neighborhood 2" },
        { latitude: -22.1137, longitude: -51.404, address: "current block 4" },
      ],
      "shortest_distance",
      0,
      {
        startLocation: { latitude: -22.1129, longitude: -51.4031 },
      }
    );

    expect(result.waypoints.slice(0, 4).map((waypoint) => waypoint.address)).toEqual([
      "current block 1",
      "current block 2",
      "current block 4",
      "current block 3",
    ]);
  });

  it("does not leave a corner delivery behind when another stop is only meters away", () => {
    const result = optimizeRoute(
      [
        { latitude: -22.120000, longitude: -51.400000, address: "next saved stop" },
        { latitude: -22.120010, longitude: -51.400010, address: "corner house 10m away" },
        { latitude: -22.124500, longitude: -51.404500, address: "farther stop" },
        { latitude: -22.124600, longitude: -51.404600, address: "farther neighbor" },
      ],
      "shortest_distance",
      0,
      {
        startLocation: { latitude: -22.119990, longitude: -51.399990 },
        localityMode: "local",
      }
    );

    expect(result.waypoints.slice(0, 2).map((waypoint) => waypoint.address)).toEqual([
      "next saved stop",
      "corner house 10m away",
    ]);
  });

  it("prioritizes a pending stop within the immediate radius over a global detour", () => {
    const result = optimizeRoute(
      [
        { latitude: -22.120000, longitude: -51.400000, address: "current street 1" },
        { latitude: -22.120030, longitude: -51.400020, address: "current street 2" },
        { latitude: -22.121100, longitude: -51.401000, address: "outside block" },
        { latitude: -22.118900, longitude: -51.399100, address: "return later candidate" },
      ],
      "shortest_distance",
      0,
      {
        startLocation: { latitude: -22.119990, longitude: -51.399990 },
        localityMode: "strict",
      }
    );

    expect(result.waypoints.slice(0, 2).map((waypoint) => waypoint.address)).toEqual([
      "current street 1",
      "current street 2",
    ]);
  });

  describe("calculateTotalDistance", () => {
    it("calculates total distance for sequence", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ];
      const sequence = [0, 1, 2];
      const distance = calculateTotalDistance(locations, sequence);
      expect(distance).toBeGreaterThan(0);
    });

    it("returns 0 for single location", () => {
      const locations: Location[] = [{ latitude: 0, longitude: 0 }];
      const sequence = [0];
      const distance = calculateTotalDistance(locations, sequence);
      expect(distance).toBe(0);
    });
  });

  describe("calculateTotalTime", () => {
    it("calculates total time for sequence", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ];
      const sequence = [0, 1, 2];
      const time = calculateTotalTime(locations, sequence);
      expect(time).toBeGreaterThan(0);
    });

    it("returns 0 for single location", () => {
      const locations: Location[] = [{ latitude: 0, longitude: 0 }];
      const sequence = [0];
      const time = calculateTotalTime(locations, sequence);
      expect(time).toBe(0);
    });
  });

  describe("validateLocations", () => {
    it("validates correct locations", () => {
      const locations: Location[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 45, longitude: 90 },
      ];
      const result = validateLocations(locations);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects empty locations", () => {
      const result = validateLocations([]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("No locations provided");
    });

    it("rejects invalid latitude", () => {
      const locations: Location[] = [{ latitude: 91, longitude: 0 }];
      const result = validateLocations(locations);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid latitude");
    });

    it("rejects invalid longitude", () => {
      const locations: Location[] = [{ latitude: 0, longitude: 181 }];
      const result = validateLocations(locations);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid longitude");
    });

    it("rejects missing coordinates", () => {
      const locations = [{ address: "Test" }] as any;
      const result = validateLocations(locations);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid coordinates");
    });
  });

  describe("Real-world scenarios", () => {
    it("clusters nearby stops into operational regions", () => {
      const locations: Location[] = [
        { latitude: -22.12, longitude: -51.4, address: "Centro A" },
        { latitude: -22.1202, longitude: -51.4002, address: "Centro B" },
        { latitude: -22.121, longitude: -51.401, address: "Centro C" },
        { latitude: -22.16, longitude: -51.45, address: "Zona Norte A" },
        { latitude: -22.1602, longitude: -51.4502, address: "Zona Norte B" },
      ];

      const clusters = clusterStops(locations, { localityMode: "strict" });

      expect(clusters).toHaveLength(2);
      expect(clusters.map((cluster) => cluster.stops.length)).toEqual([3, 2]);
    });

    it("prefers finishing a cluster before moving to another region", () => {
      const locations: Location[] = [
        { latitude: -22.12, longitude: -51.4, address: "Centro 1" },
        { latitude: -22.1601, longitude: -51.4501, address: "Norte 1" },
        { latitude: -22.1201, longitude: -51.4001, address: "Centro 2" },
        { latitude: -22.1602, longitude: -51.4502, address: "Norte 2" },
      ];

      const result = optimizeRoute(locations, "balanced", 0, {
        localityMode: "strict",
      });
      const sequenceByRegion = result.sequence.map((index) =>
        locations[index].address?.startsWith("Centro") ? "Centro" : "Norte"
      );

      expect(sequenceByRegion).toEqual(["Centro", "Centro", "Norte", "Norte"]);
    });

    it("optimizes São Paulo delivery route", () => {
      const locations: Location[] = [
        { latitude: -23.5505, longitude: -46.6333, address: "Av. Paulista" },
        { latitude: -23.5475, longitude: -46.6361, address: "Rua Augusta" },
        { latitude: -23.5532, longitude: -46.6316, address: "Rua Consolação" },
        { latitude: -23.5545, longitude: -46.6361, address: "Av. Brasil" },
      ];

      const result = optimizeRoute(locations, "balanced");

      expect(result.sequence).toHaveLength(4);
      expect(result.totalDistance).toBeGreaterThan(0);
      expect(result.totalDistance).toBeLessThan(10); // Should be < 10 km for close locations
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.waypoints).toHaveLength(4);
    });

    it("handles large number of locations efficiently", () => {
      const locations: Location[] = [];
      for (let i = 0; i < 50; i++) {
        locations.push({
          latitude: Math.random() * 180 - 90,
          longitude: Math.random() * 360 - 180,
        });
      }

      const start = Date.now();
      const result = optimizeRoute(locations);
      const duration = Date.now() - start;

      expect(result.sequence).toHaveLength(50);
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
    });
  });
});
