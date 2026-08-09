import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSequentialRouteWithRoadMetrics,
  getOsrmHealth,
  optimizeRouteWithRoadMetrics,
} from "./osrm";
import { detectRouteCrossings } from "./routeAudit";
import { ENV } from "./_core/env";
import type { Location } from "./optimization";

const originalFetch = globalThis.fetch;
const originalOsrmMaxTableNodes = process.env.OSRM_MAX_TABLE_NODES;

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

function mockDynamicOsrmTable() {
  ENV.osrmEnabled = true;
  const coordinateCounts: number[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const coordinatePart = url.split("/table/v1/driving/")[1]?.split("?")[0] ?? "";
    const coordinateCount = coordinatePart ? coordinatePart.split(";").length : 0;
    coordinateCounts.push(coordinateCount);
    const matrix = Array.from({ length: coordinateCount }, (_, from) =>
      Array.from({ length: coordinateCount }, (_, to) =>
        from === to ? 0 : Math.abs(from - to) + 1
      )
    );

    return new Response(
      JSON.stringify({
        code: "Ok",
        distances: matrix.map((row) => row.map((value) => value * 1000)),
        durations: matrix.map((row) => row.map((value) => value * 60)),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }) as any;

  return coordinateCounts;
}

describe("OSRM route metrics", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    ENV.osrmEnabled = false;
    ENV.osrmRequired = false;
    ENV.osrmBaseUrl = "https://router.project-osrm.org";
    ENV.osrmMaxRetries = 2;
    ENV.osrmRetryBaseDelayMs = 200;
    ENV.osrmFallbackSpeed = 8.33;
    if (originalOsrmMaxTableNodes === undefined) {
      delete process.env.OSRM_MAX_TABLE_NODES;
    } else {
      process.env.OSRM_MAX_TABLE_NODES = originalOsrmMaxTableNodes;
    }
    vi.restoreAllMocks();
  });

  it("reports OSRM health when route endpoint responds", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmBaseUrl = "https://osrm.econorota.local";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ code: "Ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as any;

    const health = await getOsrmHealth();

    expect(health.enabled).toBe(true);
    expect(health.configured).toBe(true);
    expect(health.reachable).toBe(true);
    expect(health.baseUrl).toBe("https://osrm.econorota.local");
  });

  it("reports OSRM health failure when required service is unavailable", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmRequired = true;
    globalThis.fetch = vi.fn(async () => new Response("erro", { status: 503 })) as any;

    const health = await getOsrmHealth();

    expect(health.required).toBe(true);
    expect(health.reachable).toBe(false);
    expect(health.error).toContain("HTTP 503");
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

  it("optimizes OSRM routes by duration instead of distance", async () => {
    mockOsrmTable(
      [
        [0, 1, 1.5],
        [1, 0, 1],
        [1.5, 1, 0],
      ],
      [
        [0, 8, 3],
        [8, 0, 2],
        [3, 2, 0],
      ]
    );

    const locations: Location[] = [
      { latitude: -22.12, longitude: -51.4, address: "A" },
      { latitude: -22.121, longitude: -51.401, address: "B" },
      { latitude: -22.122, longitude: -51.402, address: "C" },
    ];

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance"
    );

    expect(result?.sequence).toEqual([0, 2, 1]);
    expect(result?.totalDistance).toBe(2.5);
    expect(result?.totalTime).toBe(5);
  });

  it("generates different sequences for distance and time modes when road metrics conflict", async () => {
    mockOsrmTable(
      [
        [0, 1, 2, 1],
        [1, 0, 1, 1.2],
        [2, 1, 0, 2],
        [1, 1.2, 2, 0],
      ],
      [
        [0, 4, 2, 1],
        [4, 0, 1, 1.2],
        [2, 1, 0, 2],
        [1, 1.2, 2, 0],
      ]
    );

    const locations: Location[] = [
      { latitude: -22.12, longitude: -51.4, address: "A" },
      { latitude: -22.121, longitude: -51.401, address: "B" },
      { latitude: -22.122, longitude: -51.402, address: "C" },
    ];
    const options = {
      startLocation: {
        latitude: -22.119,
        longitude: -51.399,
        address: "Origem",
      },
    };

    const distanceRoute = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance",
      0,
      options
    );
    const timeRoute = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_time",
      0,
      options
    );
    const balancedRoute = await optimizeRouteWithRoadMetrics(
      locations,
      "balanced",
      0,
      options
    );

    expect(distanceRoute?.sequence).toEqual([0, 1, 2]);
    expect(timeRoute?.sequence).toEqual([0, 2, 1]);
    expect(balancedRoute?.sequence).toEqual([0, 2, 1]);
    expect(distanceRoute?.sequence).not.toEqual(timeRoute?.sequence);
    expect(distanceRoute?.totalDistance).toBeLessThan(timeRoute?.totalDistance ?? Infinity);
    expect(timeRoute?.totalTime).toBeLessThan(distanceRoute?.totalTime ?? Infinity);
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
    ENV.osrmEnabled = true;
    ENV.osrmMaxRetries = 2;
    ENV.osrmRetryBaseDelayMs = 0;
    globalThis.fetch = vi.fn(async () => new Response("erro", { status: 503 })) as any;

    const result = await optimizeRouteWithRoadMetrics([
      { latitude: -23.55, longitude: -46.63 },
      { latitude: -23.56, longitude: -46.64 },
    ]);

    expect(result).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("retries a transient table failure and returns the road matrix", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmMaxRetries = 2;
    ENV.osrmRetryBaseDelayMs = 0;
    const recordOsrmMatrix = vi.fn();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("indisponivel", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "Ok",
            distances: [
              [0, 7000],
              [7000, 0],
            ],
            durations: [
              [0, 420],
              [420, 0],
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      ) as any;

    const result = await optimizeRouteWithRoadMetrics(
      [
        { latitude: -22.12, longitude: -51.4 },
        { latitude: -22.13, longitude: -51.41 },
      ],
      "shortest_distance",
      0,
      { telemetry: { recordOsrmMatrix } }
    );

    expect(result?.totalDistance).toBe(7);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(recordOsrmMatrix).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        attemptCount: 2,
        failureReason: "recovered_after_retry:1",
      })
    );
  });

  it("does not retry a permanent table request error", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmMaxRetries = 2;
    ENV.osrmRetryBaseDelayMs = 0;
    globalThis.fetch = vi.fn(async () => new Response("invalido", { status: 400 })) as any;

    const result = await optimizeRouteWithRoadMetrics([
      { latitude: -22.12, longitude: -51.4 },
      { latitude: -22.13, longitude: -51.41 },
    ]);

    expect(result).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("requests disconnected-pair estimates and reports them as degraded", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmFallbackSpeed = 8.33;
    const recordOsrmMatrix = vi.fn();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          distances: [
            [0, 2500],
            [2500, 0],
          ],
          durations: [
            [0, 300],
            [300, 0],
          ],
          fallback_speed_cells: [
            [0, 1],
            [1, 0],
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as any;

    const result = await optimizeRouteWithRoadMetrics(
      [
        { latitude: -22.12, longitude: -51.4 },
        { latitude: -22.13, longitude: -51.41 },
      ],
      "shortest_distance",
      0,
      { telemetry: { recordOsrmMatrix } }
    );

    expect(result?.totalDistance).toBe(2.5);
    const requestedUrl = String(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("fallback_speed=8.33");
    expect(requestedUrl).toContain("fallback_coordinate=input");
    expect(recordOsrmMatrix).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        estimatedCellCount: 2,
        failureReason: "fallback_speed_cells:2",
      })
    );
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

  it("keeps a road-immediate corner delivery before leaving the block", async () => {
    mockOsrmTable([
      [0, 0.02, 0.9, 0.9, 0.02],
      [0.02, 0, 0.88, 0.88, 0.03],
      [0.9, 0.88, 0, 0.02, 0.9],
      [0.9, 0.88, 0.02, 0, 0.9],
      [0.02, 0.03, 0.9, 0.9, 0],
    ]);

    const locations: Location[] = [
      { latitude: -22.12, longitude: -51.4, address: "corner 1" },
      { latitude: -22.12001, longitude: -51.40001, address: "corner 2" },
      { latitude: -22.125, longitude: -51.405, address: "far 1" },
      { latitude: -22.12501, longitude: -51.40501, address: "far 2" },
    ];

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance",
      0,
      {
        startLocation: {
          latitude: -22.11999,
          longitude: -51.39999,
          address: "current driver location",
        },
      }
    );

    expect(result?.waypoints.slice(0, 2).map((waypoint) => waypoint.address)).toEqual([
      "corner 1",
      "corner 2",
    ]);
  });

  it("penalizes leaving a cluster before finishing its pending stops", async () => {
    mockOsrmTable([
      [0, 1, 0.1, 1],
      [1, 0, 1, 0.1],
      [0.1, 1, 0, 1],
      [1, 0.1, 1, 0],
    ]);

    const locations: Location[] = [
      { latitude: -22.12, longitude: -51.4, address: "Centro 1" },
      { latitude: -22.16, longitude: -51.45, address: "Norte 1" },
      { latitude: -22.1201, longitude: -51.4001, address: "Centro 2" },
      { latitude: -22.1601, longitude: -51.4501, address: "Norte 2" },
    ];

    const result = await optimizeRouteWithRoadMetrics(locations, "balanced", 0, {
      localityMode: "strict",
    });

    expect(result?.waypoints.map((waypoint) => waypoint.address)).toEqual([
      "Centro 1",
      "Centro 2",
      "Norte 1",
      "Norte 2",
    ]);
  });

  it("partitions large routes before requesting OSRM matrices", async () => {
    const coordinateCounts = mockDynamicOsrmTable();
    const locations: Location[] = [
      ...Array.from({ length: 65 }, (_, index) => ({
        latitude: -22.12 + index * 0.00001,
        longitude: -51.4 + index * 0.00001,
        address: `Centro ${index + 1}`,
      })),
      ...Array.from({ length: 65 }, (_, index) => ({
        latitude: -22.16 + index * 0.00001,
        longitude: -51.45 + index * 0.00001,
        address: `Norte ${index + 1}`,
      })),
    ];

    const result = await optimizeRouteWithRoadMetrics(locations, "balanced", 0, {
      localityMode: "strict",
    });

    expect(result?.sequence).toHaveLength(130);
    expect(coordinateCounts.length).toBeGreaterThan(1);
    expect(Math.max(...coordinateCounts)).toBeLessThan(120);
  });

  it("partitions optimized routes when provider node limit is below 100", async () => {
    process.env.OSRM_MAX_TABLE_NODES = "50";
    const coordinateCounts = mockDynamicOsrmTable();
    const locations: Location[] = Array.from({ length: 60 }, (_, index) => ({
      latitude: -22.12 + index * 0.0001,
      longitude: -51.4 + index * 0.0001,
      address: `Parada ${index + 1}`,
    }));

    const result = await optimizeRouteWithRoadMetrics(locations, "balanced", 0, {
      startLocation: {
        latitude: -22.13,
        longitude: -51.41,
        address: "Origem",
      },
      endLocation: {
        latitude: -22.14,
        longitude: -51.42,
        address: "Destino",
      },
    });

    expect(result?.sequence).toHaveLength(60);
    expect(result?.metadata?.partitioned).toBe(true);
    expect(coordinateCounts.length).toBeGreaterThan(1);
    expect(Math.max(...coordinateCounts)).toBeLessThanOrEqual(50);
  });

  it("preserves STOP order while splitting sequential road matrices", async () => {
    process.env.OSRM_MAX_TABLE_NODES = "50";
    const coordinateCounts = mockDynamicOsrmTable();
    const locations: Location[] = Array.from({ length: 60 }, (_, index) => ({
      latitude: -22.12 + index * 0.0001,
      longitude: -51.4 + index * 0.0001,
      address: `STOP ${index + 1}`,
    }));

    const result = await buildSequentialRouteWithRoadMetrics(locations, {
      startLocation: {
        latitude: -22.13,
        longitude: -51.41,
        address: "Origem",
      },
      endLocation: {
        latitude: -22.14,
        longitude: -51.42,
        address: "Destino",
      },
    });

    expect(result?.sequence).toEqual(locations.map((_, index) => index));
    expect(result?.waypoints.map((waypoint) => waypoint.address)).toEqual(
      locations.map((location) => location.address)
    );
    expect(result?.metadata?.partitioned).toBe(true);
    expect(coordinateCounts.length).toBeGreaterThan(1);
    expect(Math.max(...coordinateCounts)).toBeLessThanOrEqual(50);
  });

  it("prefers a crossing-free candidate when road cost is similar", async () => {
    mockOsrmTable([
      [0, 1, 1.2, 2, 1],
      [1, 0, 1, 1.2, 10],
      [1.2, 1, 0, 1, 10],
      [2, 1.2, 1, 0, 10],
      [1, 10, 10, 10, 0],
    ]);
    const locations: Location[] = [
      { latitude: 0, longitude: 0, address: "A" },
      { latitude: 1, longitude: 1, address: "B" },
      { latitude: 0, longitude: 1, address: "C" },
      { latitude: 1, longitude: 0, address: "D" },
    ];

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance",
      0,
      {
        startLocation: {
          latitude: -1,
          longitude: 0,
          address: "Origem",
        },
        localityMode: "strict",
      }
    );
    const crossings = detectRouteCrossings(
      (result?.waypoints ?? []).map((waypoint, sequence) => ({
        ...waypoint,
        sequence,
      }))
    );

    expect(result?.sequence).toHaveLength(4);
    expect(crossings).toHaveLength(0);
  });
});
