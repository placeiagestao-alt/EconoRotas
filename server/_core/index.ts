import "dotenv/config";
import express from "express";
import type { Express } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerGeocodingProxy } from "./geocodingProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic } from "./static";

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
  const configuredOrigins = [
    ENV.publicAppUrl,
    ...ENV.allowedOrigins.split(","),
  ]
    .map((origin) => origin.trim())
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

function isLocalDevelopmentOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(
    origin
  );
}

function validateProductionEnvironment() {
  if (!ENV.isProduction) return;

  const missing = [];
  if (!ENV.databaseUrl && !ENV.allowEphemeralDb) missing.push("DATABASE_URL");
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`
    );
  }

  if (ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must have at least 32 characters in production");
  }

  if (process.env.VITE_ENABLE_DEV_LOGIN === "true") {
    throw new Error("VITE_ENABLE_DEV_LOGIN cannot be true in production");
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
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "EconoRotas",
      environment: ENV.isProduction ? "production" : "development",
      timestamp: new Date().toISOString(),
    });
  });
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
  const app = createApp({ serveClient: process.env.NODE_ENV !== "development" });
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
