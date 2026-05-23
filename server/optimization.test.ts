import { describe, expect, it } from "vitest";
import {
  calculateDistance,
  estimateTravelTime,
  optimizeRouteNearestNeighbor,
  optimizeRoute,
  calculateTotalDistance,
  calculateTotalTime,
  validateLocations,
  type Location,
} from "./optimization";

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
