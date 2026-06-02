import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSequentialRouteWithRoadMetrics,
  optimizeRouteWithRoadMetrics,
} from "./osrm";
import { ENV } from "./_core/env";
import type { Location } from "./optimization";

const originalFetch = globalThis.fetch;

function mockOsrmTable(distances: number[][], durations: number[][] = distances) {
  ENV.osrmEnabled = true;
  globalThis.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        code: "Ok",
        distances: distances.map((row) => row.map((value) => value * 1000)),
        durations: durations.map((row) => row.map((value) => value * 60)),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )
  ) as any;
}

describe("OSRM route metrics", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    ENV.osrmEnabled = false;
    vi.restoreAllMocks();
  });

  it("uses road distance and time from the OSRM table", async () => {
    mockOsrmTable([
      [0, 7],
      [7, 0],
    ]);

    const locations: Location[] = [
      { latitude: -23.55, longitude: -46.63, address: "A" },
      { latitude: -23.56, longitude: -46.64, address: "B" },
    ];

    const result = await optimizeRouteWithRoadMetrics(locations, "shortest_distance");

    expect(result?.sequence).toEqual([0, 1]);
    expect(result?.totalDistance).toBe(7);
    expect(result?.totalTime).toBe(7);
  });

  it("keeps spreadsheet order while replacing estimated metrics", async () => {
    mockOsrmTable([
      [0, 9, 3],
      [9, 0, 4],
      [3, 4, 0],
    ]);

    const locations: Location[] = [
      { latitude: -23.55, longitude: -46.63, address: "A" },
      { latitude: -23.56, longitude: -46.64, address: "B" },
      { latitude: -23.57, longitude: -46.65, address: "C" },
    ];

    const result = await buildSequentialRouteWithRoadMetrics(locations);

    expect(result?.sequence).toEqual([0, 1, 2]);
    expect(result?.totalDistance).toBe(13);
    expect(result?.totalTime).toBe(13);
  });

  it("returns null when OSRM is unavailable so callers can use fallback", async () => {
    globalThis.fetch = vi.fn(async () => new Response("erro", { status: 503 })) as any;

    const result = await optimizeRouteWithRoadMetrics([
      { latitude: -23.55, longitude: -46.63 },
      { latitude: -23.56, longitude: -46.64 },
    ]);

    expect(result).toBeNull();
  });

  it("keeps the road-nearest first stop when current driver location is provided", async () => {
    mockOsrmTable([
      [0, 100, 100, 1],
      [100, 0, 1, 5],
      [100, 1, 0, 6],
      [1, 5, 6, 0],
    ]);

    const locations: Location[] = [
      { latitude: -23.55, longitude: -46.63, address: "nearest" },
      { latitude: -23.56, longitude: -46.64, address: "farther" },
      { latitude: -23.57, longitude: -46.65, address: "farther cluster" },
    ];

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance",
      0,
      {
        startLocation: {
          latitude: -23.54,
          longitude: -46.62,
          address: "current driver location",
        },
      }
    );

    expect(result?.sequence[0]).toBe(0);
    expect(result?.waypoints[0].address).toBe("nearest");
  });

  it("does not skip a road-near pending stop to jump to a farther cluster", async () => {
    mockOsrmTable([
      [0, 0.1, 3, 3, 0.1],
      [0.1, 0, 3, 3, 0.2],
      [3, 3, 0, 0.1, 3],
      [3, 3, 0.1, 0, 3],
      [0.1, 0.2, 3, 3, 0],
    ]);

    const locations: Location[] = [
      { latitude: -23.55, longitude: -46.63, address: "near 1" },
      { latitude: -23.5505, longitude: -46.6305, address: "near 2" },
      { latitude: -23.57, longitude: -46.65, address: "far 1" },
      { latitude: -23.5705, longitude: -46.6505, address: "far 2" },
    ];

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance",
      0,
      {
        startLocation: {
          latitude: -23.549,
          longitude: -46.629,
          address: "current driver location",
        },
      }
    );

    expect(result?.waypoints.slice(0, 2).map((waypoint) => waypoint.address)).toEqual([
      "near 1",
      "near 2",
    ]);
  });
});
