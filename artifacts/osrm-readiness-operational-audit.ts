import dotenv from "dotenv";
import fs from "node:fs";

for (const p of [".env.worker.production", ".env.production", ".env.local", ".env"]) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false, quiet: true });
}

const [{ appRouter }, db, { ENV }] = await Promise.all([
  import("../server/routers"),
  import("../server/db"),
  import("../server/_core/env"),
]);

function makeStops(count: number) {
  const baseLat = -22.121;
  const baseLng = -51.407;
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 0.00042;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      address: `Rua Teste Operacional ${index + 1}, ${1000 + index}, Presidente Prudente, SP`,
      latitude: baseLat + row * spacing,
      longitude: baseLng + column * spacing,
      sequence: index + 1,
      packageNumber: String(index + 1),
      geocodingConfidenceScore: 100,
      geocodingMethod: "manual_coordinate" as const,
      geocodingSuspect: false,
    };
  });
}

const openId = `codex-osrm-audit-${Date.now()}`;
const email = `${openId}@example.com`;
await db.upsertUser({
  openId,
  email,
  name: "Codex OSRM Audit",
  loginMethod: "google",
  role: "user",
  acceptedTermsAt: new Date(),
  lastSignedIn: new Date(),
});

const user = await db.getUserByOpenId(openId);
if (!user) throw new Error("usuario temporario nao criado");

const caller = appRouter.createCaller({
  user,
  req: { protocol: "https", headers: {} } as any,
  res: {} as any,
});

const scenarios = process.argv
  .slice(2)
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0);
const stopCounts = scenarios.length ? scenarios : [50, 100, 250, 500];
const results: any[] = [];

for (const stopCount of stopCounts) {
  const started = Date.now();
  let routeId: number | null = null;
  const item: any = { stopCount, startedAt: new Date().toISOString() };

  try {
    const result = await caller.routes.createAndOptimize({
      name: `AUDITORIA OSRM ENTERPRISE ${stopCount}`,
      mode: "balanced",
      stops: makeStops(stopCount),
      respectInputSequence: false,
    });

    routeId = result.route?.id ?? null;
    item.routeId = routeId;
    item.routeStatusAfterCreateAndOptimize = result.route?.status ?? null;
    item.warning = result.warning ?? null;
    item.optimizationReturned = Boolean(result.optimization);

    if (routeId) {
      const route = await caller.routes.get({ id: routeId });
      const stops = await caller.stops.list({ routeId });
      const audit = await caller.routes.audit({ id: routeId });
      item.savedRouteStatus = route?.status ?? null;
      item.savedStopCount = stops.length;
      item.auditStatus = audit.status;
      item.auditQuality = audit.quality;
      item.auditScore = audit.score;
      item.auditIssueCount = audit.issueCount;
      item.blockingIssueTypes = (audit.issues || [])
        .filter((issue: any) => ["missing_coordinates", "invalid_coordinates"].includes(issue.type))
        .map((issue: any) => issue.type);
      item.startWouldBeEnabled =
        item.blockingIssueTypes.length === 0 && route?.status === "optimized";
      item.fiscalDidNotBlockValidCoordinates = item.blockingIssueTypes.length === 0;

      if (item.startWouldBeEnabled) {
        const updated = await caller.routes.update({
          id: routeId,
          status: "optimized",
          startLocation: "Local atual do motorista",
          startLatitude: -22.121,
          startLongitude: -51.407,
        });
        item.canUpdateAsStartedEquivalent = Boolean(updated);
      }

      await caller.routes.delete({ id: routeId });
      item.cleanedRoute = true;
    }
  } catch (error: any) {
    item.error = error?.message || String(error);
    item.code = error?.code || error?.name || null;
    if (routeId) {
      try {
        await caller.routes.delete({ id: routeId });
        item.cleanedRoute = true;
      } catch {}
    }
  }

  item.runtimeMs = Date.now() - started;
  results.push(item);
  console.log(JSON.stringify(item));
}

const report = {
  generatedAt: new Date().toISOString(),
  env: {
    maxSyncStops: ENV.maxSyncStops,
    maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
    osrmRequired: ENV.osrmRequired,
    osrmBaseUrl: ENV.osrmBaseUrl,
  },
  user: { id: user.id, email },
  results,
};

fs.writeFileSync(
  "artifacts/osrm-enterprise-operational-flow-audit.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));
process.exit(0);
