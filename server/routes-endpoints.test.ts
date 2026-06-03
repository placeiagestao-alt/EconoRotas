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

  it("keeps route as draft when optimization rejects invalid stops", async () => {
    const caller = appRouter.createCaller(createAuthContext(8202));

    const result = await caller.routes.createAndOptimize({
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
    });

    const routes = await caller.routes.list();
    const stops = await caller.stops.list({ routeId: result.route.id });

    expect(result.optimization).toBeNull();
    expect(result.warning).toContain("salva como rascunho");
    expect(routes).toHaveLength(1);
    expect(routes[0].status).toBe("draft");
    expect(stops).toHaveLength(2);
  });

  it("keeps route as draft when optimization finds blocking audit issues", async () => {
    const caller = appRouter.createCaller(createAuthContext(8211));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com parada generica",
      mode: "balanced",
      stops: [
        {
          address: "Entrega",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Valida, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 1,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });

    expect(result.optimization).toBeNull();
    expect(result.warning).toContain("não foi possível otimizar");
    expect(route?.status).toBe("draft");
  });

  it("keeps route as draft when the auditor blocks a poor optimized sequence", async () => {
    const caller = appRouter.createCaller(createAuthContext(8212));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com sequencia reprovada",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Auditoria, 100, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Auditoria, 300, Presidente Prudente - SP",
          latitude: -22.1218,
          longitude: -51.4,
          sequence: 1,
        },
        {
          address: "Rua Auditoria, 120, Presidente Prudente - SP",
          latitude: -22.1204,
          longitude: -51.4,
          sequence: 2,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });

    expect(result.optimization).toBeNull();
    expect(result.warning).toContain("Auditor bloqueou");
    expect(route?.status).toBe("draft");
  });

  it("rejects reoptimization when too many addresses share approximate coordinates", async () => {
    const caller = appRouter.createCaller(createAuthContext(8213));
    const route = await caller.routes.create({
      name: "Rota com geocodificacao duplicada",
      mode: "balanced",
    });

    await caller.stops.create({
      routeId: route.id,
      stops: [
        {
          address: "Rua Duplicada A, 100, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Duplicada A, 200, Presidente Prudente - SP",
          latitude: -22.12,
          longitude: -51.4,
          sequence: 1,
        },
        {
          address: "Rua Duplicada B, 100, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 2,
        },
        {
          address: "Rua Duplicada B, 200, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 3,
        },
        {
          address: "Rua Duplicada C, 100, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.402,
          sequence: 4,
        },
        {
          address: "Rua Duplicada C, 200, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.402,
          sequence: 5,
        },
      ],
    });

    await expect(caller.routes.optimize({ id: route.id })).rejects.toThrow(
      "Geocodificacao imprecisa"
    );

    const routeAfter = await caller.routes.get({ id: route.id });
    const stopsAfter = await caller.stops.list({ routeId: route.id });

    expect(routeAfter?.status).toBe("draft");
    expect(stopsAfter).toHaveLength(6);
  });

  it("respects input stop order when sequential routing is requested", async () => {
    const caller = appRouter.createCaller(createAuthContext(8203));

    const result = await caller.routes.createAndOptimize({
      name: "Rota por STOP",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Jose Bongiovani, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Jose Bongiovani, 200, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.2889,
          sequence: 1,
        },
        {
          address: "Rua Jose Bongiovani, 300, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3789,
          sequence: 2,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    expect(stops.map((stop: any) => stop.address)).toEqual([
      "Rua Jose Bongiovani, 100, Presidente Prudente - SP",
      "Rua Jose Bongiovani, 200, Presidente Prudente - SP",
      "Rua Jose Bongiovani, 300, Presidente Prudente - SP",
    ]);
    expect(stops.map((stop: any) => Number(stop.sequence))).toEqual([0, 1, 2]);
  });

  it("optimizes imported stops by default instead of keeping spreadsheet order", async () => {
    const caller = appRouter.createCaller(createAuthContext(8204));

    const result = await caller.routes.createAndOptimize({
      name: "Rota importada otimizada",
      mode: "shortest_distance",
      stops: [
        {
          address: "Rua Fernando Costa, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Fernando Costa, 900, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
        },
        {
          address: "Rua Fernando Costa, 120, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.3892,
          sequence: 2,
        },
      ],
    });

    const stops = await caller.stops.list({ routeId: result.route.id });

    expect(result.optimization.totalDistance).toBeLessThan(1200);
    expect(stops.map((stop: any) => stop.address)).not.toEqual([
      "Rua Fernando Costa, 100, Presidente Prudente - SP",
      "Rua Fernando Costa, 900, Presidente Prudente - SP",
      "Rua Fernando Costa, 120, Presidente Prudente - SP",
    ]);
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

  it("updates an existing stop and marks the route for reoptimization", async () => {
    const caller = appRouter.createCaller(createAuthContext(8205));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com parada editavel",
      mode: "balanced",
      stops: [
        {
          address: "Rua A, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
          notes: "Pacote: 1",
        },
        {
          address: "Rua B, Presidente Prudente - SP",
          latitude: -22.1307,
          longitude: -51.3989,
          sequence: 1,
          notes: "Pacote: 2",
        },
      ],
    });
    const [firstStop] = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.update({
      routeId: result.route.id,
      stopId: firstStop.id,
      address: "Rua Editada, 1520, Presidente Prudente - SP",
      latitude: -22.1407,
      longitude: -51.4089,
      sequence: Number(firstStop.sequence),
      notes: "Pacote: 1520",
    });

    const stops = await caller.stops.list({ routeId: result.route.id });
    const route = await caller.routes.get({ id: result.route.id });

    expect(stops.some((stop: any) => stop.address.includes("1520"))).toBe(true);
    expect(stops.some((stop: any) => stop.notes === "Pacote: 1520")).toBe(true);
    expect(route?.status).toBe("draft");
  });

  it("deletes an existing stop and marks the route for reoptimization", async () => {
    const caller = appRouter.createCaller(createAuthContext(8206));

    const result = await caller.routes.createAndOptimize({
      name: "Rota com parada removivel",
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
        {
          address: "Rua C, Presidente Prudente - SP",
          latitude: -22.1407,
          longitude: -51.4089,
          sequence: 2,
        },
      ],
    });
    const stopsBeforeDelete = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.delete({
      routeId: result.route.id,
      stopId: stopsBeforeDelete[1].id,
    });

    const stopsAfterDelete = await caller.stops.list({ routeId: result.route.id });
    const route = await caller.routes.get({ id: result.route.id });

    expect(stopsAfterDelete).toHaveLength(2);
    expect(stopsAfterDelete.map((stop: any) => stop.id)).not.toContain(
      stopsBeforeDelete[1].id
    );
    expect(route?.status).toBe("draft");
  });

  it("reoptimizes only remaining stops and removes handled stops from the active route", async () => {
    const caller = appRouter.createCaller(createAuthContext(8207));

    const result = await caller.routes.createAndOptimize({
      name: "Rota restante",
      mode: "shortest_distance",
      stops: [
        {
          address: "Rua Doutor Gurgel, 100, Presidente Prudente - SP",
          latitude: -22.1207,
          longitude: -51.3889,
          sequence: 0,
        },
        {
          address: "Rua Doutor Gurgel, 120, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.3892,
          sequence: 1,
        },
        {
          address: "Rua Doutor Gurgel, 140, Presidente Prudente - SP",
          latitude: -22.122,
          longitude: -51.3902,
          sequence: 2,
        },
        {
          address: "Rua Doutor Gurgel, 160, Presidente Prudente - SP",
          latitude: -22.123,
          longitude: -51.3912,
          sequence: 3,
        },
      ],
    });
    const stopsBeforeReoptimize = await caller.stops.list({ routeId: result.route.id });
    const handledStops = stopsBeforeReoptimize.filter((stop: any) =>
      [
        "Rua Doutor Gurgel, 100, Presidente Prudente - SP",
        "Rua Doutor Gurgel, 120, Presidente Prudente - SP",
      ].includes(stop.address)
    );

    await caller.routes.optimizeRemaining({
      id: result.route.id,
      mode: "shortest_distance",
      excludeStopIds: handledStops.map((stop: any) => stop.id),
    });

    const stopsAfterReoptimize = await caller.stops.list({ routeId: result.route.id });

    expect(stopsAfterReoptimize).toHaveLength(2);
    expect(stopsAfterReoptimize.map((stop: any) => stop.address).sort()).toEqual([
      "Rua Doutor Gurgel, 140, Presidente Prudente - SP",
      "Rua Doutor Gurgel, 160, Presidente Prudente - SP",
    ]);
  });

  it("uses last optimization metadata when recalculating the route audit panel", async () => {
    const caller = appRouter.createCaller(createAuthContext(8208));

    const result = await caller.routes.createAndOptimize({
      name: "Rota auditada com ordem preservada",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 900, Presidente Prudente - SP",
          latitude: -22.14,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Doutor Jose Foz, 120, Presidente Prudente - SP",
          latitude: -22.12001,
          longitude: -51.40001,
          sequence: 1,
        },
      ],
    });

    const audit = await caller.routes.audit({ id: result.route.id });

    expect(audit.context.respectInputSequence).toBe(true);
    expect(audit.context.requireStartLocation).toBe(true);
    expect(audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")).toBe(
      true
    );
    expect(audit.issues.some((issue: any) => issue.type === "missing_driver_origin")).toBe(
      true
    );
  });

  it("does not reuse optimization audit metadata after manual route edits", async () => {
    const caller = appRouter.createCaller(createAuthContext(8209));

    const result = await caller.routes.createAndOptimize({
      name: "Rota auditada editada",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 900, Presidente Prudente - SP",
          latitude: -22.14,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Doutor Jose Foz, 120, Presidente Prudente - SP",
          latitude: -22.12001,
          longitude: -51.40001,
          sequence: 1,
        },
      ],
    });
    const stops = await caller.stops.list({ routeId: result.route.id });

    await caller.stops.update({
      routeId: result.route.id,
      stopId: stops[0].id,
      address: stops[0].address,
      latitude: Number(stops[0].latitude),
      longitude: Number(stops[0].longitude),
      sequence: Number(stops[0].sequence),
      notes: "editada manualmente",
    });

    const audit = await caller.routes.audit({ id: result.route.id });

    expect(audit.context.staleOptimizationContext).toBe(true);
    expect(audit.context.respectInputSequence).toBeNull();
    expect(audit.context.requireStartLocation).toBe(false);
    expect(audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")).toBe(
      false
    );
    expect(audit.issues.some((issue: any) => issue.type === "missing_driver_origin")).toBe(
      false
    );
  });

  it("marks an optimized route as draft when a new stop is added", async () => {
    const caller = appRouter.createCaller(createAuthContext(8210));

    const result = await caller.routes.createAndOptimize({
      name: "Rota auditada com parada nova",
      mode: "balanced",
      respectInputSequence: true,
      stops: [
        {
          address: "Rua Doutor Jose Foz, 900, Presidente Prudente - SP",
          latitude: -22.14,
          longitude: -51.4,
          sequence: 0,
        },
        {
          address: "Rua Doutor Jose Foz, 120, Presidente Prudente - SP",
          latitude: -22.12001,
          longitude: -51.40001,
          sequence: 1,
        },
      ],
    });

    await caller.stops.create({
      routeId: result.route.id,
      stops: [
        {
      address: "Rua Doutor Jose Foz, 140, Presidente Prudente - SP",
          latitude: -22.121,
          longitude: -51.401,
          sequence: 2,
        },
      ],
    });

    const route = await caller.routes.get({ id: result.route.id });
    const audit = await caller.routes.audit({ id: result.route.id });

    expect(route?.status).toBe("draft");
    expect(audit.context.staleOptimizationContext).toBe(true);
    expect(audit.context.respectInputSequence).toBeNull();
    expect(audit.context.requireStartLocation).toBe(false);
    expect(audit.issues.some((issue: any) => issue.type === "bad_preserved_sequence")).toBe(
      false
    );
  });
});
