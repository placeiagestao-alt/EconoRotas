import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSequentialRouteWithRoadMetrics,
  getOsrmHealth,
  optimizeRouteWithRoadMetrics,
} from "./osrm";
import { ENV } from "./_core/env";
import type { Location } from "./optimization";

const originalFetch = globalThis.fetch;

function mockOsrmTable(
  distances: number[][],
  durations: number[][] = distances
) {
  ENV.osrmEnabled = true;
  globalThis.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          distances: distances.map(row => row.map(value => value * 1000)),
          durations: durations.map(row => row.map(value => value * 60)),
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
    const coordinatePart =
      url.split("/table/v1/driving/")[1]?.split("?")[0] ?? "";
    const coordinateCount = coordinatePart
      ? coordinatePart.split(";").length
      : 0;
    coordinateCounts.push(coordinateCount);
    const matrix = Array.from({ length: coordinateCount }, (_, from) =>
      Array.from({ length: coordinateCount }, (_, to) =>
        from === to ? 0 : Math.abs(from - to) + 1
      )
    );

    return new Response(
      JSON.stringify({
        code: "Ok",
        distances: matrix.map(row => row.map(value => value * 1000)),
        durations: matrix.map(row => row.map(value => value * 60)),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }) as any;

  return coordinateCounts;
}

function mockOsrmHealthResponses() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const isTable = String(input).includes("/table/v1/");
    return new Response(
      JSON.stringify(
        isTable
          ? {
              code: "Ok",
              distances: [
                [0, 1000],
                [1000, 0],
              ],
              durations: [
                [0, 60],
                [60, 0],
              ],
            }
          : { code: "Ok" }
      ),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }) as any;
}

describe("OSRM route metrics", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    ENV.osrmEnabled = false;
    ENV.osrmRequired = false;
    ENV.osrmBaseUrl = "https://router.project-osrm.org";
    ENV.osrmProfile = "driving";
    ENV.isProduction = false;
    vi.restoreAllMocks();
  });

  it("reports OSRM health when route endpoint responds", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmBaseUrl = "https://osrm.econorota.local";
    mockOsrmHealthResponses();

    const health = await getOsrmHealth();

    expect(health.enabled).toBe(true);
    expect(health.configured).toBe(true);
    expect(health.reachable).toBe(true);
    expect(health.baseUrl).toBe("https://osrm.econorota.local");
  });

  it("reports OSRM health failure when required service is unavailable", async () => {
    ENV.osrmEnabled = true;
    ENV.osrmRequired = true;
    globalThis.fetch = vi.fn(
      async () => new Response("erro", { status: 503 })
    ) as any;

    const health = await getOsrmHealth();

    expect(health.required).toBe(true);
    expect(health.reachable).toBe(false);
    expect(health.error).toContain("HTTP 503");
  });

  it("rejects the public OSRM when it is required in production", async () => {
    ENV.isProduction = true;
    ENV.osrmEnabled = true;
    ENV.osrmRequired = true;
    ENV.osrmBaseUrl = "https://router.project-osrm.org";
    globalThis.fetch = vi.fn() as any;

    const health = await getOsrmHealth();

    expect(health.providerType).toBe("public");
    expect(health.isPublic).toBe(true);
    expect(health.status).toBe("no-go");
    expect(health.productionReady).toBe(false);
    expect(health.healthCheckSkipped).toBe(true);
    expect(health.reason).toContain("nao permite");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("exposes an optional public production OSRM as attention", async () => {
    ENV.isProduction = true;
    ENV.osrmEnabled = true;
    ENV.osrmRequired = false;
    ENV.osrmBaseUrl = "https://router.project-osrm.org";
    mockOsrmHealthResponses();

    const health = await getOsrmHealth();

    expect(health.reachable).toBe(true);
    expect(health.providerType).toBe("public");
    expect(health.status).toBe("attention");
    expect(health.productionReady).toBe(false);
    expect(health.reason).toContain("nao e escalavel");
  });

  it("reports an absent production OSRM without injecting a public default", async () => {
    ENV.isProduction = true;
    ENV.osrmEnabled = true;
    ENV.osrmRequired = false;
    ENV.osrmBaseUrl = "";

    const health = await getOsrmHealth();

    expect(health.configured).toBe(false);
    expect(health.providerType).toBe("unconfigured");
    expect(health.baseUrl).toBeNull();
    expect(health.status).toBe("attention");
    expect(health.reason).toContain("OSRM_BASE_URL");
  });

  it("marks a healthy own OSRM as attention until it is required in production", async () => {
    ENV.isProduction = true;
    ENV.osrmEnabled = true;
    ENV.osrmRequired = false;
    ENV.osrmBaseUrl = "https://user:password@osrm.econorotas.com";
    mockOsrmHealthResponses();

    const health = await getOsrmHealth();

    expect(health.providerType).toBe("self_hosted");
    expect(health.reachable).toBe(true);
    expect(health.status).toBe("attention");
    expect(health.productionReady).toBe(false);
    expect(health.baseUrl).toBe("https://osrm.econorotas.com");
    expect(JSON.stringify(health)).not.toContain("password");
  });

  it("marks a healthy required own OSRM as production ready", async () => {
    ENV.isProduction = true;
    ENV.osrmEnabled = true;
    ENV.osrmRequired = true;
    ENV.osrmBaseUrl = "https://osrm.econorotas.com";
    mockOsrmHealthResponses();

    const health = await getOsrmHealth();

    expect(health.status).toBe("ok");
    expect(health.usable).toBe(true);
    expect(health.productionReady).toBe(true);
    expect(health.fallbackPolicy).toBe("blocked");
  });

  it("rejects production readiness when the OSRM table service fails", async () => {
    ENV.isProduction = true;
    ENV.osrmEnabled = true;
    ENV.osrmRequired = true;
    ENV.osrmBaseUrl = "https://osrm.econorotas.com";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/table/v1/")) {
        return new Response("erro", { status: 503 });
      }
      return new Response(JSON.stringify({ code: "Ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    const health = await getOsrmHealth();

    expect(health.reachable).toBe(false);
    expect(health.productionReady).toBe(false);
    expect(health.status).toBe("no-go");
    expect(health.reason).toContain("table respondeu HTTP 503");
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

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "shortest_distance"
    );

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
    expect(distanceRoute?.totalDistance).toBeLessThan(
      timeRoute?.totalDistance ?? Infinity
    );
    expect(timeRoute?.totalTime).toBeLessThan(
      distanceRoute?.totalTime ?? Infinity
    );
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
    globalThis.fetch = vi.fn(
      async () => new Response("erro", { status: 503 })
    ) as any;

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

    expect(
      result?.waypoints.slice(0, 2).map(waypoint => waypoint.address)
    ).toEqual(["near 1", "near 2"]);
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

    expect(
      result?.waypoints.slice(0, 2).map(waypoint => waypoint.address)
    ).toEqual(["corner 1", "corner 2"]);
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

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "balanced",
      0,
      {
        localityMode: "strict",
      }
    );

    expect(result?.waypoints.map(waypoint => waypoint.address)).toEqual([
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

    const result = await optimizeRouteWithRoadMetrics(
      locations,
      "balanced",
      0,
      {
        localityMode: "strict",
      }
    );

    expect(result?.sequence).toHaveLength(130);
    expect(coordinateCounts.length).toBeGreaterThan(1);
    expect(Math.max(...coordinateCounts)).toBeLessThan(120);
  });
});
