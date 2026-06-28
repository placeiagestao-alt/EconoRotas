import "./runtimeWarnings";
import "dotenv/config";
import express from "express";
import type { Express } from "express";
import { execFile } from "node:child_process";
import { createServer } from "http";
import fs from "node:fs";
import net from "net";
import path from "node:path";
import { promisify } from "node:util";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerGeocodingProxy } from "./geocodingProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { isAdminEmail } from "./adminAccess";
import { serveStatic } from "./static";
import { recordHealthObservation } from "./monitoring";
import { getOsrmHealth } from "../osrm";
import {
  getOptimizationQueueHealth,
  getOptimizationWorkersDashboard,
} from "../optimizationQueue";
import { getMultiVehicleReadinessDashboard } from "../multiVehicleReadiness";
import {
  ensurePersistentFallbackDbLoaded,
  getAdminDashboardEvents,
  getAdminOperationalDashboard,
  getDatabaseHealth,
  getDisasterReadinessDashboard,
  getGeocodingExecutiveReport,
  getGeocodingImpactDashboard,
  getGoLive500Dashboard,
  getOperationExecutionReport,
  getPerformanceBenchmarkDashboard,
  getQueueIntegrityDashboard,
  getPersistentFallbackDbHealth,
  getPersistentValue,
  hasPersistentFallbackDbConfigured,
  refreshAdminDashboardMetrics,
  setPersistentValue,
} from "../db";

const execFileAsync = promisify(execFile);
let imileCaptureRunPromise: Promise<string> | null = null;

function getLocalImileCapturePath() {
  return path.resolve(
    process.cwd(),
    ".tmp",
    "imile-capture",
    "imile-capture-merged.xml"
  );
}

async function runLocalImileCapture() {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "capture-imile-screen.mjs"
  );

  await execFileAsync(
    process.execPath,
    [scriptPath, "--pages=130", "--delay=700"],
    {
      cwd: process.cwd(),
      maxBuffer: 5 * 1024 * 1024,
      timeout: 12 * 60 * 1000,
      windowsHide: true,
    }
  );

  const capturePath = getLocalImileCapturePath();
  if (!fs.existsSync(capturePath)) {
    throw new Error(
      "Captura finalizada, mas o XML consolidado nao foi encontrado."
    );
  }

  return fs.readFileSync(capturePath, "utf8");
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function normalizeOrigin(origin: string) {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/$/, "");
  }
}

function parseAllowedOrigins() {
  const configuredOrigins = [ENV.publicAppUrl, ...ENV.allowedOrigins.split(",")]
    .map(origin => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  return new Set([
    ...configuredOrigins,
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost",
  ]);
}

function normalizeCaptureOwner(value: string | null | undefined) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._+-]+/g, "-") || ""
  );
}

function getCaptureKeys(owner: string) {
  const normalizedOwner = normalizeCaptureOwner(owner);
  return {
    userKey: normalizedOwner ? `imile-capture:user:${normalizedOwner}` : "",
    globalKey: "imile-capture:global",
  };
}

async function getAuthenticatedCaptureOwner(req: express.Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    return normalizeCaptureOwner(user.email || user.openId || String(user.id));
  } catch {
    return "";
  }
}

function isLocalDevelopmentOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(
    origin
  );
}

function validateProductionEnvironment() {
  if (!ENV.isProduction) return;

  const missing = [];
  if (ENV.requireManagedDatabase) {
    if (!ENV.databaseUrl || ENV.hasInvalidProductionDatabaseUrl) {
      missing.push("DATABASE_URL MySQL gerenciado");
    }
  } else if (!ENV.databaseUrl && !hasPersistentFallbackDbConfigured()) {
    missing.push("DATABASE_URL or Upstash Redis");
  }
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`
    );
  }

  if (ENV.cookieSecret.length < 32) {
    throw new Error(
      "JWT_SECRET must have at least 32 characters in production"
    );
  }

  if (process.env.VITE_ENABLE_DEV_LOGIN === "true") {
    throw new Error("VITE_ENABLE_DEV_LOGIN cannot be true in production");
  }

  if (
    ENV.allowEphemeralDb &&
    !hasPersistentFallbackDbConfigured() &&
    !ENV.databaseUrl
  ) {
    throw new Error(
      "ALLOW_EPHEMERAL_DB cannot be the only production storage. Configure a managed database or Upstash Redis."
    );
  }
}

async function getStorageHealthSnapshot(source: string) {
  const database = await getDatabaseHealth();
  const osrm = await getOsrmHealth();
  const queue = await getOptimizationQueueHealth();
  if (!database.connected) {
    try {
      await ensurePersistentFallbackDbLoaded();
    } catch {
      // The fallback health object below exposes the load error.
    }
  }

  const fallbackStore = getPersistentFallbackDbHealth();
  const canUseLocalFallback =
    !ENV.isProduction ||
    (ENV.allowEphemeralDb && !ENV.hasInvalidProductionDatabaseUrl);
  const storageAvailable = ENV.requireManagedDatabase
    ? database.connected
    : database.connected || fallbackStore.loaded || canUseLocalFallback;
  const osrmAvailable = !osrm.required || (osrm.enabled && osrm.reachable);
  const systemAvailable = storageAvailable && osrmAvailable;
  const mode = database.connected
    ? "persistent"
    : fallbackStore.configured
      ? "redis-fallback"
      : "local-fallback";

  await recordHealthObservation({
    database,
    fallbackStore,
    storageAvailable,
    systemAvailable,
    mode,
    source,
    osrm,
  });

  return {
    database,
    fallbackStore,
    storageAvailable,
    systemAvailable,
    osrm,
    queue,
    mode,
  };
}

async function requireAdminApiRequest(
  req: express.Request,
  res: express.Response
) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin" || !isAdminEmail(user.email, ENV.adminEmails)) {
      res.status(403).json({ error: "Acesso restrito ao administrador." });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Entre como administrador." });
    return null;
  }
}

export function createApp(options: { serveClient?: boolean } = {}): Express {
  validateProductionEnvironment();

  const app = express();
  const allowedOrigins = parseAllowedOrigins();
  const shouldServeClient = options.serveClient ?? true;

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigin =
      origin &&
      (allowedOrigins.has(origin) ||
        (!ENV.isProduction && isLocalDevelopmentOrigin(origin)));

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, X-Dev-Login"
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });
  app.get("/assets/*", (req, res, next) => {
    if (!req.path.endsWith(".js")) {
      next();
      return;
    }

    res
      .status(200)
      .type("application/javascript")
      .setHeader("Cache-Control", "no-store, max-age=0").send(`
const key = "econorotas:asset-refresh";
try {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(key) || 0);
  if (!last || now - last > 30000) {
    sessionStorage.setItem(key, String(now));
    window.dispatchEvent(new CustomEvent("econorotas:pwa-update"));
    setTimeout(() => window.location.reload(), 50);
  }
} catch {
  setTimeout(() => window.location.reload(), 50);
}
export default function EconoRotasAssetRefresh() { return null; }
`);
  });
  app.get("/api/health", async (_req, res) => {
    try {
      const {
        database,
        fallbackStore,
        storageAvailable,
        systemAvailable,
        osrm,
        queue,
        mode,
      } = await getStorageHealthSnapshot("api.health");

      res.status(systemAvailable ? 200 : 500).json({
        ok: systemAvailable,
        app: "EconoRota",
        environment: ENV.isProduction ? "production" : "development",
        mode,
        database,
        fallbackStore,
        osrm,
        queue,
        requiredManagedDatabase: ENV.requireManagedDatabase,
        warning: ENV.hasInvalidProductionDatabaseUrl
          ? "DATABASE_URL aponta para host local/Docker e não funciona em Vercel. Configure MySQL gerenciado ou remova DATABASE_URL e use Upstash Redis."
          : undefined,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        app: "EconoRota",
        environment: ENV.isProduction ? "production" : "development",
        mode: "health-error",
        error: error instanceof Error ? error.message : String(error),
        requiredManagedDatabase: ENV.requireManagedDatabase,
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.get("/api/monitor/ping", async (_req, res) => {
    try {
      const {
        database,
        fallbackStore,
        storageAvailable,
        systemAvailable,
        osrm,
        queue,
        mode,
      } = await getStorageHealthSnapshot("api.monitor.ping");
      let adminDashboardRefresh: { ok: boolean; error?: string } = {
        ok: false,
      };
      if (systemAvailable) {
        try {
          await refreshAdminDashboardMetrics();
          adminDashboardRefresh = { ok: true };
        } catch (error) {
          adminDashboardRefresh = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      res.status(systemAvailable ? 200 : 500).json({
        ok: systemAvailable,
        monitor: true,
        app: "EconoRota",
        environment: ENV.isProduction ? "production" : "development",
        mode,
        database,
        fallbackStore,
        osrm,
        queue,
        adminDashboardRefresh,
        requiredManagedDatabase: ENV.requireManagedDatabase,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        monitor: true,
        app: "EconoRota",
        environment: ENV.isProduction ? "production" : "development",
        mode: "health-error",
        error: error instanceof Error ? error.message : String(error),
        requiredManagedDatabase: ENV.requireManagedDatabase,
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.get("/api/admin/dashboard", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    const dashboard = await getAdminOperationalDashboard();
    const optimizationQueue = await getOptimizationQueueHealth();
    const optimizationWorkers = await getOptimizationWorkersDashboard();
    const queueIntegrity = await getQueueIntegrityDashboard();
    const disasterReadiness = await getDisasterReadinessDashboard();
    const performanceBenchmarks = await getPerformanceBenchmarkDashboard();
    const multiVehicleReadiness = await getMultiVehicleReadinessDashboard();
    const goLive500 = await getGoLive500Dashboard();

    res.json({
      ...dashboard,
      optimizationQueue,
      optimizationWorkers,
      queueIntegrity,
      disasterReadiness,
      performanceBenchmarks,
      multiVehicleReadiness,
      goLive500,
    });
  });
  app.get("/api/admin/events", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 30);
    res.json(await getAdminDashboardEvents(page, limit));
  });
  app.get("/api/admin/geocoding-impact", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getGeocodingImpactDashboard());
  });
  app.get("/api/admin/geocoding-executive-report", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getGeocodingExecutiveReport());
  });
  app.get("/api/admin/operation-execution-report", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getOperationExecutionReport());
  });
  app.get("/api/admin/workers", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getOptimizationWorkersDashboard());
  });
  app.get("/api/admin/queue-integrity", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getQueueIntegrityDashboard());
  });
  app.get("/api/admin/disaster-readiness", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getDisasterReadinessDashboard());
  });
  app.get("/api/admin/performance-benchmarks", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getPerformanceBenchmarkDashboard());
  });
  app.get("/api/admin/go-live-500", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getGoLive500Dashboard());
  });
  app.get("/api/admin/multi-vehicle-readiness", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;

    res.json(await getMultiVehicleReadinessDashboard());
  });
  app.get("/api/app-update/android", (_req, res) => {
    const latestVersion = ENV.androidUpdateLatestVersion.trim();
    const apkUrl = ENV.androidUpdateApkUrl.trim();

    if (!latestVersion || !apkUrl) {
      res.json({ enabled: false });
      return;
    }

    res.json({
      enabled: true,
      latestVersion,
      apkUrl,
      required: ENV.androidUpdateRequired,
      minimumSupportedVersion:
        ENV.androidMinimumSupportedVersion.trim() || undefined,
      message: ENV.androidUpdateMessage.trim() || undefined,
      publishedAt: ENV.androidUpdatePublishedAt.trim() || undefined,
    });
  });
  app.get("/api/imile/capture/latest", async (req, res) => {
    const owner = await getAuthenticatedCaptureOwner(req);
    if (!owner) {
      res.status(401).json({
        message: "Entre no EconoRota para importar a captura iMile.",
      });
      return;
    }

    const { userKey, globalKey } = getCaptureKeys(owner);
    const storedCapture =
      (userKey ? await getPersistentValue(userKey) : null) ??
      (await getPersistentValue(globalKey));

    if (storedCapture) {
      res.type("application/xml").send(storedCapture);
      return;
    }

    const capturePath = getLocalImileCapturePath();

    if (!fs.existsSync(capturePath)) {
      res.status(404).json({
        message:
          "Nenhuma captura iMile encontrada. Rode a captura no Android antes de importar.",
      });
      return;
    }

    res.type("application/xml").send(fs.readFileSync(capturePath, "utf8"));
  });
  app.post("/api/imile/capture/run", async (_req, res) => {
    if (process.env.VERCEL) {
      res.status(501).json({
        message:
          "Captura automatica exige Android conectado via ADB no computador local. No Vercel/iPhone, use envio ou importacao da captura.",
      });
      return;
    }

    try {
      if (!imileCaptureRunPromise) {
        imileCaptureRunPromise = runLocalImileCapture().finally(() => {
          imileCaptureRunPromise = null;
        });
      }

      const capture = await imileCaptureRunPromise;
      res.type("application/xml").send(capture);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao capturar a tela do Rider Delivery.";
      res.status(500).json({ message });
    }
  });
  app.post(
    "/api/imile/capture/latest",
    express.text({
      limit: "15mb",
      type: ["application/xml", "text/xml", "text/plain", "*/*"],
    }),
    async (req, res) => {
      const uploadToken = req.headers["x-imile-capture-token"];
      const hasValidUploadToken =
        ENV.imileCaptureUploadToken &&
        typeof uploadToken === "string" &&
        uploadToken === ENV.imileCaptureUploadToken;
      const authenticatedOwner = await getAuthenticatedCaptureOwner(req);

      if (!hasValidUploadToken && !authenticatedOwner) {
        res.status(401).json({ message: "Captura iMile nao autorizada." });
        return;
      }

      const capture = typeof req.body === "string" ? req.body.trim() : "";
      if (!capture || !capture.includes("<")) {
        res.status(400).json({ message: "Arquivo de captura iMile invalido." });
        return;
      }

      const owner = authenticatedOwner;
      const { userKey, globalKey } = getCaptureKeys(owner);
      const key = userKey || globalKey;

      await setPersistentValue(key, capture);
      res.json({
        ok: true,
        owner: owner || "global",
        bytes: Buffer.byteLength(capture, "utf8"),
      });
    }
  );
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGeocodingProxy(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (shouldServeClient && process.env.NODE_ENV !== "development") {
    serveStatic(app);
  }

  return app;
}

export async function startServer() {
  const app = createApp({
    serveClient: process.env.NODE_ENV !== "development",
  });
  const server = createServer(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = ENV.isProduction
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
