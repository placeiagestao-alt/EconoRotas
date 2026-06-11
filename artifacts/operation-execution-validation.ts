import dotenv from "dotenv";
import fs from "node:fs";

for (const p of [".env.worker.production", ".env.production", ".env.local", ".env"]) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false, quiet: true });
}

const [{ appRouter }, db] = await Promise.all([
  import("../server/routers"),
  import("../server/db"),
]);

function stops(label: string) {
  return [
    {
      address: `Rua ${label} A, 100, Presidente Prudente, SP`,
      latitude: -22.1207,
      longitude: -51.3889,
      sequence: 0,
      geocodingConfidenceScore: 100,
      geocodingMethod: "manual_coordinate" as const,
      geocodingSuspect: false,
    },
    {
      address: `Rua ${label} B, 101, Presidente Prudente, SP`,
      latitude: -22.1217,
      longitude: -51.3899,
      sequence: 1,
      geocodingConfidenceScore: 100,
      geocodingMethod: "manual_coordinate" as const,
      geocodingSuspect: false,
    },
  ];
}

const openId = `codex-execution-analytics-${Date.now()}`;
const email = `${openId}@example.com`;
await db.upsertUser({
  openId,
  email,
  name: "Codex Execution Analytics",
  loginMethod: "google",
  role: "user",
  acceptedTermsAt: new Date(),
  lastSignedIn: new Date(),
});
const user = await db.getUserByOpenId(openId);
if (!user) throw new Error("Usuario temporario nao criado.");

const caller = appRouter.createCaller({
  user,
  req: { protocol: "https", headers: {} } as any,
  res: {} as any,
});

const generatedEvents: any[] = [];
const routesToClean: number[] = [];

async function report(input: any) {
  const result = await caller.events.report({
    severity: "info",
    source: "route.execution.validation",
    title: input.type,
    ...input,
  });
  generatedEvents.push(input);
  return result;
}

const startedRoute = await caller.routes.createAndOptimize({
  name: "VALIDACAO EXECUCAO - INICIADA",
  mode: "balanced",
  stops: stops("Execucao Iniciada"),
});
routesToClean.push(startedRoute.route.id);
await report({
  type: "route_started",
  routeId: startedRoute.route.id,
  metadata: { scenario: "started" },
});

const completedRoute = await caller.routes.createAndOptimize({
  name: "VALIDACAO EXECUCAO - CONCLUIDA",
  mode: "balanced",
  stops: stops("Execucao Concluida"),
});
routesToClean.push(completedRoute.route.id);
await report({
  type: "route_started",
  routeId: completedRoute.route.id,
  metadata: { scenario: "completed" },
});
await new Promise((resolve) => setTimeout(resolve, 20));
await report({
  type: "route_completed",
  routeId: completedRoute.route.id,
  metadata: { scenario: "completed" },
});

const abandonedRoute = await caller.routes.createAndOptimize({
  name: "VALIDACAO EXECUCAO - ABANDONADA",
  mode: "balanced",
  stops: stops("Execucao Abandonada"),
});
routesToClean.push(abandonedRoute.route.id);
await report({
  type: "route_started",
  routeId: abandonedRoute.route.id,
  metadata: { scenario: "abandoned" },
});
await report({
  type: "route_abandoned",
  severity: "warning",
  routeId: abandonedRoute.route.id,
  metadata: { scenario: "abandoned", reason: "manual_reset" },
});

await report({
  type: "route_start_blocked",
  severity: "error",
  routeId: abandonedRoute.route.id,
  metadata: { scenario: "blocked", reason: "invalid_coordinates" },
});

const executionReport = await db.getOperationExecutionReport();
const dashboard = await db.getAdminOperationalDashboard();

for (const routeId of routesToClean) {
  await caller.routes.delete({ id: routeId }).catch(() => null);
}

const reportPayload = {
  generatedAt: new Date().toISOString(),
  user: { id: user.id, email },
  routeIds: routesToClean,
  eventsGenerated: generatedEvents,
  executionReport,
  dashboardExecution: dashboard.operationExecutionReport,
};

fs.writeFileSync(
  "artifacts/operation-execution-validation.json",
  JSON.stringify(reportPayload, null, 2)
);
console.log(JSON.stringify(reportPayload, null, 2));
process.exit(0);
