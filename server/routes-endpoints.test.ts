import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `route-endpoints-user-${userId}`,
    email: `route-endpoints-${userId}@example.com`,
    name: "Route Endpoints User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Route endpoints", () => {
  it("creates stops and optimizes route in one backend operation", async () => {
    const caller = appRouter.createCaller(createAuthContext(8201));

    const result = await caller.routes.createAndOptimize({
      name: "Rota atomica",
      mode: "balanced",
      stops: [
        {
          address: "Rua A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua B, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
        },
      ],
    });

    expect(result.route.status).toBe("optimized");
    expect(result.optimization.totalDistance).toBeGreaterThan(0);

    const stops = await caller.stops.list({ routeId: result.route.id });
    expect(stops).toHaveLength(2);
  });

  it("rolls back route creation when optimization rejects invalid stops", async () => {
    const caller = appRouter.createCaller(createAuthContext(8202));

    await expect(
      caller.routes.createAndOptimize({
        name: "Rota invalida",
        mode: "balanced",
        stops: [
          {
            address: "Rua A, Presidente Prudente - SP",
            latitude: -22.1207,
            longitude: -51.3889,
            sequence: 0,
          },
          {
            address: "Parada sem coordenadas",
            latitude: 0,
            longitude: 0,
            sequence: 1,
          },
        ],
      })
    ).rejects.toThrow();

    const routes = await caller.routes.list();
    expect(routes).toHaveLength(0);
  });

  it("respects input stop order when sequential routing is requested", async () => {
    const caller = appRouter.createCaller(createAuthContext(8203));

    const result = await caller.routes.createAndOptimize({
      name: "Rota por STOP",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Stop A",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Stop B",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 1,
        },
        {
          address: "Stop C",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Stop A",
      "Stop B",
      "Stop C",
    ]);
    expect(stops.map((stop: any) => Number(stop.sequence))).toEqual([0, 1, 2]);
  });

  it("saves and clears start/end points for an existing route", async () => {
    const caller = appRouter.createCaller(createAuthContext(8101));
    const route = await caller.routes.create({
      name: "Rota com inicio e fim",
      mode: "balanced",
    });

    await caller.routes.update({
      id: route.id,
      startLocation: "Rua Inicio, 100, Presidente Prudente - SP",
      startLatitude: -22.1207,
      startLongitude: -51.3889,
      endLocation: "Rua Fim, 200, Presidente Prudente - SP",
      endLatitude: -22.1307,
      endLongitude: -51.3989,
    });

    const updatedRoute = await caller.routes.get({ id: route.id });

    expect(updatedRoute?.startLocation).toBe(
      "Rua Inicio, 100, Presidente Prudente - SP"
    );
    expect(Number(updatedRoute?.startLatitude)).toBe(-22.1207);
    expect(updatedRoute?.endLocation).toBe("Rua Fim, 200, Presidente Prudente - SP");
    expect(Number(updatedRoute?.endLongitude)).toBe(-51.3989);

    await caller.routes.update({
      id: route.id,
      startLocation: null,
      startLatitude: null,
      startLongitude: null,
      endLocation: null,
      endLatitude: null,
      endLongitude: null,
    });

    const clearedRoute = await caller.routes.get({ id: route.id });

    expect(clearedRoute?.startLocation).toBeNull();
    expect(clearedRoute?.startLatitude).toBeNull();
    expect(clearedRoute?.endLocation).toBeNull();
    expect(clearedRoute?.endLongitude).toBeNull();
  });
});
