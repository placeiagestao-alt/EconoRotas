var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, foreignKey, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
var users, routes, stops, routeSchedules, routeHistory, chatHistory, userIntegrations, operationalEvents, routeMetrics, usersRelations, routesRelations, stopsRelations, routeSchedulesRelations, routeHistoryRelations, chatHistoryRelations, userIntegrationsRelations, operationalEventsRelations, routeMetricsRelations;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
      /**
       * Surrogate primary key. Auto-incremented numeric value managed by the database.
       * Use this for relations between tables.
       */
      id: int("id").autoincrement().primaryKey(),
      /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
      openId: varchar("openId", { length: 64 }).notNull().unique(),
      name: text("name"),
      email: varchar("email", { length: 320 }).unique(),
      phone: varchar("phone", { length: 32 }),
      companyName: varchar("companyName", { length: 255 }),
      city: varchar("city", { length: 128 }),
      state: varchar("state", { length: 64 }),
      vehicleType: varchar("vehicleType", { length: 64 }),
      acceptedTermsAt: timestamp("acceptedTermsAt"),
      passwordHash: text("passwordHash"),
      loginMethod: varchar("loginMethod", { length: 64 }),
      role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
      lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
    });
    routes = mysqlTable("routes", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      mode: mysqlEnum("mode", ["shortest_distance", "shortest_time", "balanced"]).default("balanced").notNull(),
      totalDistance: decimal("totalDistance", { precision: 10, scale: 2 }),
      totalTime: int("totalTime"),
      // in minutes
      status: mysqlEnum("status", ["draft", "optimized", "completed", "cancelled"]).default("draft").notNull(),
      startLocation: varchar("startLocation", { length: 255 }),
      startLatitude: decimal("startLatitude", { precision: 10, scale: 8 }),
      startLongitude: decimal("startLongitude", { precision: 11, scale: 8 }),
      endLocation: varchar("endLocation", { length: 255 }),
      endLatitude: decimal("endLatitude", { precision: 10, scale: 8 }),
      endLongitude: decimal("endLongitude", { precision: 11, scale: 8 }),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade")
    }));
    stops = mysqlTable("stops", {
      id: int("id").autoincrement().primaryKey(),
      routeId: int("routeId").notNull(),
      address: varchar("address", { length: 500 }).notNull(),
      latitude: decimal("latitude", { precision: 10, scale: 8 }),
      longitude: decimal("longitude", { precision: 11, scale: 8 }),
      sequence: int("sequence").notNull(),
      // order in the optimized route
      notes: text("notes"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade")
    }));
    routeSchedules = mysqlTable("routeSchedules", {
      id: int("id").autoincrement().primaryKey(),
      routeId: int("routeId").notNull(),
      userId: int("userId").notNull(),
      recurrenceType: mysqlEnum("recurrenceType", ["once", "daily", "weekly"]).default("once").notNull(),
      scheduledDate: timestamp("scheduledDate").notNull(),
      scheduledTime: varchar("scheduledTime", { length: 8 }),
      // HH:MM format
      daysOfWeek: varchar("daysOfWeek", { length: 50 }),
      // JSON array: [0,1,2...] for Sun-Sat
      isActive: boolean("isActive").default(true).notNull(),
      lastExecuted: timestamp("lastExecuted"),
      nextExecution: timestamp("nextExecution"),
      heartbeatJobId: varchar("heartbeatJobId", { length: 255 }),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (table) => ({
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade")
    }));
    routeHistory = mysqlTable("routeHistory", {
      id: int("id").autoincrement().primaryKey(),
      routeId: int("routeId").notNull(),
      userId: int("userId").notNull(),
      executedDate: timestamp("executedDate").defaultNow().notNull(),
      actualDistance: decimal("actualDistance", { precision: 10, scale: 2 }),
      actualTime: int("actualTime"),
      // in minutes
      status: mysqlEnum("status", ["in_progress", "completed", "cancelled"]).default("in_progress").notNull(),
      notes: text("notes"),
      exportedAt: timestamp("exportedAt"),
      exportFormat: mysqlEnum("exportFormat", ["pdf", "csv"]),
      storageKey: varchar("storageKey", { length: 500 }),
      // S3 key for exported file
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (table) => ({
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade")
    }));
    chatHistory = mysqlTable("chatHistory", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      routeId: int("routeId"),
      // optional - chat can be about a specific route
      role: mysqlEnum("role", ["user", "assistant"]).notNull(),
      content: text("content").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null")
    }));
    userIntegrations = mysqlTable("userIntegrations", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      provider: varchar("provider", { length: 64 }).notNull(),
      label: varchar("label", { length: 255 }),
      baseUrl: varchar("baseUrl", { length: 500 }),
      fallbackBaseUrls: text("fallbackBaseUrls"),
      deliveriesPath: varchar("deliveriesPath", { length: 500 }),
      authHeader: varchar("authHeader", { length: 128 }),
      authTokenEncrypted: text("authTokenEncrypted").notNull(),
      country: varchar("country", { length: 16 }),
      lang: varchar("lang", { length: 32 }),
      resourceCode: varchar("resourceCode", { length: 64 }),
      timezone: varchar("timezone", { length: 64 }),
      hubCode: varchar("hubCode", { length: 128 }),
      appVersion: varchar("appVersion", { length: 32 }),
      sourceName: varchar("sourceName", { length: 128 }),
      isActive: boolean("isActive").default(true).notNull(),
      lastValidatedAt: timestamp("lastValidatedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
      userProviderUnique: uniqueIndex("userIntegrations_user_provider_unique").on(table.userId, table.provider)
    }));
    operationalEvents = mysqlTable("operationalEvents", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId"),
      routeId: int("routeId"),
      stopId: int("stopId"),
      type: varchar("type", { length: 96 }).notNull(),
      severity: mysqlEnum("severity", ["info", "warning", "error", "fatal"]).default("info").notNull(),
      source: varchar("source", { length: 128 }).notNull(),
      title: varchar("title", { length: 255 }).notNull(),
      message: text("message"),
      runtime: varchar("runtime", { length: 64 }),
      url: varchar("url", { length: 700 }),
      userAgent: varchar("userAgent", { length: 700 }),
      appVersion: varchar("appVersion", { length: 64 }),
      metadata: json("metadata"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
      createdAtIdx: index("operationalEvents_createdAt_idx").on(table.createdAt),
      severityIdx: index("operationalEvents_severity_idx").on(table.severity),
      typeIdx: index("operationalEvents_type_idx").on(table.type)
    }));
    routeMetrics = mysqlTable("route_metrics", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId"),
      routeId: int("routeId"),
      qualityScore: int("qualityScore").notNull(),
      optimizationRuntimeMs: int("optimizationRuntimeMs").notNull(),
      osrmUsed: boolean("osrmUsed").default(false).notNull(),
      osrmFallback: boolean("osrmFallback").default(false).notNull(),
      clusterCount: int("clusterCount").default(0).notNull(),
      averageClusterRadius: decimal("averageClusterRadius", { precision: 10, scale: 3 }).default("0").notNull(),
      maxClusterRadius: decimal("maxClusterRadius", { precision: 10, scale: 3 }).default("0").notNull(),
      regionRevisitedCount: int("regionRevisitedCount").default(0).notNull(),
      prematureRegionExitCount: int("prematureRegionExitCount").default(0).notNull(),
      nearbyStopSkippedCount: int("nearbyStopSkippedCount").default(0).notNull(),
      routeCrossingCount: int("routeCrossingCount").default(0).notNull(),
      issuesDetectedCount: int("issuesDetectedCount").default(0).notNull(),
      issuesCorrectedCount: int("issuesCorrectedCount").default(0).notNull(),
      issuesBlockedCount: int("issuesBlockedCount").default(0).notNull(),
      auditStatus: mysqlEnum("auditStatus", ["approved", "attention", "critical"]).notNull(),
      auditQuality: mysqlEnum("auditQuality", ["excellent", "good", "attention", "poor", "blocked"]).notNull(),
      auditSource: varchar("auditSource", { length: 128 }),
      routeMode: mysqlEnum("routeMode", ["shortest_distance", "shortest_time", "balanced"]),
      localityMode: mysqlEnum("localityMode", ["balanced", "local", "strict"]),
      stopCount: int("stopCount").default(0).notNull(),
      totalDistanceKm: decimal("totalDistanceKm", { precision: 10, scale: 2 }).default("0").notNull(),
      totalTimeMinutes: int("totalTimeMinutes").default(0).notNull(),
      metadata: json("metadata"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
      createdAtIdx: index("route_metrics_createdAt_idx").on(table.createdAt),
      routeIdIdx: index("route_metrics_routeId_idx").on(table.routeId),
      auditStatusIdx: index("route_metrics_auditStatus_idx").on(table.auditStatus),
      osrmFallbackIdx: index("route_metrics_osrmFallback_idx").on(table.osrmFallback)
    }));
    usersRelations = relations(users, ({ many }) => ({
      routes: many(routes),
      routeSchedules: many(routeSchedules),
      routeHistory: many(routeHistory),
      chatHistory: many(chatHistory),
      userIntegrations: many(userIntegrations),
      operationalEvents: many(operationalEvents),
      routeMetrics: many(routeMetrics)
    }));
    routesRelations = relations(routes, ({ one, many }) => ({
      user: one(users, { fields: [routes.userId], references: [users.id] }),
      stops: many(stops),
      schedules: many(routeSchedules),
      history: many(routeHistory),
      chats: many(chatHistory),
      operationalEvents: many(operationalEvents),
      routeMetrics: many(routeMetrics)
    }));
    stopsRelations = relations(stops, ({ one }) => ({
      route: one(routes, { fields: [stops.routeId], references: [routes.id] })
    }));
    routeSchedulesRelations = relations(routeSchedules, ({ one }) => ({
      user: one(users, { fields: [routeSchedules.userId], references: [users.id] }),
      route: one(routes, { fields: [routeSchedules.routeId], references: [routes.id] })
    }));
    routeHistoryRelations = relations(routeHistory, ({ one }) => ({
      user: one(users, { fields: [routeHistory.userId], references: [users.id] }),
      route: one(routes, { fields: [routeHistory.routeId], references: [routes.id] })
    }));
    chatHistoryRelations = relations(chatHistory, ({ one }) => ({
      user: one(users, { fields: [chatHistory.userId], references: [users.id] }),
      route: one(routes, { fields: [chatHistory.routeId], references: [routes.id] })
    }));
    userIntegrationsRelations = relations(userIntegrations, ({ one }) => ({
      user: one(users, { fields: [userIntegrations.userId], references: [users.id] })
    }));
    operationalEventsRelations = relations(operationalEvents, ({ one }) => ({
      user: one(users, { fields: [operationalEvents.userId], references: [users.id] }),
      route: one(routes, { fields: [operationalEvents.routeId], references: [routes.id] })
    }));
    routeMetricsRelations = relations(routeMetrics, ({ one }) => ({
      user: one(users, { fields: [routeMetrics.userId], references: [users.id] }),
      route: one(routes, { fields: [routeMetrics.routeId], references: [routes.id] })
    }));
  }
});

// server/_core/env.ts
function isDockerOrLocalDatabaseUrl(value) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return [
      "mysql",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "host.docker.internal"
    ].includes(hostname);
  } catch {
    return true;
  }
}
var hasConfiguredCookieSecret, ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    hasConfiguredCookieSecret = Boolean(process.env.JWT_SECRET);
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      hasConfiguredCookieSecret,
      usingDemoCookieSecret: false,
      databaseUrl: process.env.DATABASE_URL ?? "",
      databaseSsl: process.env.DATABASE_SSL ?? "",
      databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      authLoginProvider: process.env.AUTH_LOGIN_PROVIDER ?? "",
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      adminEmails: [process.env.ADMIN_EMAILS, process.env.OWNER_EMAIL].filter(Boolean).join(","),
      ownerEmail: process.env.OWNER_EMAIL ?? "",
      publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
      allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
      isProduction: process.env.NODE_ENV === "production",
      hasInvalidProductionDatabaseUrl: process.env.NODE_ENV === "production" && isDockerOrLocalDatabaseUrl(process.env.DATABASE_URL ?? ""),
      allowEphemeralDb: process.env.ALLOW_EPHEMERAL_DB === "true",
      requireManagedDatabase: process.env.REQUIRE_MANAGED_DATABASE === "true",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
      androidUpdateLatestVersion: process.env.ANDROID_UPDATE_LATEST_VERSION ?? "",
      androidUpdateApkUrl: process.env.ANDROID_UPDATE_APK_URL ?? "",
      androidUpdateRequired: process.env.ANDROID_UPDATE_REQUIRED === "true",
      androidMinimumSupportedVersion: process.env.ANDROID_MINIMUM_SUPPORTED_VERSION ?? "",
      androidUpdateMessage: process.env.ANDROID_UPDATE_MESSAGE ?? "",
      androidUpdatePublishedAt: process.env.ANDROID_UPDATE_PUBLISHED_AT ?? "",
      imileApiBaseUrl: process.env.IMILE_API_BASE_URL ?? "",
      imileDeliveriesPath: process.env.IMILE_DELIVERIES_PATH ?? "",
      imileCustomerId: process.env.IMILE_CUSTOMER_ID ?? "",
      imileSign: process.env.IMILE_SIGN ?? "",
      imileAuthHeader: process.env.IMILE_AUTH_HEADER ?? "",
      imileAuthToken: process.env.IMILE_AUTH_TOKEN ?? "",
      imileCountry: process.env.IMILE_COUNTRY ?? "",
      imileLang: process.env.IMILE_LANG ?? "",
      imileResourceCode: process.env.IMILE_RESOURCE_CODE ?? "",
      imileTimezone: process.env.IMILE_TIMEZONE ?? "",
      imileHubCode: process.env.IMILE_HUB_CODE ?? "",
      imileAppVersion: process.env.IMILE_APP_VERSION ?? "",
      imileSourceName: process.env.IMILE_SOURCE_NAME ?? "",
      imileFallbackBaseUrls: process.env.IMILE_FALLBACK_BASE_URLS ?? "",
      imileCaptureUploadToken: process.env.IMILE_CAPTURE_UPLOAD_TOKEN ?? "",
      osrmEnabled: process.env.VITEST === "true" ? false : process.env.OSRM_ENABLED !== "false",
      osrmBaseUrl: process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org",
      osrmRequestTimeoutMs: Number(process.env.OSRM_REQUEST_TIMEOUT_MS || 8e3),
      integrationCredentialsSecret: process.env.INTEGRATION_CREDENTIALS_SECRET ?? process.env.JWT_SECRET ?? ""
    };
  }
});

// server/db.ts
import { eq, and, desc, asc, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
function shouldPersistLocalDb() {
  return (!ENV.isProduction || ENV.allowEphemeralDb) && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true";
}
function getRedisRestConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ""),
    token
  };
}
function hasPersistentFallbackDbConfigured() {
  if (ENV.isProduction && ENV.requireManagedDatabase) return false;
  return Boolean(getRedisRestConfig());
}
function getPersistentFallbackDbHealth() {
  return {
    configured: hasPersistentFallbackDbConfigured(),
    loaded: remoteDbLoaded,
    error: lastRemoteFallbackError
  };
}
async function ensurePersistentFallbackDbLoaded() {
  if (ENV.isProduction && ENV.requireManagedDatabase) return;
  if (!hasPersistentFallbackDbConfigured()) return;
  await loadRemoteDb();
}
function hydrateMemory(data) {
  memory.users = Array.isArray(data.users) ? data.users : [];
  memory.routes = Array.isArray(data.routes) ? data.routes : [];
  memory.stops = Array.isArray(data.stops) ? data.stops : [];
  memory.routeSchedules = Array.isArray(data.routeSchedules) ? data.routeSchedules : [];
  memory.routeHistory = Array.isArray(data.routeHistory) ? data.routeHistory : [];
  memory.chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
  memory.userIntegrations = Array.isArray(data.userIntegrations) ? data.userIntegrations : [];
  memory.operationalEvents = Array.isArray(data.operationalEvents) ? data.operationalEvents : [];
  memory.routeMetrics = Array.isArray(data.routeMetrics) ? data.routeMetrics : [];
  memory.ids = {
    users: Number(data.ids?.users) || 1,
    routes: Number(data.ids?.routes) || 1,
    stops: Number(data.ids?.stops) || 1,
    routeSchedules: Number(data.ids?.routeSchedules) || 1,
    routeHistory: Number(data.ids?.routeHistory) || 1,
    chatHistory: Number(data.ids?.chatHistory) || 1,
    userIntegrations: Number(data.ids?.userIntegrations) || 1,
    operationalEvents: Number(data.ids?.operationalEvents) || 1,
    routeMetrics: Number(data.ids?.routeMetrics) || 1
  };
}
function loadLocalDb() {
  if (localDbLoaded) return;
  localDbLoaded = true;
  if (!shouldPersistLocalDb() || !fs.existsSync(LOCAL_DB_FILE)) {
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, "utf-8"));
    hydrateMemory(data);
  } catch (error) {
    console.warn("[Database] Failed to load local fallback database:", error);
  }
}
async function callRedisCommand(command) {
  const config = getRedisRestConfig();
  if (!config) return null;
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const payload = await response.json().catch(() => void 0);
  if (!response.ok) {
    throw new Error(
      payload?.error || `Redis fallback respondeu HTTP ${response.status}`
    );
  }
  return payload?.result;
}
function getLocalKvPath(key) {
  const safeName = Buffer.from(key).toString("base64url");
  return path.join(LOCAL_DB_DIR, "kv", `${safeName}.txt`);
}
async function getPersistentValue(key) {
  const redisKey = `${FALLBACK_KV_PREFIX}${key}`;
  if (hasPersistentFallbackDbConfigured()) {
    const result = await callRedisCommand(["GET", redisKey]);
    return typeof result === "string" ? result : null;
  }
  if (!shouldPersistLocalDb()) return null;
  const filePath = getLocalKvPath(redisKey);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}
async function setPersistentValue(key, value) {
  const redisKey = `${FALLBACK_KV_PREFIX}${key}`;
  if (hasPersistentFallbackDbConfigured()) {
    await callRedisCommand(["SET", redisKey, value]);
    return;
  }
  if (!shouldPersistLocalDb()) return;
  const filePath = getLocalKvPath(redisKey);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}
async function loadRemoteDb() {
  if (remoteDbLoaded) return;
  if (!hasPersistentFallbackDbConfigured()) return;
  if (!remoteDbLoadPromise) {
    remoteDbLoadPromise = (async () => {
      try {
        const result = await callRedisCommand(["GET", FALLBACK_DB_KEY]);
        if (typeof result === "string" && result.trim()) {
          hydrateMemory(JSON.parse(result));
        } else if (result && typeof result === "object") {
          hydrateMemory(result);
        }
        remoteDbLoaded = true;
        lastRemoteFallbackError = null;
      } catch (error) {
        lastRemoteFallbackError = error instanceof Error ? error.message : "Erro desconhecido ao carregar fallback persistente.";
        remoteDbLoadPromise = null;
        throw error;
      }
    })();
  }
  await remoteDbLoadPromise;
}
async function persistFallbackDb() {
  if (hasPersistentFallbackDbConfigured()) {
    try {
      await callRedisCommand(["SET", FALLBACK_DB_KEY, JSON.stringify(memory)]);
      lastRemoteFallbackError = null;
    } catch (error) {
      lastRemoteFallbackError = error instanceof Error ? error.message : "Erro desconhecido ao persistir fallback.";
      console.warn("[Database] Failed to persist remote fallback database:", error);
      throw error;
    }
  }
  if (!shouldPersistLocalDb()) return;
  try {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.warn("[Database] Failed to persist local fallback database:", error);
  }
}
async function shouldUseMemoryDb() {
  if (ENV.isProduction && ENV.requireManagedDatabase) {
    return false;
  }
  if (ENV.isProduction && !ENV.allowEphemeralDb && !hasPersistentFallbackDbConfigured()) {
    return false;
  }
  if (ENV.hasInvalidProductionDatabaseUrl && !hasPersistentFallbackDbConfigured()) {
    return false;
  }
  if (hasPersistentFallbackDbConfigured()) {
    await loadRemoteDb();
    return true;
  }
  loadLocalDb();
  return true;
}
function formatDatabaseUnavailableMessage() {
  const details = _lastDbConnectionError ? ` Detalhe: ${_lastDbConnectionError}` : "";
  return `Banco de dados indisponivel. Verifique DATABASE_URL, DATABASE_SSL e se as migrations foram executadas.${details}`;
}
function requireConfiguredDatabase() {
  throw new Error(formatDatabaseUnavailableMessage());
}
function shouldUseDatabaseSsl(databaseUrl) {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  return /ssl-mode=required|tidbcloud|aivencloud|planetscale|railway/i.test(
    databaseUrl
  );
}
function getDatabaseSslCa() {
  if (process.env.DATABASE_SSL_CA) {
    return process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n");
  }
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (caPath && fs.existsSync(caPath)) {
    return fs.readFileSync(caPath, "utf8");
  }
  return void 0;
}
function readPositiveIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
function readNonNegativeIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
function getMysqlDriverUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("ssl")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}
function getDatabasePoolOptions(databaseUrl) {
  const poolOptions = {
    uri: getMysqlDriverUrl(databaseUrl),
    waitForConnections: true,
    connectionLimit: readPositiveIntegerEnv("DB_CONNECTION_LIMIT", 5),
    queueLimit: readNonNegativeIntegerEnv("DB_QUEUE_LIMIT", 0),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };
  if (shouldUseDatabaseSsl(databaseUrl)) {
    poolOptions.ssl = {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      ca: getDatabaseSslCa()
    };
  }
  return poolOptions;
}
function createDatabasePool(databaseUrl) {
  return mysql.createPool(getDatabasePoolOptions(databaseUrl));
}
async function getDatabaseSchemaHealth() {
  if (!_pool) {
    return {
      ok: false,
      checkedColumns: REQUIRED_SCHEMA_COLUMNS.length,
      missing: REQUIRED_SCHEMA_COLUMNS.map(([table, column]) => `${table}.${column}`),
      error: "Pool MySQL indisponivel."
    };
  }
  try {
    const [rows] = await _pool.query(
      `
        SELECT TABLE_NAME as tableName, COLUMN_NAME as columnName
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (?)
      `,
      [Array.from(new Set(REQUIRED_SCHEMA_COLUMNS.map(([table]) => table)))]
    );
    const existing = new Set(
      rows.map((row) => `${String(row.tableName)}.${String(row.columnName)}`)
    );
    const missing = REQUIRED_SCHEMA_COLUMNS.map(([table, column]) => `${table}.${column}`).filter((key) => !existing.has(key));
    return {
      ok: missing.length === 0,
      checkedColumns: REQUIRED_SCHEMA_COLUMNS.length,
      missing,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      checkedColumns: REQUIRED_SCHEMA_COLUMNS.length,
      missing: REQUIRED_SCHEMA_COLUMNS.map(([table, column]) => `${table}.${column}`),
      error: error instanceof Error ? error.message : "Erro desconhecido ao validar schema."
    };
  }
}
function sortByDateDesc(items, field) {
  return [...items].sort(
    (a, b) => new Date(b[field]).getTime() - new Date(a[field]).getTime()
  );
}
function sortByDateAsc(items, field) {
  return [...items].sort(
    (a, b) => new Date(a[field]).getTime() - new Date(b[field]).getTime()
  );
}
function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}
async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;
  if (ENV.hasInvalidProductionDatabaseUrl) {
    _lastDbConnectionError = "DATABASE_URL usa host local/Docker; configure um MySQL gerenciado acessivel pela Vercel.";
    return null;
  }
  const now = Date.now();
  if (!ENV.isProduction && now - _lastDbConnectAttempt < DB_CONNECT_RETRY_MS) {
    return null;
  }
  _lastDbConnectAttempt = now;
  try {
    _pool = _pool ?? createDatabasePool(process.env.DATABASE_URL);
    await _pool.query("SELECT 1");
    _db = drizzle(_pool);
    _lastDbConnectionError = null;
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _lastDbConnectionError = error instanceof Error ? error.message : "Erro desconhecido ao conectar.";
    _db = null;
    _pool = null;
  }
  return _db;
}
async function getDatabaseHealth() {
  const configured = Boolean(process.env.DATABASE_URL);
  if (!configured) {
    return {
      configured,
      connected: false,
      ssl: shouldUseDatabaseSsl(""),
      pool: null,
      error: null
    };
  }
  const db = await getDb();
  const schema = db ? await getDatabaseSchemaHealth() : null;
  return {
    configured,
    reachable: Boolean(db),
    connected: Boolean(db) && Boolean(schema?.ok),
    ssl: shouldUseDatabaseSsl(process.env.DATABASE_URL || ""),
    pool: {
      connectionLimit: readPositiveIntegerEnv("DB_CONNECTION_LIMIT", 5),
      queueLimit: readNonNegativeIntegerEnv("DB_QUEUE_LIMIT", 0),
      lifecycle: "mysql2-native"
    },
    schema,
    error: _lastDbConnectionError
  };
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.users.find((item) => item.openId === user.openId);
      const now = /* @__PURE__ */ new Date();
      const nextUser = {
        id: existing?.id ?? memory.ids.users++,
        openId: user.openId,
        name: user.name ?? existing?.name ?? null,
        email: user.email ?? existing?.email ?? null,
        phone: user.phone ?? existing?.phone ?? null,
        companyName: user.companyName ?? existing?.companyName ?? null,
        city: user.city ?? existing?.city ?? null,
        state: user.state ?? existing?.state ?? null,
        vehicleType: user.vehicleType ?? existing?.vehicleType ?? null,
        acceptedTermsAt: user.acceptedTermsAt ?? existing?.acceptedTermsAt ?? null,
        passwordHash: user.passwordHash ?? existing?.passwordHash ?? null,
        loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
        role: user.role ?? existing?.role ?? "user",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now
      };
      if (existing) {
        Object.assign(existing, nextUser);
      } else {
        memory.users.push(nextUser);
      }
      await persistFallbackDb();
      return;
    }
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {
      openId: user.openId
    };
    const textFields = [
      "name",
      "email",
      "phone",
      "companyName",
      "city",
      "state",
      "vehicleType",
      "passwordHash",
      "loginMethod"
    ];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.acceptedTermsAt !== void 0) {
      values.acceptedTermsAt = user.acceptedTermsAt;
      updateSet.acceptedTermsAt = user.acceptedTermsAt;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.find((item) => item.openId === openId);
    }
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.find(
        (item) => typeof item.email === "string" && item.email.trim().toLowerCase() === normalizedEmail
      );
    }
    console.warn("[Database] Cannot get user by email: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserById(userId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.find((item) => item.id === userId);
    }
    console.warn("[Database] Cannot get user by id: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function cleanupE2eTestUsers() {
  const db = await getDb();
  const isE2eUser = (user) => {
    const email = user.email?.trim().toLowerCase() ?? "";
    const openId = user.openId?.trim().toLowerCase() ?? "";
    return email.startsWith("codex-e2e-") && email.endsWith("@example.com") || openId.startsWith("codex-e2e-");
  };
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const deletedUsers2 = memory.users.filter(isE2eUser);
      memory.users = memory.users.filter((user) => !isE2eUser(user));
      await persistFallbackDb();
      return {
        deletedCount: deletedUsers2.length,
        deletedUsers: deletedUsers2.map((user) => ({
          id: user.id,
          email: user.email ?? null,
          openId: user.openId ?? null
        }))
      };
    }
    requireConfiguredDatabase();
  }
  const e2eUserWhere = sql`(${users.email} LIKE 'codex-e2e-%@example.com' OR ${users.openId} LIKE 'codex-e2e-%')`;
  const deletedUsers = await db.select({
    id: users.id,
    email: users.email,
    openId: users.openId
  }).from(users).where(e2eUserWhere);
  if (deletedUsers.length > 0) {
    await db.delete(users).where(e2eUserWhere);
  }
  return {
    deletedCount: deletedUsers.length,
    deletedUsers
  };
}
async function createPasswordUser(user) {
  const now = /* @__PURE__ */ new Date();
  const values = {
    openId: user.openId,
    name: user.name,
    email: user.email.trim().toLowerCase(),
    phone: user.phone ?? null,
    companyName: user.companyName ?? null,
    city: user.city ?? null,
    state: user.state ?? null,
    vehicleType: user.vehicleType ?? null,
    acceptedTermsAt: user.acceptedTermsAt ?? null,
    passwordHash: user.passwordHash,
    loginMethod: "password",
    role: user.role ?? "user",
    lastSignedIn: now
  };
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      if (memory.users.some((item) => item.openId === user.openId)) {
        throw new Error("Usu\xE1rio j\xE1 existe");
      }
      const created = {
        id: memory.ids.users++,
        ...values,
        createdAt: now,
        updatedAt: now
      };
      memory.users.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }
  await db.insert(users).values(values);
  return getUserByOpenId(user.openId);
}
async function updateUserProfile(userId, profile) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  const values = {
    name: profile.name,
    phone: profile.phone,
    companyName: profile.companyName ?? null,
    city: profile.city,
    state: profile.state,
    vehicleType: profile.vehicleType,
    acceptedTermsAt: profile.acceptedTermsAt ?? null,
    updatedAt: now
  };
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.users.find((item) => item.id === userId);
      if (!existing) return void 0;
      Object.assign(existing, values);
      await persistFallbackDb();
      return existing;
    }
    requireConfiguredDatabase();
  }
  await db.update(users).set(values).where(eq(users.id, userId));
  return getUserById(userId);
}
async function getUserIntegration(userId, provider) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.userIntegrations.find(
        (item) => item.userId === userId && item.provider === provider && item.isActive !== false
      );
    }
    requireConfiguredDatabase();
  }
  const result = await db.select().from(userIntegrations).where(
    and(
      eq(userIntegrations.userId, userId),
      eq(userIntegrations.provider, provider),
      eq(userIntegrations.isActive, true)
    )
  ).limit(1);
  return result[0];
}
async function upsertUserIntegration(userId, provider, data) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing2 = memory.userIntegrations.find(
        (item) => item.userId === userId && item.provider === provider
      );
      const nextIntegration = {
        id: existing2?.id ?? memory.ids.userIntegrations++,
        userId,
        provider,
        ...data,
        isActive: data.isActive ?? true,
        createdAt: existing2?.createdAt ?? now,
        updatedAt: now
      };
      if (existing2) {
        Object.assign(existing2, nextIntegration);
      } else {
        memory.userIntegrations.push(nextIntegration);
      }
      await persistFallbackDb();
      return nextIntegration;
    }
    requireConfiguredDatabase();
  }
  const existing = await db.select().from(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider))).limit(1);
  const values = {
    ...data,
    userId,
    provider,
    isActive: data.isActive ?? true
  };
  if (existing[0]) {
    await db.update(userIntegrations).set(values).where(eq(userIntegrations.id, existing[0].id));
    return getUserIntegration(userId, provider);
  }
  await db.insert(userIntegrations).values(values);
  return getUserIntegration(userId, provider);
}
async function deleteUserIntegration(userId, provider) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.userIntegrations.find(
        (item) => item.userId === userId && item.provider === provider
      );
      if (existing) {
        existing.isActive = false;
        existing.updatedAt = /* @__PURE__ */ new Date();
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }
  await db.update(userIntegrations).set({ isActive: false }).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)));
}
async function createRoute(userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = /* @__PURE__ */ new Date();
      const route = {
        id: memory.ids.routes++,
        userId,
        name: data.name,
        description: data.description ?? null,
        mode: data.mode,
        totalDistance: null,
        totalTime: null,
        status: "draft",
        startLocation: data.startLocation ?? null,
        startLatitude: data.startLatitude ?? null,
        startLongitude: data.startLongitude ?? null,
        endLocation: data.endLocation ?? null,
        endLatitude: data.endLatitude ?? null,
        endLongitude: data.endLongitude ?? null,
        createdAt: now,
        updatedAt: now
      };
      memory.routes.push(route);
      await persistFallbackDb();
      return route;
    }
    requireConfiguredDatabase();
  }
  await db.insert(routes).values({
    userId,
    name: data.name,
    description: data.description ?? null,
    mode: data.mode,
    totalDistance: null,
    totalTime: null,
    startLocation: data.startLocation ?? null,
    startLatitude: data.startLatitude !== void 0 ? String(data.startLatitude) : null,
    startLongitude: data.startLongitude !== void 0 ? String(data.startLongitude) : null,
    endLocation: data.endLocation ?? null,
    endLatitude: data.endLatitude !== void 0 ? String(data.endLatitude) : null,
    endLongitude: data.endLongitude !== void 0 ? String(data.endLongitude) : null,
    status: "draft"
  });
  const result = await db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt)).limit(1);
  return result[0] || null;
}
async function getRouteById(routeId, userId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.routes.find(
        (route) => route.id === routeId && route.userId === userId
      ) ?? null;
    }
    requireConfiguredDatabase();
  }
  const result = await db.select().from(routes).where(and(eq(routes.id, routeId), eq(routes.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function getUserRoutes(userId, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routes.filter((route) => route.userId === userId),
        "createdAt"
      ).slice(offset, offset + limit);
    }
    requireConfiguredDatabase();
  }
  return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt)).limit(limit).offset(offset);
}
async function updateRoute(routeId, userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const route = memory.routes.find(
        (item) => item.id === routeId && item.userId === userId
      );
      if (route) {
        Object.assign(route, data, { updatedAt: /* @__PURE__ */ new Date() });
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }
  await db.update(routes).set(data).where(and(eq(routes.id, routeId), eq(routes.userId, userId)));
}
async function deleteRoute(routeId, userId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      memory.routes = memory.routes.filter(
        (route) => !(route.id === routeId && route.userId === userId)
      );
      memory.stops = memory.stops.filter((stop) => stop.routeId !== routeId);
      memory.routeSchedules = memory.routeSchedules.filter(
        (schedule) => schedule.routeId !== routeId
      );
      memory.routeHistory = memory.routeHistory.filter(
        (history) => history.routeId !== routeId
      );
      memory.chatHistory = memory.chatHistory.filter(
        (message) => message.routeId !== routeId
      );
      await persistFallbackDb();
      return;
    }
    requireConfiguredDatabase();
  }
  await db.delete(routes).where(and(eq(routes.id, routeId), eq(routes.userId, userId)));
}
async function createStops(routeId, stopsData) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = /* @__PURE__ */ new Date();
      const createdStops = stopsData.map((stop) => ({
        id: memory.ids.stops++,
        routeId,
        address: stop.address,
        latitude: stop.latitude !== void 0 ? String(stop.latitude) : null,
        longitude: stop.longitude !== void 0 ? String(stop.longitude) : null,
        sequence: stop.sequence,
        notes: stop.notes ?? null,
        createdAt: now
      }));
      memory.stops.push(...createdStops);
      await persistFallbackDb();
      return getRouteStops(routeId);
    }
    requireConfiguredDatabase();
  }
  const values = stopsData.map((s) => ({
    routeId,
    address: s.address,
    latitude: s.latitude !== void 0 ? String(s.latitude) : null,
    longitude: s.longitude !== void 0 ? String(s.longitude) : null,
    sequence: s.sequence,
    notes: s.notes
  }));
  await db.insert(stops).values(values);
  return getRouteStops(routeId);
}
async function getRouteStops(routeId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return [...memory.stops].filter((stop) => stop.routeId === routeId).sort((a, b) => a.sequence - b.sequence);
    }
    requireConfiguredDatabase();
  }
  return db.select().from(stops).where(eq(stops.routeId, routeId)).orderBy(asc(stops.sequence));
}
async function updateStop(routeId, stopId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const stop = memory.stops.find(
        (item) => item.id === stopId && item.routeId === routeId
      );
      if (!stop) return null;
      Object.assign(stop, {
        ...data,
        latitude: data.latitude !== void 0 ? data.latitude === null ? null : String(data.latitude) : stop.latitude,
        longitude: data.longitude !== void 0 ? data.longitude === null ? null : String(data.longitude) : stop.longitude
      });
      await persistFallbackDb();
      return stop;
    }
    requireConfiguredDatabase();
  }
  await db.update(stops).set({
    ...data,
    latitude: data.latitude !== void 0 ? data.latitude === null ? null : String(data.latitude) : void 0,
    longitude: data.longitude !== void 0 ? data.longitude === null ? null : String(data.longitude) : void 0
  }).where(and(eq(stops.id, stopId), eq(stops.routeId, routeId)));
  const [updatedStop] = await db.select().from(stops).where(and(eq(stops.id, stopId), eq(stops.routeId, routeId))).limit(1);
  return updatedStop ?? null;
}
async function deleteStop(routeId, stopId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const initialLength = memory.stops.length;
      memory.stops = memory.stops.filter(
        (stop) => !(stop.id === stopId && stop.routeId === routeId)
      );
      const deleted = memory.stops.length < initialLength;
      if (deleted) {
        await persistFallbackDb();
      }
      return deleted;
    }
    requireConfiguredDatabase();
  }
  const [existingStop] = await db.select().from(stops).where(and(eq(stops.id, stopId), eq(stops.routeId, routeId))).limit(1);
  if (!existingStop) return false;
  await db.delete(stops).where(and(eq(stops.id, stopId), eq(stops.routeId, routeId)));
  return true;
}
async function deleteRouteStops(routeId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      memory.stops = memory.stops.filter((stop) => stop.routeId !== routeId);
      await persistFallbackDb();
      return;
    }
    requireConfiguredDatabase();
  }
  await db.delete(stops).where(eq(stops.routeId, routeId));
}
async function createSchedule(userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = /* @__PURE__ */ new Date();
      const schedule = {
        id: memory.ids.routeSchedules++,
        userId,
        routeId: data.routeId,
        recurrenceType: data.recurrenceType,
        scheduledDate: data.scheduledDate,
        scheduledTime: data.scheduledTime ?? null,
        daysOfWeek: data.daysOfWeek ?? null,
        isActive: true,
        lastExecuted: null,
        nextExecution: data.nextExecution ?? null,
        heartbeatJobId: null,
        createdAt: now,
        updatedAt: now
      };
      memory.routeSchedules.push(schedule);
      await persistFallbackDb();
      return schedule;
    }
    requireConfiguredDatabase();
  }
  await db.insert(routeSchedules).values({
    userId,
    routeId: data.routeId,
    recurrenceType: data.recurrenceType,
    scheduledDate: data.scheduledDate,
    scheduledTime: data.scheduledTime,
    daysOfWeek: data.daysOfWeek,
    nextExecution: data.nextExecution,
    isActive: true
  });
  const result = await db.select().from(routeSchedules).where(eq(routeSchedules.userId, userId)).orderBy(desc(routeSchedules.createdAt)).limit(1);
  return result[0] || null;
}
async function getScheduleById(scheduleId, userId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.routeSchedules.find(
        (schedule) => schedule.id === scheduleId && schedule.userId === userId
      ) ?? null;
    }
    requireConfiguredDatabase();
  }
  const result = await db.select().from(routeSchedules).where(and(eq(routeSchedules.id, scheduleId), eq(routeSchedules.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function getUserSchedules(userId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routeSchedules.filter((schedule) => schedule.userId === userId),
        "nextExecution"
      );
    }
    requireConfiguredDatabase();
  }
  return db.select().from(routeSchedules).where(eq(routeSchedules.userId, userId)).orderBy(desc(routeSchedules.nextExecution));
}
async function updateSchedule(scheduleId, userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const schedule = memory.routeSchedules.find(
        (item) => item.id === scheduleId && item.userId === userId
      );
      if (schedule) {
        Object.assign(schedule, data, { updatedAt: /* @__PURE__ */ new Date() });
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }
  await db.update(routeSchedules).set(data).where(and(eq(routeSchedules.id, scheduleId), eq(routeSchedules.userId, userId)));
}
async function createHistory(userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = /* @__PURE__ */ new Date();
      const history = {
        id: memory.ids.routeHistory++,
        userId,
        routeId: data.routeId,
        executedDate: data.executedDate ?? now,
        actualDistance: data.actualDistance !== void 0 ? String(data.actualDistance) : null,
        actualTime: data.actualTime ?? null,
        status: data.status ?? "in_progress",
        notes: data.notes ?? null,
        exportedAt: null,
        exportFormat: null,
        storageKey: null,
        createdAt: now,
        updatedAt: now
      };
      memory.routeHistory.push(history);
      await persistFallbackDb();
      return history;
    }
    requireConfiguredDatabase();
  }
  await db.insert(routeHistory).values({
    userId,
    routeId: data.routeId,
    executedDate: data.executedDate || /* @__PURE__ */ new Date(),
    actualDistance: data.actualDistance ? String(data.actualDistance) : null,
    actualTime: data.actualTime,
    status: data.status || "in_progress",
    notes: data.notes
  });
  const result = await db.select().from(routeHistory).where(eq(routeHistory.userId, userId)).orderBy(desc(routeHistory.createdAt)).limit(1);
  return result[0] || null;
}
async function getUserRouteHistory(userId, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routeHistory.filter((history) => history.userId === userId).map((history) => {
          const route = memory.routes.find((item) => item.id === history.routeId);
          return {
            ...history,
            routeName: route?.name ?? null
          };
        }),
        "executedDate"
      ).slice(offset, offset + limit);
    }
    requireConfiguredDatabase();
  }
  return db.select({
    id: routeHistory.id,
    routeId: routeHistory.routeId,
    userId: routeHistory.userId,
    executedDate: routeHistory.executedDate,
    actualDistance: routeHistory.actualDistance,
    actualTime: routeHistory.actualTime,
    status: routeHistory.status,
    notes: routeHistory.notes,
    exportedAt: routeHistory.exportedAt,
    exportFormat: routeHistory.exportFormat,
    storageKey: routeHistory.storageKey,
    createdAt: routeHistory.createdAt,
    updatedAt: routeHistory.updatedAt,
    routeName: routes.name
  }).from(routeHistory).leftJoin(routes, eq(routeHistory.routeId, routes.id)).where(eq(routeHistory.userId, userId)).orderBy(desc(routeHistory.executedDate)).limit(limit).offset(offset);
}
async function getRouteHistory(routeId, userId) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routeHistory.filter(
          (history) => history.routeId === routeId && history.userId === userId
        ),
        "executedDate"
      );
    }
    requireConfiguredDatabase();
  }
  return db.select().from(routeHistory).where(and(eq(routeHistory.routeId, routeId), eq(routeHistory.userId, userId))).orderBy(desc(routeHistory.executedDate));
}
async function updateHistory(historyId, userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const history = memory.routeHistory.find(
        (item) => item.id === historyId && item.userId === userId
      );
      if (history) {
        Object.assign(history, data, { updatedAt: /* @__PURE__ */ new Date() });
        if (data.actualDistance !== void 0) {
          history.actualDistance = String(data.actualDistance);
        }
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }
  const updateData = {};
  if (data.actualDistance !== void 0) updateData.actualDistance = String(data.actualDistance);
  if (data.actualTime !== void 0) updateData.actualTime = data.actualTime;
  if (data.status !== void 0) updateData.status = data.status;
  if (data.notes !== void 0) updateData.notes = data.notes;
  if (data.exportedAt !== void 0) updateData.exportedAt = data.exportedAt;
  if (data.exportFormat !== void 0) updateData.exportFormat = data.exportFormat;
  if (data.storageKey !== void 0) updateData.storageKey = data.storageKey;
  await db.update(routeHistory).set(updateData).where(and(eq(routeHistory.id, historyId), eq(routeHistory.userId, userId)));
}
async function addChatMessage(userId, data) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = /* @__PURE__ */ new Date();
      const message = {
        id: memory.ids.chatHistory++,
        userId,
        routeId: data.routeId ?? null,
        role: data.role,
        content: data.content,
        createdAt: now
      };
      memory.chatHistory.push(message);
      await persistFallbackDb();
      return message;
    }
    requireConfiguredDatabase();
  }
  await db.insert(chatHistory).values({
    userId,
    routeId: data.routeId,
    role: data.role,
    content: data.content
  });
  const result = await db.select().from(chatHistory).where(eq(chatHistory.userId, userId)).orderBy(desc(chatHistory.createdAt)).limit(1);
  return result[0] || null;
}
async function getUserChatHistory(userId, routeId, limit = 100) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateAsc(
        memory.chatHistory.filter(
          (message) => message.userId === userId && (routeId === void 0 || message.routeId === routeId)
        ),
        "createdAt"
      ).slice(0, limit);
    }
    requireConfiguredDatabase();
  }
  const whereCondition = routeId ? and(eq(chatHistory.userId, userId), eq(chatHistory.routeId, routeId)) : eq(chatHistory.userId, userId);
  return db.select().from(chatHistory).where(whereCondition).orderBy(asc(chatHistory.createdAt)).limit(limit);
}
async function createOperationalEvent(data) {
  const event = {
    userId: data.userId ?? null,
    routeId: data.routeId ?? null,
    stopId: data.stopId ?? null,
    type: data.type.slice(0, 96),
    severity: data.severity ?? "info",
    source: data.source.slice(0, 128),
    title: data.title.slice(0, 255),
    message: data.message ?? null,
    runtime: data.runtime?.slice(0, 64) ?? null,
    url: data.url?.slice(0, 700) ?? null,
    userAgent: data.userAgent?.slice(0, 700) ?? null,
    appVersion: data.appVersion?.slice(0, 64) ?? null,
    metadata: data.metadata ?? null
  };
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.operationalEvents++,
        ...event,
        createdAt: /* @__PURE__ */ new Date()
      };
      memory.operationalEvents.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }
  const inserted = await db.insert(operationalEvents).values(event).$returningId();
  const insertedId = inserted[0]?.id;
  if (insertedId) {
    const result2 = await db.select().from(operationalEvents).where(eq(operationalEvents.id, insertedId)).limit(1);
    return result2[0] ?? null;
  }
  const result = await db.select().from(operationalEvents).where(
    and(
      data.userId == null ? sql`${operationalEvents.userId} IS NULL` : eq(operationalEvents.userId, data.userId),
      eq(operationalEvents.type, event.type),
      eq(operationalEvents.source, event.source),
      eq(operationalEvents.title, event.title)
    )
  ).orderBy(desc(operationalEvents.id)).limit(1);
  return result[0] ?? null;
}
async function getRecentOperationalEvents(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(memory.operationalEvents, "createdAt").slice(0, safeLimit).map((event) => ({
        ...event,
        userName: memory.users.find((user) => user.id === event.userId)?.name ?? null,
        userEmail: memory.users.find((user) => user.id === event.userId)?.email ?? null,
        routeName: memory.routes.find((route) => route.id === event.routeId)?.name ?? null
      }));
    }
    requireConfiguredDatabase();
  }
  return db.select({
    id: operationalEvents.id,
    userId: operationalEvents.userId,
    routeId: operationalEvents.routeId,
    stopId: operationalEvents.stopId,
    type: operationalEvents.type,
    severity: operationalEvents.severity,
    source: operationalEvents.source,
    title: operationalEvents.title,
    message: operationalEvents.message,
    runtime: operationalEvents.runtime,
    url: operationalEvents.url,
    userAgent: operationalEvents.userAgent,
    appVersion: operationalEvents.appVersion,
    metadata: operationalEvents.metadata,
    createdAt: operationalEvents.createdAt,
    userName: users.name,
    userEmail: users.email,
    routeName: routes.name
  }).from(operationalEvents).leftJoin(users, eq(operationalEvents.userId, users.id)).leftJoin(routes, eq(operationalEvents.routeId, routes.id)).orderBy(desc(operationalEvents.createdAt)).limit(safeLimit);
}
async function getLatestRouteOptimizationEvent(routeId, userId) {
  const optimizationTypes = [
    "route_optimized",
    "route_reoptimized",
    "route_remaining_reoptimized",
    "route_user_requested_better_sequence"
  ];
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.operationalEvents.filter(
          (event) => event.routeId === routeId && event.userId === userId && optimizationTypes.includes(event.type)
        ),
        "createdAt"
      )[0] ?? null;
    }
    requireConfiguredDatabase();
  }
  const result = await db.select().from(operationalEvents).where(
    and(
      eq(operationalEvents.routeId, routeId),
      eq(operationalEvents.userId, userId),
      sql`${operationalEvents.type} IN (${sql.join(
        optimizationTypes.map((type) => sql`${type}`),
        sql`, `
      )})`
    )
  ).orderBy(desc(operationalEvents.createdAt)).limit(1);
  return result[0] ?? null;
}
function normalizeMetricNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
function metricAverage(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}
function metricPercent(part, total) {
  return total > 0 ? part / total * 100 : 0;
}
function roundMetric(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
async function createRouteMetric(data) {
  const metric = {
    userId: data.userId ?? null,
    routeId: data.routeId ?? null,
    qualityScore: Math.round(normalizeMetricNumber(data.qualityScore)),
    optimizationRuntimeMs: Math.round(
      normalizeMetricNumber(data.optimizationRuntimeMs)
    ),
    osrmUsed: Boolean(data.osrmUsed),
    osrmFallback: Boolean(data.osrmFallback),
    clusterCount: Math.round(normalizeMetricNumber(data.clusterCount)),
    averageClusterRadius: String(
      roundMetric(normalizeMetricNumber(data.averageClusterRadius), 3)
    ),
    maxClusterRadius: String(
      roundMetric(normalizeMetricNumber(data.maxClusterRadius), 3)
    ),
    regionRevisitedCount: Math.round(
      normalizeMetricNumber(data.regionRevisitedCount)
    ),
    prematureRegionExitCount: Math.round(
      normalizeMetricNumber(data.prematureRegionExitCount)
    ),
    nearbyStopSkippedCount: Math.round(
      normalizeMetricNumber(data.nearbyStopSkippedCount)
    ),
    routeCrossingCount: Math.round(
      normalizeMetricNumber(data.routeCrossingCount)
    ),
    issuesDetectedCount: Math.round(
      normalizeMetricNumber(data.issuesDetectedCount)
    ),
    issuesCorrectedCount: Math.round(
      normalizeMetricNumber(data.issuesCorrectedCount)
    ),
    issuesBlockedCount: Math.round(
      normalizeMetricNumber(data.issuesBlockedCount)
    ),
    auditStatus: data.auditStatus,
    auditQuality: data.auditQuality,
    auditSource: data.auditSource?.slice(0, 128) ?? null,
    routeMode: data.routeMode ?? null,
    localityMode: data.localityMode ?? null,
    stopCount: Math.round(normalizeMetricNumber(data.stopCount)),
    totalDistanceKm: String(
      roundMetric(normalizeMetricNumber(data.totalDistanceKm), 2)
    ),
    totalTimeMinutes: Math.round(
      normalizeMetricNumber(data.totalTimeMinutes)
    ),
    metadata: data.metadata ?? null
  };
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.routeMetrics++,
        ...metric,
        averageClusterRadius: Number(metric.averageClusterRadius),
        maxClusterRadius: Number(metric.maxClusterRadius),
        totalDistanceKm: Number(metric.totalDistanceKm),
        createdAt: /* @__PURE__ */ new Date()
      };
      memory.routeMetrics.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }
  const inserted = await db.insert(routeMetrics).values(metric).$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;
  const result = await db.select().from(routeMetrics).where(eq(routeMetrics.id, insertedId)).limit(1);
  return result[0] ?? null;
}
function buildRouteMetricsSummary(metrics, days) {
  const total = metrics.length;
  const corrected = metrics.filter(
    (metric) => Number(metric.issuesCorrectedCount || 0) > 0
  ).length;
  const blocked = metrics.filter(
    (metric) => Number(metric.issuesBlockedCount || 0) > 0
  ).length;
  const osrmFallback = metrics.filter((metric) => Boolean(metric.osrmFallback)).length;
  const revisits = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.regionRevisitedCount || 0),
    0
  );
  const prematureExits = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.prematureRegionExitCount || 0),
    0
  );
  const nearbySkips = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.nearbyStopSkippedCount || 0),
    0
  );
  const crossings = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.routeCrossingCount || 0),
    0
  );
  const detectedIssues = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.issuesDetectedCount || 0),
    0
  );
  const correctedIssues = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.issuesCorrectedCount || 0),
    0
  );
  const blockedIssues = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.issuesBlockedCount || 0),
    0
  );
  const clusterEfficiencyBase = metrics.filter(
    (metric) => Number(metric.clusterCount || 0) > 0
  );
  const routesWithRegionalProblems = metrics.filter(
    (metric) => Number(metric.regionRevisitedCount || 0) > 0 || Number(metric.prematureRegionExitCount || 0) > 0
  ).length;
  const routeModes = ["shortest_distance", "shortest_time", "balanced"];
  const modePerformance = routeModes.map((mode) => {
    const modeMetrics = metrics.filter((metric) => metric.routeMode === mode);
    const modeTotal = modeMetrics.length;
    const modeCorrected = modeMetrics.filter(
      (metric) => Number(metric.issuesCorrectedCount || 0) > 0
    ).length;
    const modeFallback = modeMetrics.filter(
      (metric) => Boolean(metric.osrmFallback)
    ).length;
    return {
      mode,
      routeMetricCount: modeTotal,
      averageQualityScore: roundMetric(
        metricAverage(modeMetrics.map((metric) => Number(metric.qualityScore || 0)))
      ),
      averageDistanceKm: roundMetric(
        metricAverage(modeMetrics.map((metric) => Number(metric.totalDistanceKm || 0))),
        2
      ),
      averageTimeMinutes: roundMetric(
        metricAverage(modeMetrics.map((metric) => Number(metric.totalTimeMinutes || 0)))
      ),
      auditorCorrectionRate: roundMetric(metricPercent(modeCorrected, modeTotal)),
      osrmFallbackRate: roundMetric(metricPercent(modeFallback, modeTotal))
    };
  });
  return {
    periodDays: days,
    routeMetricCount: total,
    averageQualityScore: roundMetric(
      metricAverage(metrics.map((metric) => Number(metric.qualityScore || 0)))
    ),
    averageOptimizationRuntimeMs: roundMetric(
      metricAverage(
        metrics.map((metric) => Number(metric.optimizationRuntimeMs || 0))
      )
    ),
    averageOptimizationRuntimeSeconds: roundMetric(
      metricAverage(
        metrics.map((metric) => Number(metric.optimizationRuntimeMs || 0))
      ) / 1e3,
      2
    ),
    osrmUsedCount: metrics.filter((metric) => Boolean(metric.osrmUsed)).length,
    osrmFallbackCount: osrmFallback,
    osrmFallbackRate: roundMetric(metricPercent(osrmFallback, total)),
    auditorCorrectionRate: roundMetric(metricPercent(corrected, total)),
    regionalReworkIndex: roundMetric(
      metricPercent(revisits + prematureExits, total)
    ),
    regionalRevisitIndex: roundMetric(
      metricPercent(routesWithRegionalProblems, total)
    ),
    clusterEfficiencyIndex: roundMetric(
      100 - metricPercent(
        clusterEfficiencyBase.filter(
          (metric) => Number(metric.regionRevisitedCount || 0) > 0 || Number(metric.prematureRegionExitCount || 0) > 0 || Number(metric.nearbyStopSkippedCount || 0) > 0
        ).length,
        clusterEfficiencyBase.length
      )
    ),
    averageClusterCount: roundMetric(
      metricAverage(metrics.map((metric) => Number(metric.clusterCount || 0)))
    ),
    averageClusterRadiusKm: roundMetric(
      metricAverage(
        metrics.map((metric) => Number(metric.averageClusterRadius || 0))
      ),
      3
    ),
    maxClusterRadiusKm: roundMetric(
      Math.max(0, ...metrics.map((metric) => Number(metric.maxClusterRadius || 0))),
      3
    ),
    routeOutcomes: {
      correctedCount: corrected,
      correctedRate: roundMetric(metricPercent(corrected, total)),
      blockedCount: blocked,
      blockedRate: roundMetric(metricPercent(blocked, total)),
      approvedFirstPassCount: metrics.filter(
        (metric) => metric.auditStatus === "approved" && Number(metric.issuesDetectedCount || 0) === 0 && Number(metric.issuesCorrectedCount || 0) === 0 && Number(metric.issuesBlockedCount || 0) === 0
      ).length
    },
    issues: {
      regionRevisited: revisits,
      prematureRegionExit: prematureExits,
      nearbyStopSkipped: nearbySkips,
      routeCrossing: crossings,
      detected: detectedIssues,
      corrected: correctedIssues,
      blocked: blockedIssues
    },
    modePerformance
  };
}
async function getRouteMetricsDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1e3;
      const metrics2 = memory.routeMetrics.filter(
        (metric) => new Date(metric.createdAt).getTime() >= cutoff
      );
      return buildRouteMetricsSummary(metrics2, safeDays);
    }
    requireConfiguredDatabase();
  }
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1e3);
  const metrics = await db.select().from(routeMetrics).where(gte(routeMetrics.createdAt, cutoffDate)).orderBy(desc(routeMetrics.createdAt));
  return buildRouteMetricsSummary(metrics, safeDays);
}
function parseOperationalMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof metadata === "object" ? metadata : {};
}
function metadataNumber(metadata, keys) {
  for (const key of keys) {
    const value = metadata[key];
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return void 0;
}
function collectIssueTypes(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  const issueTypes = [];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const issue = item;
    if (typeof issue.type === "string") issueTypes.push(issue.type);
    if (issue.blockingIssue?.type) issueTypes.push(String(issue.blockingIssue.type));
  }
  return issueTypes;
}
function buildRouteQualityDashboard(events) {
  const routeEvents = events.filter((event) => String(event.type || "").startsWith("route_"));
  const scores = [];
  let corrections = 0;
  let revisitsAvoided = 0;
  let prematureExitsCorrected = 0;
  let routeCrossingsDetected = 0;
  let estimatedKmSaved = 0;
  for (const event of routeEvents) {
    const metadata = parseOperationalMetadata(event.metadata);
    const score = metadataNumber(metadata, ["auditScore", "finalScore", "score"]);
    if (score !== void 0) scores.push(score);
    const issueTypes = [
      ...collectIssueTypes(metadata.firstBlockingIssue),
      ...collectIssueTypes(metadata.issues),
      ...collectIssueTypes(metadata.finalIssues),
      ...collectIssueTypes(metadata.correctionAttempts)
    ];
    if (event.type === "route_audit_corrected_optimization") {
      corrections += 1;
      if (issueTypes.includes("region_revisited")) revisitsAvoided += 1;
      if (issueTypes.includes("premature_region_exit")) prematureExitsCorrected += 1;
    }
    if (issueTypes.includes("route_crossing")) routeCrossingsDetected += 1;
    const firstBlockingIssue = metadata.firstBlockingIssue;
    if (firstBlockingIssue && typeof firstBlockingIssue === "object") {
      const distanceKm = Number(firstBlockingIssue.distanceKm);
      const nearestDistanceKm = Number(firstBlockingIssue.nearestDistanceKm);
      if (Number.isFinite(distanceKm) && Number.isFinite(nearestDistanceKm) && distanceKm > nearestDistanceKm) {
        estimatedKmSaved += distanceKm - nearestDistanceKm;
      }
    }
  }
  const averageScore = scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
  return {
    averageScore: Math.round(averageScore * 10) / 10,
    scoredRoutes: scores.length,
    corrections,
    revisitsAvoided,
    prematureExitsCorrected,
    routeCrossingsDetected,
    estimatedKmSaved: Math.round(estimatedKmSaved * 10) / 10,
    estimatedMinutesSaved: Math.round(estimatedKmSaved * 2.5)
  };
}
function buildRouteQualityDashboardFromMetrics(routeMetricsSummary, eventFallback) {
  return {
    averageScore: routeMetricsSummary.averageQualityScore,
    scoredRoutes: routeMetricsSummary.routeMetricCount,
    corrections: routeMetricsSummary.routeOutcomes.correctedCount,
    revisitsAvoided: routeMetricsSummary.issues.regionRevisited,
    prematureExitsCorrected: routeMetricsSummary.issues.prematureRegionExit,
    routeCrossingsDetected: routeMetricsSummary.issues.routeCrossing,
    estimatedKmSaved: eventFallback.estimatedKmSaved,
    estimatedMinutesSaved: eventFallback.estimatedMinutesSaved,
    correctionRate: routeMetricsSummary.auditorCorrectionRate,
    osrmFallbackRate: routeMetricsSummary.osrmFallbackRate,
    regionalReworkIndex: routeMetricsSummary.regionalReworkIndex,
    optimizedRoutes: routeMetricsSummary.routeMetricCount,
    osrmFallbackRoutes: routeMetricsSummary.osrmFallbackCount
  };
}
async function getAdminOperationalDashboard() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1e3;
      const sevenDaysAgo = now - 7 * oneDay;
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const events = sortByDateDesc(memory.operationalEvents, "createdAt");
      const recentUsers2 = sortByDateDesc(memory.users, "createdAt").slice(0, 8);
      const recentRoutes2 = sortByDateDesc(memory.routes, "createdAt").slice(0, 8);
      const routeMetrics2 = buildRouteMetricsSummary(
        memory.routeMetrics.filter(
          (metric) => now - new Date(metric.createdAt).getTime() <= 30 * oneDay
        ),
        30
      );
      const routeQuality2 = buildRouteQualityDashboardFromMetrics(
        routeMetrics2,
        buildRouteQualityDashboard(events.slice(0, 200))
      );
      return {
        stats: {
          usersTotal: memory.users.length,
          usersToday: memory.users.filter((user) => new Date(user.createdAt) >= today).length,
          activeUsers7d: new Set(
            memory.operationalEvents.filter((event) => new Date(event.createdAt).getTime() >= sevenDaysAgo && event.userId).map((event) => event.userId)
          ).size,
          routesTotal: memory.routes.length,
          routesToday: memory.routes.filter((route) => new Date(route.createdAt) >= today).length,
          events24h: events.filter((event) => now - new Date(event.createdAt).getTime() <= oneDay).length,
          criticalEvents24h: events.filter(
            (event) => now - new Date(event.createdAt).getTime() <= oneDay && ["error", "fatal"].includes(event.severity)
          ).length,
          routeWarnings24h: events.filter(
            (event) => now - new Date(event.createdAt).getTime() <= oneDay && event.severity === "warning" && event.type.startsWith("route_")
          ).length
        },
        routeQuality: routeQuality2,
        routeMetrics: routeMetrics2,
        recentUsers: recentUsers2,
        recentRoutes: recentRoutes2,
        recentEvents: events.slice(0, 12)
      };
    }
    requireConfiguredDatabase();
  }
  const [usersTotal] = await db.select({ count: sql`COUNT(*)` }).from(users);
  const [usersToday] = await db.select({ count: sql`COUNT(*)` }).from(users).where(sql`DATE(${users.createdAt}) = CURRENT_DATE()`);
  const [activeUsers7d] = await db.select({ count: sql`COUNT(DISTINCT ${operationalEvents.userId})` }).from(operationalEvents).where(sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  const [routesTotal] = await db.select({ count: sql`COUNT(*)` }).from(routes);
  const [routesToday] = await db.select({ count: sql`COUNT(*)` }).from(routes).where(sql`DATE(${routes.createdAt}) = CURRENT_DATE()`);
  const [events24h] = await db.select({ count: sql`COUNT(*)` }).from(operationalEvents).where(sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`);
  const [criticalEvents24h] = await db.select({ count: sql`COUNT(*)` }).from(operationalEvents).where(
    and(
      sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
      sql`${operationalEvents.severity} IN ('error', 'fatal')`
    )
  );
  const [routeWarnings24h] = await db.select({ count: sql`COUNT(*)` }).from(operationalEvents).where(
    and(
      sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
      eq(operationalEvents.severity, "warning"),
      sql`${operationalEvents.type} LIKE 'route_%'`
    )
  );
  const recentOperationalEvents = await getRecentOperationalEvents(200);
  const routeMetricsSummary = await getRouteMetricsDashboard(30);
  const routeQuality = buildRouteQualityDashboardFromMetrics(
    routeMetricsSummary,
    buildRouteQualityDashboard(recentOperationalEvents)
  );
  const recentUsers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn
  }).from(users).orderBy(desc(users.createdAt)).limit(8);
  const recentRoutes = await db.select({
    id: routes.id,
    userId: routes.userId,
    name: routes.name,
    status: routes.status,
    totalDistance: routes.totalDistance,
    totalTime: routes.totalTime,
    createdAt: routes.createdAt,
    updatedAt: routes.updatedAt,
    userName: users.name,
    userEmail: users.email
  }).from(routes).leftJoin(users, eq(routes.userId, users.id)).orderBy(desc(routes.createdAt)).limit(8);
  return {
    stats: {
      usersTotal: Number(usersTotal?.count || 0),
      usersToday: Number(usersToday?.count || 0),
      activeUsers7d: Number(activeUsers7d?.count || 0),
      routesTotal: Number(routesTotal?.count || 0),
      routesToday: Number(routesToday?.count || 0),
      events24h: Number(events24h?.count || 0),
      criticalEvents24h: Number(criticalEvents24h?.count || 0),
      routeWarnings24h: Number(routeWarnings24h?.count || 0)
    },
    routeQuality,
    routeMetrics: routeMetricsSummary,
    recentUsers,
    recentRoutes,
    recentEvents: recentOperationalEvents.slice(0, 12)
  };
}
async function getUserStats(userId, days = 30) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoffDate2 = /* @__PURE__ */ new Date();
      cutoffDate2.setDate(cutoffDate2.getDate() - days);
      const userRoutes = memory.routes.filter(
        (route) => route.userId === userId && new Date(route.createdAt) >= cutoffDate2
      );
      const userCompletedHistory = memory.routeHistory.filter(
        (history) => history.userId === userId && history.status === "completed" && new Date(history.executedDate) >= cutoffDate2
      );
      const distances = userRoutes.map((route) => Number(route.totalDistance || 0));
      const times = userRoutes.map((route) => Number(route.totalTime || 0)).filter((time) => time > 0);
      return {
        totalRoutes: userRoutes.length,
        totalDistance: distances.reduce((sum, value) => sum + value, 0),
        avgTime: times.length > 0 ? times.reduce((sum, value) => sum + value, 0) / times.length : 0,
        completedRoutes: userCompletedHistory.length
      };
    }
    requireConfiguredDatabase();
  }
  const cutoffDate = /* @__PURE__ */ new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const totalRoutes = await db.select({ count: sql`COUNT(*)` }).from(routes).where(and(eq(routes.userId, userId), gte(routes.createdAt, cutoffDate)));
  const totalDistance = await db.select({ sum: sql`SUM(totalDistance)` }).from(routes).where(and(eq(routes.userId, userId), gte(routes.createdAt, cutoffDate)));
  const avgTime = await db.select({ avg: sql`AVG(totalTime)` }).from(routes).where(and(eq(routes.userId, userId), gte(routes.createdAt, cutoffDate)));
  const completedRoutes = await db.select({ count: sql`COUNT(*)` }).from(routeHistory).where(and(eq(routeHistory.userId, userId), eq(routeHistory.status, "completed"), gte(routeHistory.executedDate, cutoffDate)));
  return {
    totalRoutes: Number(totalRoutes[0]?.count || 0),
    totalDistance: parseFloat(String(totalDistance[0]?.sum || "0")),
    avgTime: Number(avgTime[0]?.avg || 0),
    completedRoutes: Number(completedRoutes[0]?.count || 0)
  };
}
async function getRouteStatsOverTime(userId, days = 30) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const startDate2 = /* @__PURE__ */ new Date();
      startDate2.setDate(startDate2.getDate() - days);
      const grouped = /* @__PURE__ */ new Map();
      for (const history of memory.routeHistory) {
        if (history.userId !== userId || new Date(history.executedDate) < startDate2) {
          continue;
        }
        const date = toDateKey(history.executedDate);
        const current = grouped.get(date) ?? { date, count: 0, totalDistance: 0, totalTime: 0 };
        current.count += 1;
        current.totalDistance += Number(history.actualDistance || 0);
        current.totalTime += Number(history.actualTime || 0);
        grouped.set(date, current);
      }
      return Array.from(grouped.values()).sort(
        (a, b) => a.date.localeCompare(b.date)
      );
    }
    requireConfiguredDatabase();
  }
  const startDate = /* @__PURE__ */ new Date();
  startDate.setDate(startDate.getDate() - days);
  return db.select({
    date: sql`DATE(executedDate)`,
    count: sql`COUNT(*)`,
    totalDistance: sql`SUM(actualDistance)`,
    totalTime: sql`SUM(actualTime)`
  }).from(routeHistory).where(and(
    eq(routeHistory.userId, userId),
    sql`executedDate >= ${startDate}`
  )).groupBy(sql`DATE(executedDate)`).orderBy(asc(sql`DATE(executedDate)`));
}
var _db, _pool, _lastDbConnectAttempt, _lastDbConnectionError, DB_CONNECT_RETRY_MS, LOCAL_DB_DIR, LOCAL_DB_FILE, FALLBACK_DB_KEY, FALLBACK_KV_PREFIX, localDbLoaded, remoteDbLoaded, remoteDbLoadPromise, lastRemoteFallbackError, memory, REQUIRED_SCHEMA_COLUMNS;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    _db = null;
    _pool = null;
    _lastDbConnectAttempt = 0;
    _lastDbConnectionError = null;
    DB_CONNECT_RETRY_MS = 3e4;
    LOCAL_DB_DIR = path.join(process.cwd(), ".data");
    LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, "routing-pwa-db.json");
    FALLBACK_DB_KEY = process.env.FALLBACK_DB_KEY || "econorotas:fallback-db:v1";
    FALLBACK_KV_PREFIX = process.env.FALLBACK_KV_PREFIX || "econorotas:kv:v1:";
    localDbLoaded = false;
    remoteDbLoaded = false;
    remoteDbLoadPromise = null;
    lastRemoteFallbackError = null;
    memory = {
      users: [],
      routes: [],
      stops: [],
      routeSchedules: [],
      routeHistory: [],
      chatHistory: [],
      userIntegrations: [],
      operationalEvents: [],
      routeMetrics: [],
      ids: {
        users: 1,
        routes: 1,
        stops: 1,
        routeSchedules: 1,
        routeHistory: 1,
        chatHistory: 1,
        userIntegrations: 1,
        operationalEvents: 1,
        routeMetrics: 1
      }
    };
    REQUIRED_SCHEMA_COLUMNS = [
      ["users", "id"],
      ["users", "openId"],
      ["users", "email"],
      ["users", "role"],
      ["users", "phone"],
      ["routes", "id"],
      ["routes", "userId"],
      ["stops", "routeId"],
      ["stops", "sequence"],
      ["userIntegrations", "authTokenEncrypted"],
      ["operationalEvents", "type"],
      ["operationalEvents", "severity"],
      ["route_metrics", "qualityScore"],
      ["route_metrics", "optimizationRuntimeMs"],
      ["route_metrics", "osrmUsed"],
      ["route_metrics", "issuesCorrectedCount"]
    ];
  }
});

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_env();
  }
});

// server/export.ts
var export_exports = {};
__export(export_exports, {
  exportHistoryToS3: () => exportHistoryToS3,
  generateRouteCSV: () => generateRouteCSV,
  generateRoutePDF: () => generateRoutePDF
});
import { PDFDocument, rgb } from "pdf-lib";
function escapeCsvCell(value) {
  return String(value ?? "").replace(/"/g, '""');
}
function generateRouteCSV(history) {
  const headers = [
    "ID",
    "Rota",
    "Data",
    "Status",
    "Dist\xE2ncia (km)",
    "Tempo (min)",
    "Notas"
  ];
  const rows = history.map((item) => [
    item.id,
    item.routeName || "N/A",
    new Date(item.executedDate).toLocaleDateString("pt-BR"),
    item.status,
    item.actualDistance ? parseFloat(String(item.actualDistance)).toFixed(2) : "N/A",
    item.actualTime || "N/A",
    item.notes || ""
  ]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${escapeCsvCell(cell)}"`).join(","))
  ].join("\n");
  return csvContent;
}
async function generateRoutePDF(history, userName, stats) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 40;
  let yPosition = height - margin;
  const drawText = (text2, size = 12, isBold = false) => {
    const fontSize = size;
    page.drawText(text2, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color: rgb(0, 0, 0),
      maxWidth: width - 2 * margin
    });
    yPosition -= fontSize + 4;
  };
  drawText("Relat\xF3rio de Rotas", 20, true);
  yPosition -= 10;
  drawText(`Usu\xE1rio: ${userName}`, 11);
  drawText(`Data do Relat\xF3rio: ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")}`, 11);
  yPosition -= 10;
  if (stats) {
    drawText("Estat\xEDsticas Gerais", 14, true);
    drawText(`Total de Rotas: ${stats.totalRoutes}`, 11);
    drawText(
      `Dist\xE2ncia Total: ${stats.totalDistance ? parseFloat(String(stats.totalDistance)).toFixed(2) : "0"} km`,
      11
    );
    drawText(
      `Tempo M\xE9dio: ${stats.avgTime ? parseFloat(String(stats.avgTime)).toFixed(0) : "0"} minutos`,
      11
    );
    drawText(`Rotas Conclu\xEDdas: ${stats.completedRoutes}`, 11);
    yPosition -= 10;
  }
  if (history.length > 0) {
    drawText("Hist\xF3rico de Execu\xE7\xF5es", 14, true);
    yPosition -= 5;
    const colWidths = [80, 100, 80, 80, 80, 95];
    const headers = ["ID", "Rota", "Data", "Status", "Dist\xE2ncia", "Tempo"];
    let xPos = margin;
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: xPos,
        y: yPosition,
        size: 10,
        color: rgb(0, 0, 0)
      });
      xPos += colWidths[i];
    }
    yPosition -= 15;
    for (const item of history.slice(0, 20)) {
      if (yPosition < margin + 20) {
        page.drawLine({
          start: { x: margin, y: yPosition + 5 },
          end: { x: width - margin, y: yPosition + 5 },
          thickness: 1,
          color: rgb(0.78, 0.78, 0.78)
        });
        break;
      }
      const rowData = [
        String(item.id),
        item.routeName || "N/A",
        new Date(item.executedDate).toLocaleDateString("pt-BR"),
        item.status,
        item.actualDistance ? parseFloat(String(item.actualDistance)).toFixed(2) : "N/A",
        item.actualTime ? `${item.actualTime}m` : "N/A"
      ];
      xPos = margin;
      for (let i = 0; i < rowData.length; i++) {
        page.drawText(rowData[i], {
          x: xPos,
          y: yPosition,
          size: 9,
          color: rgb(0, 0, 0)
        });
        xPos += colWidths[i];
      }
      yPosition -= 12;
    }
  }
  page.drawText("Gerado automaticamente pelo Sistema de Roteiriza\xE7\xE3o Inteligente", {
    x: margin,
    y: margin - 10,
    size: 8,
    color: rgb(0.5, 0.5, 0.5)
  });
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
async function exportHistoryToS3(userId, format, fileName, userName = "Usu\xE1rio") {
  try {
    const history = await getUserRouteHistory(userId, 1e3, 0);
    const stats = await getUserStats(userId);
    let fileContent;
    let contentType;
    if (format === "csv") {
      fileContent = generateRouteCSV(history);
      contentType = "text/csv";
    } else {
      fileContent = await generateRoutePDF(history, userName, stats);
      contentType = "application/pdf";
    }
    const storageKey = `exports/${userId}/${format}/${fileName}`;
    const result = await storagePut(storageKey, fileContent, contentType);
    return result;
  } catch (error) {
    console.error("[Export] Error:", error);
    throw new Error(`Erro ao exportar para ${format.toUpperCase()}`);
  }
}
var init_export = __esm({
  "server/export.ts"() {
    "use strict";
    init_db();
    init_storage();
  }
});

// server/_core/runtimeWarnings.ts
if (process.env.SUPPRESS_NODE_DEPRECATION_WARNINGS === "true") {
  process.noDeprecation = true;
}

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { execFile } from "node:child_process";
import fs3 from "node:fs";
import path3 from "node:path";
import { promisify as promisify2 } from "node:util";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/oauth.ts
init_db();
import { parse as parseCookieHeader2 } from "cookie";
import { createRemoteJWKSet, jwtVerify as jwtVerify2 } from "jose";
import { randomBytes } from "node:crypto";

// shared/adminAccess.ts
function normalizeEmail(value) {
  return value?.trim().toLowerCase() || "";
}
function getAdminEmailAllowlist(configuredEmails = "") {
  return Array.from(new Set(configuredEmails.split(",").map(normalizeEmail).filter(Boolean)));
}
function isAdminEmail(email, configuredEmails = "") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  return getAdminEmailAllowlist(configuredEmails).includes(normalizedEmail);
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getRequestOrigin(req) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  if (!host) return null;
  const protocol = isSecureRequest(req) ? "https" : req.protocol || "http";
  return `${protocol}://${host}`;
}
function requiresCrossSiteCookie(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (origin === "https://localhost" || origin === "capacitor://localhost" || origin === "ionic://localhost") {
    return true;
  }
  return origin !== getRequestOrigin(req);
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  const crossSiteCookie = secure && requiresCrossSiteCookie(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: crossSiteCookie ? "none" : "lax",
    secure
  };
}

// server/_core/oauth.ts
init_env();

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
init_db();
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
init_env();
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    if (!ENV.oAuthServerUrl) {
      if (!ENV.googleClientId || !ENV.googleClientSecret) {
        console.info("[OAuth] Disabled: no OAuth provider is configured.");
      }
      return;
    }
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
  }
  decodeState(state) {
    const decodeBase64Url = () => {
      const padded = state.replace(/-/g, "+").replace(/_/g, "/");
      const missingPadding = padded.length % 4;
      const normalized = missingPadding === 0 ? padded : `${padded}${"=".repeat(4 - missingPadding)}`;
      return Buffer.from(normalized, "base64").toString("utf8");
    };
    const validateUrl = (urlString) => {
      try {
        const parsed = new URL(urlString);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    };
    try {
      const parsed = JSON.parse(decodeBase64Url());
      if (typeof parsed.redirectUri !== "string" || !validateUrl(parsed.redirectUri) || typeof parsed.nonce !== "string" || parsed.nonce.length < 16) {
        throw new Error("Invalid OAuth state payload");
      }
      return {
        redirectUri: parsed.redirectUri,
        nonce: parsed.nonce,
        issuedAt: typeof parsed.issuedAt === "number" ? parsed.issuedAt : void 0
      };
    } catch {
      const legacyRedirectUri = decodeBase64Url();
      if (!validateUrl(legacyRedirectUri)) {
        throw new Error("Invalid OAuth state payload");
      }
      return {
        redirectUri: legacyRedirectUri,
        nonce: ""
      };
    }
  }
  async getTokenByCode(code, state, expectedNonce) {
    const decodedState = this.decodeState(state);
    if (!decodedState.nonce || decodedState.nonce !== expectedNonce) {
      throw new Error("Invalid OAuth state nonce");
    }
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: decodedState.redirectUri
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state, expectedNonce);
   */
  async exchangeCodeForToken(code, state, expectedNonce) {
    return this.oauthService.getTokenByCode(code, state, expectedNonce);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getBearerSessionToken(req) {
    const authorization = req.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value) return null;
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret || (!ENV.isProduction ? "local-development-secret" : "");
    if (!secret) {
      throw new Error("JWT_SECRET is required for session signing");
    }
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "econorotas",
        name: options.name || "",
        email: options.email ?? null
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      email: payload.email ?? null
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name, email } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name,
        email: typeof email === "string" && email.length > 0 ? email : null
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    if (!ENV.isProduction && req.headers["x-dev-login"] === "true") {
      const devUser = buildDevUser();
      await upsertUser({
        openId: devUser.openId,
        name: devUser.name,
        email: devUser.email,
        loginMethod: devUser.loginMethod,
        role: devUser.role,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      return await getUserByOpenId(devUser.openId) ?? devUser;
    }
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionToken = cookies.get(COOKIE_NAME) ?? this.getBearerSessionToken(req);
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (!ENV.isProduction && session.openId === "dev-user") {
      const devUser = buildDevUser();
      await upsertUser({
        openId: devUser.openId,
        name: devUser.name,
        email: devUser.email,
        loginMethod: devUser.loginMethod,
        role: devUser.role,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      return await getUserByOpenId(devUser.openId) ?? devUser;
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user && session.openId.startsWith("pwd_") && ENV.allowEphemeralDb) {
      const email = session.email?.trim().toLowerCase() || null;
      await upsertUser({
        openId: session.openId,
        name: session.name || null,
        email,
        loginMethod: "password",
        role: email && isAdminEmail(email, ENV.adminEmails) ? "admin" : "user",
        lastSignedIn: signedInAt
      });
      user = await getUserByOpenId(session.openId);
    }
    if (!user && session.openId.startsWith("google_")) {
      const email = session.email?.trim().toLowerCase() || null;
      await upsertUser({
        openId: session.openId,
        name: session.name || null,
        email,
        loginMethod: "google",
        role: email && isAdminEmail(email, ENV.adminEmails) ? "admin" : "user",
        lastSignedIn: signedInAt
      });
      user = await getUserByOpenId(session.openId);
    }
    if (!user && ENV.oAuthServerUrl) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          role: isAdminEmail(userInfo.email ?? null, ENV.adminEmails) ? "admin" : "user",
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
function buildDevUser() {
  const now = /* @__PURE__ */ new Date();
  return {
    id: 1,
    openId: "dev-user",
    name: "Usu\xE1rio Local",
    email: "dev@local.test",
    loginMethod: "local",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
var OAUTH_STATE_COOKIE_NAME = "oauth_state_nonce";
var OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1e3;
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var GOOGLE_ISSUER = "https://accounts.google.com";
var GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function getCookie(req, key) {
  const parsed = parseCookieHeader2(req.headers.cookie ?? "");
  return parsed[key];
}
function buildRequestOrigin(req) {
  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedHostRaw = req.headers["x-forwarded-host"];
  const forwardedProto = Array.isArray(forwardedProtoRaw) ? forwardedProtoRaw[0] : forwardedProtoRaw?.split(",")[0];
  const forwardedHost = Array.isArray(forwardedHostRaw) ? forwardedHostRaw[0] : forwardedHostRaw?.split(",")[0];
  const protocol = (forwardedProto || req.protocol || "https").trim();
  const host = (forwardedHost || req.get("host") || "").trim();
  if (!host) return null;
  return `${protocol}://${host}`;
}
function buildOAuthRedirectUri(req) {
  if (ENV.publicAppUrl) {
    try {
      return new URL("/api/oauth/callback", ENV.publicAppUrl).toString();
    } catch {
    }
  }
  const origin = buildRequestOrigin(req);
  if (!origin) return null;
  return `${origin}/api/oauth/callback`;
}
function getOAuthPortalUrl() {
  const raw = process.env.OAUTH_PORTAL_URL?.trim() || process.env.VITE_OAUTH_PORTAL_URL?.trim() || "";
  if (!raw) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}
function createStatePayload(redirectUri, nonce) {
  return Buffer.from(
    JSON.stringify({
      redirectUri,
      nonce,
      issuedAt: Date.now()
    })
  ).toString("base64url");
}
function decodeStatePayload(state, expectedNonce) {
  const padded = state.replace(/-/g, "+").replace(/_/g, "/");
  const missingPadding = padded.length % 4;
  const normalized = missingPadding === 0 ? padded : `${padded}${"=".repeat(4 - missingPadding)}`;
  const parsed = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  if (typeof parsed.redirectUri !== "string" || typeof parsed.nonce !== "string" || parsed.nonce !== expectedNonce || typeof parsed.issuedAt !== "number" || Date.now() - parsed.issuedAt > OAUTH_STATE_MAX_AGE_MS) {
    throw new Error("Invalid OAuth state");
  }
  return parsed.redirectUri;
}
function isGoogleOAuthConfigured() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret);
}
function getLoginProvider() {
  const configured = ENV.authLoginProvider.trim().toLowerCase();
  const googleConfigured = isGoogleOAuthConfigured();
  const legacyConfigured = Boolean(getOAuthPortalUrl() && ENV.appId);
  if (configured) {
    if (configured !== "google" && configured !== "legacy") {
      throw new Error("AUTH_LOGIN_PROVIDER deve ser google ou legacy.");
    }
    return configured;
  }
  if (googleConfigured && !legacyConfigured) return "google";
  if (!googleConfigured && legacyConfigured) return "legacy";
  if (!googleConfigured && !legacyConfigured) return null;
  throw new Error(
    "AUTH_LOGIN_PROVIDER e obrigatorio quando Google e OAuth legado estao configurados."
  );
}
function assertConfiguredProvider(provider) {
  if (provider === "google" && !isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth nao esta configurado.");
  }
  if (provider === "legacy" && (!getOAuthPortalUrl() || !ENV.appId)) {
    throw new Error("OAuth legado nao esta configurado.");
  }
}
async function exchangeGoogleCodeForUserInfo(code, state, expectedNonce) {
  const redirectUri = decodeStatePayload(state, expectedNonce);
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || typeof tokenPayload.id_token !== "string") {
    throw new Error(
      `Google token exchange failed: ${tokenPayload.error_description || tokenPayload.error || tokenResponse.statusText}`
    );
  }
  const { payload } = await jwtVerify2(tokenPayload.id_token, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUER,
    audience: ENV.googleClientId
  });
  if (payload.nonce !== expectedNonce) {
    throw new Error("Google id_token nonce mismatch");
  }
  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Google id_token is missing required claims");
  }
  return {
    openId: `google_${payload.sub}`,
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name : "Google User",
    email: payload.email,
    platform: "google",
    loginMethod: "google"
  };
}
async function exchangeLegacyCodeForUserInfo(code, state, expectedNonce) {
  const tokenResponse = await sdk.exchangeCodeForToken(code, state, expectedNonce);
  return sdk.getUserInfo(tokenResponse.accessToken);
}
async function getOAuthUserInfo(provider, code, state, expectedNonce) {
  if (provider === "google") {
    return exchangeGoogleCodeForUserInfo(code, state, expectedNonce);
  }
  return exchangeLegacyCodeForUserInfo(code, state, expectedNonce);
}
function registerOAuthRoutes(app2) {
  if (!ENV.isProduction) {
    app2.get("/api/dev/login", async (req, res) => {
      const sessionToken = await sdk.createSessionToken("dev-user", {
        name: "Usu\xE1rio Local",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS
      });
      res.redirect(302, "/");
    });
    app2.get("/api/dev/me", async (req, res) => {
      try {
        const user = await sdk.authenticateRequest(req);
        res.json({ user });
      } catch (error) {
        res.status(401).json({ error: String(error) });
      }
    });
  }
  app2.get("/api/oauth/login", (req, res) => {
    let provider;
    try {
      provider = getLoginProvider();
      if (!provider) throw new Error("OAuth login is not configured");
      assertConfiguredProvider(provider);
    } catch (error) {
      if (!ENV.isProduction && !isGoogleOAuthConfigured() && !getOAuthPortalUrl()) {
        res.redirect(302, "/api/dev/login");
        return;
      }
      res.status(503).json({
        error: error instanceof Error ? error.message : "OAuth login is not configured"
      });
      return;
    }
    const redirectUri = buildOAuthRedirectUri(req);
    if (!redirectUri) {
      res.status(500).json({ error: "Unable to resolve OAuth redirect URI" });
      return;
    }
    const nonce = randomBytes(24).toString("hex");
    const state = createStatePayload(redirectUri, nonce);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(OAUTH_STATE_COOKIE_NAME, nonce, {
      ...cookieOptions,
      maxAge: OAUTH_STATE_MAX_AGE_MS
    });
    if (provider === "google") {
      const googleUrl = new URL(GOOGLE_AUTH_URL);
      googleUrl.searchParams.set("client_id", ENV.googleClientId);
      googleUrl.searchParams.set("redirect_uri", redirectUri);
      googleUrl.searchParams.set("response_type", "code");
      googleUrl.searchParams.set("scope", "openid email profile");
      googleUrl.searchParams.set("state", state);
      googleUrl.searchParams.set("nonce", nonce);
      googleUrl.searchParams.set("prompt", "select_account");
      res.redirect(302, googleUrl.toString());
      return;
    }
    const oauthPortalUrl = getOAuthPortalUrl();
    const oauthUrl = new URL("/app-auth", oauthPortalUrl);
    oauthUrl.searchParams.set("appId", ENV.appId);
    oauthUrl.searchParams.set("redirectUri", redirectUri);
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("type", "signIn");
    res.redirect(302, oauthUrl.toString());
  });
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const expectedNonce = getCookie(req, OAUTH_STATE_COOKIE_NAME);
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
      ...cookieOptions,
      path: "/"
    });
    if (!expectedNonce) {
      res.status(400).json({ error: "Invalid OAuth state (missing nonce)" });
      return;
    }
    try {
      const provider = getLoginProvider();
      if (!provider) {
        res.status(503).json({ error: "OAuth login is not configured" });
        return;
      }
      assertConfiguredProvider(provider);
      const userInfo = await getOAuthUserInfo(provider, code, state, expectedNonce);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        role: isAdminEmail(userInfo.email ?? null, ENV.adminEmails) ? "admin" : "user",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        email: userInfo.email ?? null,
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions2 = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions2, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      if (error instanceof Error && error.message.includes("Invalid OAuth state")) {
        res.status(400).json({ error: "Invalid OAuth state" });
        return;
      }
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
init_env();
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/geocodingProxy.ts
init_db();
var NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var RATE_LIMIT_WINDOW_MS = 60 * 1e3;
var RATE_LIMIT_MAX_REQUESTS = Math.max(
  1,
  Number(process.env.GEOCODING_RATE_LIMIT_PER_MINUTE || 240)
);
var EXTERNAL_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.GEOCODING_EXTERNAL_MIN_INTERVAL_MS || 350)
);
var cache = /* @__PURE__ */ new Map();
var rateLimiter = /* @__PURE__ */ new Map();
var inFlightSearches = /* @__PURE__ */ new Map();
var lastExternalSearchAt = 0;
function getNominatimUserAgent() {
  return process.env.NOMINATIM_USER_AGENT || `routing-pwa/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "local-development"})`;
}
function getPersistentCacheKey(cacheKey) {
  return `geocoding:${Buffer.from(cacheKey).toString("base64url")}`;
}
async function waitForExternalSearchSlot() {
  if (EXTERNAL_MIN_INTERVAL_MS <= 0) return;
  const elapsed = Date.now() - lastExternalSearchAt;
  if (elapsed < EXTERNAL_MIN_INTERVAL_MS) {
    await new Promise(
      (resolve) => setTimeout(resolve, EXTERNAL_MIN_INTERVAL_MS - elapsed)
    );
  }
  lastExternalSearchAt = Date.now();
}
function setMemoryCache(cacheKey, data) {
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
async function getCached(cacheKey) {
  const cached = cache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.data;
    }
    cache.delete(cacheKey);
  }
  const persistentValue = await getPersistentValue(getPersistentCacheKey(cacheKey));
  if (!persistentValue) return void 0;
  try {
    const payload = JSON.parse(persistentValue);
    if (Number(payload.expiresAt) <= Date.now()) return void 0;
    setMemoryCache(cacheKey, payload.data);
    return payload.data;
  } catch {
    return void 0;
  }
}
async function setCached(cacheKey, data) {
  setMemoryCache(cacheKey, data);
  await setPersistentValue(
    getPersistentCacheKey(cacheKey),
    JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
  ).catch((error) => {
    console.warn("[Geocoding] Failed to persist cache:", error);
  });
}
async function fetchExternalSearch(cacheKey, url) {
  const existing = inFlightSearches.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    await waitForExternalSearchSlot();
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": getNominatimUserAgent()
      }
    });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(body.slice(0, 200));
      error.status = response.status;
      error.retryAfter = response.headers.get("retry-after") || void 0;
      throw error;
    }
    return response.json();
  })().finally(() => {
    inFlightSearches.delete(cacheKey);
  });
  inFlightSearches.set(cacheKey, request);
  return request;
}
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return candidate?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "unknown";
}
function checkRateLimit(req) {
  const key = getClientIp(req);
  const now = Date.now();
  const existing = rateLimiter.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimiter.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1e3))
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
function registerGeocodingProxy(app2) {
  app2.get("/api/geocode/search", async (req, res) => {
    const q = String(req.query.q || "").replace(/\s+/g, " ").trim();
    const limit = Math.min(Number(req.query.limit || 6) || 6, 10);
    if (q.length < 4) {
      res.json([]);
      return;
    }
    const cacheKey = `${q.toLowerCase()}|${limit}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      res.setHeader("X-EconoRotas-Geocoding-Cache", "hit");
      res.json(cached);
      return;
    }
    const rateLimit = checkRateLimit(req);
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        error: "Limite de consultas excedido. Tente novamente em alguns segundos."
      });
      return;
    }
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      limit: String(limit),
      countrycodes: "br",
      "accept-language": "pt-BR,pt,en"
    });
    try {
      const data = await fetchExternalSearch(
        cacheKey,
        `${NOMINATIM_SEARCH_URL}?${params.toString()}`
      );
      await setCached(cacheKey, data);
      res.setHeader("X-EconoRotas-Geocoding-Cache", "miss");
      res.json(data);
    } catch (error) {
      const status = error.status;
      if (status === 429) {
        res.setHeader(
          "Retry-After",
          error.retryAfter || "3"
        );
        res.status(429).json({
          error: "Servico de enderecos ocupado. Tente novamente em alguns segundos.",
          details: error instanceof Error ? error.message : void 0
        });
        return;
      }
      if (status) {
        res.status(status).json({
          error: "Nao foi possivel consultar o servico de enderecos.",
          details: error instanceof Error ? error.message : void 0
        });
        return;
      }
      res.status(502).json({
        error: error instanceof Error ? error.message : "Falha ao consultar o servico de enderecos."
      });
    }
  });
}

// server/routers.ts
init_env();

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
init_env();
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin" || !isAdminEmail(ctx.user.email, ENV.adminEmails)) {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_db();
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/passwordAuth.ts
import { randomBytes as randomBytes2, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
var scrypt = promisify(scryptCallback);
var KEY_LENGTH = 64;
var HASH_PREFIX = "scrypt";
function normalizeEmail2(email) {
  return email.trim().toLowerCase();
}
function buildPasswordOpenId(email) {
  const digest = createHash("sha256").update(normalizeEmail2(email)).digest("hex");
  return `pwd_${digest.slice(0, 60)}`;
}
async function hashPassword(password) {
  const salt = randomBytes2(16).toString("base64url");
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${HASH_PREFIX}$${salt}$${key.toString("base64url")}`;
}
async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [prefix, salt, storedKey] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !salt || !storedKey) {
    return false;
  }
  const storedBuffer = Buffer.from(storedKey, "base64url");
  const suppliedBuffer = await scrypt(password, salt, storedBuffer.length);
  if (storedBuffer.length !== suppliedBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, suppliedBuffer);
}

// server/routeObjective.ts
function chooseObjective(mode = "balanced") {
  if (mode === "shortest_distance") {
    return {
      mode,
      distanceWeight: 0.8,
      durationWeight: 0.2
    };
  }
  if (mode === "shortest_time") {
    return {
      mode,
      distanceWeight: 0.1,
      durationWeight: 0.9
    };
  }
  return {
    mode: "balanced",
    distanceWeight: 0.5,
    durationWeight: 0.5
  };
}
function calculateObjectiveCost(distanceKm, durationMin, objective) {
  return distanceKm * objective.distanceWeight + durationMin * objective.durationWeight;
}

// server/optimization.ts
function getLocalitySettings(localityMode = "local") {
  if (localityMode === "strict") {
    return {
      immediateRadiusKm: 0.25,
      immediateExtraKmThreshold: 0.03,
      localRadiusKm: 2.5,
      ratioThreshold: 1.12,
      extraKmThreshold: 0.08,
      longJumpThresholdKm: 0.35,
      penaltyMultiplier: 4,
      clusterRadiusKm: 0.45,
      clusterRevisitPenaltyKm: 8,
      prematureClusterSwitchPenalty: 18
    };
  }
  if (localityMode === "balanced") {
    return {
      immediateRadiusKm: 0.08,
      immediateExtraKmThreshold: 0.08,
      localRadiusKm: 1.5,
      ratioThreshold: 1.55,
      extraKmThreshold: 0.35,
      longJumpThresholdKm: 1.25,
      penaltyMultiplier: 2,
      clusterRadiusKm: 0.9,
      clusterRevisitPenaltyKm: 4,
      prematureClusterSwitchPenalty: 8
    };
  }
  return {
    immediateRadiusKm: 0.12,
    immediateExtraKmThreshold: 0.05,
    localRadiusKm: 2,
    ratioThreshold: 1.28,
    extraKmThreshold: 0.18,
    longJumpThresholdKm: 0.7,
    penaltyMultiplier: 3,
    clusterRadiusKm: 0.65,
    clusterRevisitPenaltyKm: 6,
    prematureClusterSwitchPenalty: 12
  };
}
function isAvoidableLocalJump(nearestDistance, plannedDistance, settings) {
  if (nearestDistance <= settings.immediateRadiusKm && plannedDistance - nearestDistance >= settings.immediateExtraKmThreshold) {
    return true;
  }
  const significantlyCloser = plannedDistance > Math.max(
    nearestDistance * settings.ratioThreshold,
    nearestDistance + settings.extraKmThreshold
  );
  const nearbyContext = nearestDistance <= settings.localRadiusKm || plannedDistance <= settings.localRadiusKm * 2.5;
  const longJump = plannedDistance - nearestDistance >= settings.longJumpThresholdKm;
  return significantlyCloser && (nearbyContext || longJump);
}
function calculateDistance(loc1, loc2) {
  const R = 6371;
  const dLat = toRad(loc2.latitude - loc1.latitude);
  const dLon = toRad(loc2.longitude - loc1.longitude);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(loc1.latitude)) * Math.cos(toRad(loc2.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad(degrees) {
  return degrees * (Math.PI / 180);
}
function estimateTravelTime(distance) {
  const avgSpeed = 50;
  return Math.round(distance / avgSpeed * 60);
}
function buildRouteLegs(locations, sequence, options = {}) {
  const legs = [];
  if (sequence.length === 0) {
    if (options.startLocation && options.endLocation) {
      legs.push({ from: options.startLocation, to: options.endLocation });
    }
    return legs;
  }
  if (options.startLocation) {
    legs.push({ from: options.startLocation, to: locations[sequence[0]] });
  }
  for (let i = 0; i < sequence.length - 1; i++) {
    legs.push({
      from: locations[sequence[i]],
      to: locations[sequence[i + 1]]
    });
  }
  if (options.endLocation) {
    legs.push({
      from: locations[sequence[sequence.length - 1]],
      to: options.endLocation
    });
  }
  return legs;
}
function calculateSequenceTotals(locations, sequence, options = {}) {
  return buildRouteLegs(locations, sequence, options).reduce(
    (totals, leg) => {
      const distance = calculateDistance(leg.from, leg.to);
      totals.distanceKm += distance;
      totals.durationMin += estimateTravelTime(distance);
      return totals;
    },
    { distanceKm: 0, durationMin: 0 }
  );
}
function calculateSequenceObjective(locations, sequence, objective, options = {}) {
  const { distanceKm, durationMin } = calculateSequenceTotals(
    locations,
    sequence,
    options
  );
  return calculateObjectiveCost(distanceKm, durationMin, objective);
}
function buildOptimizedRoute(locations, sequence, options = {}) {
  const totals = calculateSequenceTotals(locations, sequence, options);
  return {
    sequence,
    totalDistance: Math.round(totals.distanceKm * 100) / 100,
    totalTime: totals.durationMin,
    waypoints: sequence.map((idx, seq) => ({
      ...locations[idx],
      sequence: seq
    }))
  };
}
function centroidForIndexes(locations, indexes) {
  const latitude = indexes.reduce((total, index2) => total + locations[index2].latitude, 0) / indexes.length;
  const longitude = indexes.reduce((total, index2) => total + locations[index2].longitude, 0) / indexes.length;
  return { latitude, longitude };
}
function regionQuery(locations, originIndex, radiusKm) {
  return locations.map((_, index2) => index2).filter((index2) => calculateDistance(locations[originIndex], locations[index2]) <= radiusKm);
}
function dbscanLocationIndexes(locations, radiusKm, minPoints) {
  const labels = new Array(locations.length);
  const visited = new Array(locations.length).fill(false);
  let clusterId = 0;
  for (let pointIndex = 0; pointIndex < locations.length; pointIndex += 1) {
    if (visited[pointIndex]) continue;
    visited[pointIndex] = true;
    const neighbors = regionQuery(locations, pointIndex, radiusKm);
    if (neighbors.length < minPoints) {
      labels[pointIndex] = -1;
      continue;
    }
    labels[pointIndex] = clusterId;
    const seeds = [...neighbors.filter((index2) => index2 !== pointIndex)];
    while (seeds.length > 0) {
      const candidateIndex = seeds.shift();
      if (!visited[candidateIndex]) {
        visited[candidateIndex] = true;
        const candidateNeighbors = regionQuery(locations, candidateIndex, radiusKm);
        if (candidateNeighbors.length >= minPoints) {
          for (const neighborIndex of candidateNeighbors) {
            if (!seeds.includes(neighborIndex)) {
              seeds.push(neighborIndex);
            }
          }
        }
      }
      if (labels[candidateIndex] === void 0 || labels[candidateIndex] === -1) {
        labels[candidateIndex] = clusterId;
      }
    }
    clusterId += 1;
  }
  return labels.map((label, index2) => label === void 0 ? -1e3 - index2 : label);
}
function clusterStops(stops2, options = {}) {
  if (stops2.length === 0) return [];
  const settings = getLocalitySettings(options.localityMode);
  const labels = dbscanLocationIndexes(stops2, settings.clusterRadiusKm, 2);
  const grouped = /* @__PURE__ */ new Map();
  labels.forEach((label, index2) => {
    const normalizedLabel = label < 0 ? Number.MIN_SAFE_INTEGER + index2 : label;
    const group = grouped.get(normalizedLabel) ?? [];
    group.push(index2);
    grouped.set(normalizedLabel, group);
  });
  return Array.from(grouped.values()).sort((a, b) => Math.min(...a) - Math.min(...b)).map((indexes, clusterIndex) => ({
    clusterId: clusterIndex + 1,
    centroid: centroidForIndexes(stops2, indexes),
    stops: indexes.map((index2) => ({
      ...stops2[index2],
      originalIndex: index2
    }))
  }));
}
function buildNearestNeighborSequence(locations, startIndex, objective = chooseObjective("balanced"), options = {}) {
  const n = locations.length;
  const visited = new Array(n).fill(false);
  const sequence = [];
  let currentLocation = options.startLocation ?? locations[startIndex];
  if (!options.startLocation) {
    visited[startIndex] = true;
    sequence.push(startIndex);
  }
  while (sequence.length < n) {
    let nearestIndex = -1;
    let nearestMetric = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const distance = calculateDistance(currentLocation, locations[i]);
      const metric = calculateObjectiveCost(
        distance,
        estimateTravelTime(distance),
        objective
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = i;
      }
    }
    if (nearestIndex === -1) break;
    visited[nearestIndex] = true;
    sequence.push(nearestIndex);
    currentLocation = locations[nearestIndex];
  }
  return sequence;
}
function improveSequenceWithTwoOpt(locations, initialSequence, objective = chooseObjective("balanced"), options = {}) {
  let sequence = [...initialSequence];
  let bestMetric = calculateSequenceObjective(locations, sequence, objective, options);
  let improved = true;
  let passes = 0;
  const firstMutableIndex = options.startLocation ? 1 : 0;
  while (improved && passes < 8) {
    improved = false;
    passes += 1;
    for (let i = firstMutableIndex; i < sequence.length - 1; i++) {
      for (let k = i + 1; k < sequence.length; k++) {
        const candidate = [
          ...sequence.slice(0, i),
          ...sequence.slice(i, k + 1).reverse(),
          ...sequence.slice(k + 1)
        ];
        const candidateMetric = calculateSequenceObjective(
          locations,
          candidate,
          objective,
          options
        );
        if (candidateMetric + 1e-6 < bestMetric) {
          sequence = candidate;
          bestMetric = candidateMetric;
          improved = true;
        }
      }
    }
  }
  return sequence;
}
function buildNearestSequenceForIndexes(locations, indexes, objective = chooseObjective("balanced"), startLocation) {
  const remaining = new Set(indexes);
  const sequence = [];
  let currentLocation = startLocation ?? locations[indexes[0]];
  if (!startLocation && indexes.length > 0) {
    remaining.delete(indexes[0]);
    sequence.push(indexes[0]);
  }
  while (remaining.size > 0) {
    let nearestIndex = -1;
    let nearestMetric = Infinity;
    for (const candidateIndex of Array.from(remaining)) {
      const distance = calculateDistance(currentLocation, locations[candidateIndex]);
      const metric = calculateObjectiveCost(
        distance,
        estimateTravelTime(distance),
        objective
      );
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }
    if (nearestIndex === -1) break;
    remaining.delete(nearestIndex);
    sequence.push(nearestIndex);
    currentLocation = locations[nearestIndex];
  }
  return sequence;
}
function optimizeClusterStops(locations, clusterIndexes, objective = chooseObjective("balanced"), startLocation) {
  if (clusterIndexes.length <= 2) {
    return buildNearestSequenceForIndexes(
      locations,
      clusterIndexes,
      objective,
      startLocation
    );
  }
  const nearest = buildNearestSequenceForIndexes(
    locations,
    clusterIndexes,
    objective,
    startLocation
  );
  const improved = improveSequenceWithTwoOpt(locations, nearest, objective);
  return improved.filter((index2) => clusterIndexes.includes(index2));
}
function buildClusteredSequence(locations, objective = chooseObjective("balanced"), options = {}) {
  const clusters = clusterStops(locations, options);
  if (clusters.length <= 1) return null;
  const remainingClusters = new Set(clusters.map((cluster) => cluster.clusterId));
  const sequence = [];
  let currentLocation = options.startLocation ?? clusters[0].centroid;
  while (remainingClusters.size > 0) {
    let nearestCluster;
    let nearestDistance = Infinity;
    for (const cluster of clusters) {
      if (!remainingClusters.has(cluster.clusterId)) continue;
      const distance = calculateDistance(currentLocation, cluster.centroid);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCluster = cluster;
      }
    }
    if (!nearestCluster) break;
    const clusterIndexes = nearestCluster.stops.map((stop) => stop.originalIndex);
    const clusterSequence = optimizeClusterStops(
      locations,
      clusterIndexes,
      objective,
      currentLocation
    );
    sequence.push(...clusterSequence);
    remainingClusters.delete(nearestCluster.clusterId);
    currentLocation = locations[clusterSequence[clusterSequence.length - 1]] ?? nearestCluster.centroid;
  }
  return sequence.length === locations.length ? sequence : null;
}
function enforceLocalNearestSequence(locations, initialSequence, options = {}) {
  const remaining = new Set(initialSequence);
  const sequence = [];
  let currentLocation = options.startLocation ?? locations[initialSequence[0]];
  const localitySettings = getLocalitySettings(options.localityMode);
  while (remaining.size > 0) {
    const plannedNext = initialSequence.find((index2) => remaining.has(index2));
    if (plannedNext === void 0) break;
    let nearestIndex = plannedNext;
    let nearestDistance = calculateDistance(currentLocation, locations[plannedNext]);
    for (const candidateIndex of Array.from(remaining)) {
      const distance = calculateDistance(currentLocation, locations[candidateIndex]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = candidateIndex;
      }
    }
    const plannedDistance = calculateDistance(currentLocation, locations[plannedNext]);
    const jumpIsOperationallyBad = nearestIndex !== plannedNext && isAvoidableLocalJump(nearestDistance, plannedDistance, localitySettings);
    const nextIndex = jumpIsOperationallyBad ? nearestIndex : plannedNext;
    remaining.delete(nextIndex);
    sequence.push(nextIndex);
    currentLocation = locations[nextIndex];
  }
  return sequence;
}
function calculateAvoidableJumpPenalty(locations, sequence, options = {}) {
  const settings = getLocalitySettings(options.localityMode);
  const remaining = new Set(sequence);
  let currentLocation = options.startLocation ?? locations[sequence[0]];
  let penalty = 0;
  for (const plannedNext of sequence) {
    remaining.delete(plannedNext);
    const plannedDistance = calculateDistance(currentLocation, locations[plannedNext]);
    let nearestDistance = plannedDistance;
    for (const candidateIndex of [plannedNext, ...Array.from(remaining)]) {
      const distance = calculateDistance(currentLocation, locations[candidateIndex]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }
    if (isAvoidableLocalJump(nearestDistance, plannedDistance, settings)) {
      penalty += (plannedDistance - nearestDistance) * settings.penaltyMultiplier;
    }
    currentLocation = locations[plannedNext];
  }
  return penalty;
}
function calculateClusterRevisitPenalty(locations, sequence, options = {}) {
  const settings = getLocalitySettings(options.localityMode);
  const clusters = clusterStops(locations, options);
  if (clusters.length <= 1) return 0;
  const clusterByStopIndex = /* @__PURE__ */ new Map();
  for (const cluster of clusters) {
    if (cluster.stops.length < 2) continue;
    for (const stop of cluster.stops) {
      clusterByStopIndex.set(stop.originalIndex, cluster.clusterId);
    }
  }
  const closedClusters = /* @__PURE__ */ new Set();
  let activeCluster;
  let penalty = 0;
  for (let sequenceIndex = 0; sequenceIndex < sequence.length; sequenceIndex += 1) {
    const stopIndex = sequence[sequenceIndex];
    const clusterId = clusterByStopIndex.get(stopIndex);
    if (!clusterId) {
      activeCluster = void 0;
      continue;
    }
    if (activeCluster !== void 0 && activeCluster !== clusterId) {
      const pendingInPreviousCluster = sequence.slice(sequenceIndex + 1).filter((laterStopIndex) => clusterByStopIndex.get(laterStopIndex) === activeCluster);
      if (pendingInPreviousCluster.length > 0) {
        const switchDistance = calculateDistance(
          locations[sequence[sequenceIndex - 1]],
          locations[stopIndex]
        );
        const averagePendingDistance = pendingInPreviousCluster.reduce(
          (total, laterStopIndex) => total + calculateDistance(locations[sequence[sequenceIndex - 1]], locations[laterStopIndex]),
          0
        ) / pendingInPreviousCluster.length;
        penalty += settings.prematureClusterSwitchPenalty * pendingInPreviousCluster.length + switchDistance * settings.penaltyMultiplier + averagePendingDistance * settings.penaltyMultiplier;
      }
      closedClusters.add(activeCluster);
    }
    if (closedClusters.has(clusterId) && activeCluster !== clusterId) {
      penalty += settings.clusterRevisitPenaltyKm;
    }
    activeCluster = clusterId;
  }
  return penalty;
}
function calculateDriverFriendlyScore(locations, sequence, objective = chooseObjective("balanced"), options = {}) {
  return calculateSequenceObjective(locations, sequence, objective, options) + calculateAvoidableJumpPenalty(locations, sequence, options) + calculateClusterRevisitPenalty(locations, sequence, options);
}
function optimizeOpenRoute(locations, mode = "balanced", startIndex = 0, options = {}) {
  if (locations.length === 0) {
    return buildOptimizedRoute(locations, [], options);
  }
  const startIndexes = options.startLocation ? [0] : locations.length > 40 ? [startIndex] : locations.map((_, index2) => index2);
  const uniqueStartIndexes = Array.from(/* @__PURE__ */ new Set([startIndex, ...startIndexes])).filter((index2) => index2 >= 0 && index2 < locations.length);
  let bestSequence = null;
  let bestScore = Infinity;
  const objective = chooseObjective(mode);
  for (const candidateStartIndex of uniqueStartIndexes) {
    const nearestSequence = buildNearestNeighborSequence(
      locations,
      candidateStartIndex,
      objective,
      options
    );
    const inputSequence = locations.map((_, index2) => index2);
    const clusteredSequence = buildClusteredSequence(locations, objective, options);
    const seedSequences = [
      nearestSequence,
      ...clusteredSequence ? [clusteredSequence] : [],
      inputSequence,
      [...inputSequence].reverse()
    ];
    for (const seedSequence of seedSequences) {
      const improvedSequence = improveSequenceWithTwoOpt(
        locations,
        seedSequence,
        objective,
        options
      );
      const candidateSequences = [
        seedSequence,
        improvedSequence,
        enforceLocalNearestSequence(locations, improvedSequence, options)
      ];
      for (const candidateSequence of candidateSequences) {
        const score = calculateDriverFriendlyScore(
          locations,
          candidateSequence,
          objective,
          options
        );
        if (score < bestScore) {
          bestScore = score;
          bestSequence = candidateSequence;
        }
      }
    }
  }
  return buildOptimizedRoute(locations, bestSequence ?? [], options);
}
function optimizeRoute(locations, mode = "balanced", startIndex = 0, options = {}) {
  return optimizeOpenRoute(locations, mode, startIndex, options);
}
function validateLocations(locations) {
  if (!locations || locations.length === 0) {
    return { valid: false, error: "No locations provided" };
  }
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") {
      return { valid: false, error: `Invalid coordinates at location ${i}` };
    }
    if (loc.latitude < -90 || loc.latitude > 90) {
      return { valid: false, error: `Invalid latitude at location ${i}` };
    }
    if (loc.longitude < -180 || loc.longitude > 180) {
      return { valid: false, error: `Invalid longitude at location ${i}` };
    }
  }
  return { valid: true };
}

// server/osrm.ts
init_env();
function getLocalitySettings2(localityMode = "local") {
  if (localityMode === "strict") {
    return {
      immediateRadius: 0.25,
      immediateExtraThreshold: 0.03,
      localRadius: 2.5,
      ratioThreshold: 1.12,
      extraThreshold: 0.08,
      longJumpThreshold: 0.35,
      penaltyMultiplier: 4,
      prematureClusterSwitchPenalty: 30
    };
  }
  if (localityMode === "balanced") {
    return {
      immediateRadius: 0.08,
      immediateExtraThreshold: 0.08,
      localRadius: 1.5,
      ratioThreshold: 1.55,
      extraThreshold: 0.35,
      longJumpThreshold: 1.25,
      penaltyMultiplier: 2,
      prematureClusterSwitchPenalty: 15
    };
  }
  return {
    immediateRadius: 0.12,
    immediateExtraThreshold: 0.05,
    localRadius: 2,
    ratioThreshold: 1.28,
    extraThreshold: 0.18,
    longJumpThreshold: 0.7,
    penaltyMultiplier: 3,
    prematureClusterSwitchPenalty: 20
  };
}
function isAvoidableLocalJump2(nearestMetric, plannedMetric, settings) {
  if (nearestMetric <= settings.immediateRadius && plannedMetric - nearestMetric >= settings.immediateExtraThreshold) {
    return true;
  }
  const significantlyCloser = plannedMetric > Math.max(
    nearestMetric * settings.ratioThreshold,
    nearestMetric + settings.extraThreshold
  );
  const nearbyContext = nearestMetric <= settings.localRadius || plannedMetric <= settings.localRadius * 2.5;
  const longJump = plannedMetric - nearestMetric >= settings.longJumpThreshold;
  return significantlyCloser && (nearbyContext || longJump);
}
function isValidCoordinate(location) {
  return Number.isFinite(location.latitude) && Number.isFinite(location.longitude) && location.latitude >= -90 && location.latitude <= 90 && location.longitude >= -180 && location.longitude <= 180;
}
function buildNodes(locations, options = {}) {
  const nodes = locations.map((location, deliveryIndex) => ({
    location,
    deliveryIndex,
    role: "delivery"
  }));
  const startNodeIndex = options.startLocation && isValidCoordinate(options.startLocation) ? nodes.push({ location: options.startLocation, role: "start" }) - 1 : void 0;
  const endNodeIndex = options.endLocation && isValidCoordinate(options.endLocation) ? nodes.push({ location: options.endLocation, role: "end" }) - 1 : void 0;
  return { nodes, startNodeIndex, endNodeIndex };
}
function buildOsrmTableUrl(nodes) {
  const baseUrl = ENV.osrmBaseUrl.replace(/\/+$/, "");
  const coordinates = nodes.map(({ location }) => `${location.longitude},${location.latitude}`).join(";");
  return `${baseUrl}/table/v1/driving/${coordinates}?annotations=duration,distance`;
}
function normalizeMatrix(values, factor) {
  if (!values?.length) return null;
  const normalized = values.map(
    (row) => row.map(
      (value) => typeof value === "number" && Number.isFinite(value) ? value / factor : Infinity
    )
  );
  return normalized.some((row) => row.some((value) => !Number.isFinite(value))) ? null : normalized;
}
async function fetchRoadMatrix(locations, options = {}) {
  if (!ENV.osrmEnabled || locations.length === 0) return null;
  const { nodes, startNodeIndex, endNodeIndex } = buildNodes(locations, options);
  if (nodes.length < 2 || nodes.some((node) => !isValidCoordinate(node.location))) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENV.osrmRequestTimeoutMs);
  try {
    const response = await fetch(buildOsrmTableUrl(nodes), {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== "Ok") return null;
    const distancesKm = normalizeMatrix(data.distances, 1e3);
    const durationsMinutes = normalizeMatrix(data.durations, 60);
    if (!distancesKm || !durationsMinutes) return null;
    return {
      matrix: { nodes, distancesKm, durationsMinutes },
      startNodeIndex,
      endNodeIndex
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
function getMetric(matrix, mode, from, to) {
  return mode === "duration" ? matrix.durationsMinutes[from][to] : matrix.distancesKm[from][to];
}
function getObjectiveMetric(matrix, objective, from, to) {
  return calculateObjectiveCost(
    matrix.distancesKm[from][to],
    matrix.durationsMinutes[from][to],
    objective
  );
}
function calculateSequenceMetric(matrix, sequence, mode, startNodeIndex, endNodeIndex) {
  let total = 0;
  if (sequence.length === 0) {
    return startNodeIndex !== void 0 && endNodeIndex !== void 0 ? getMetric(matrix, mode, startNodeIndex, endNodeIndex) : 0;
  }
  if (startNodeIndex !== void 0) {
    total += getMetric(matrix, mode, startNodeIndex, sequence[0]);
  }
  for (let index2 = 0; index2 < sequence.length - 1; index2 += 1) {
    total += getMetric(matrix, mode, sequence[index2], sequence[index2 + 1]);
  }
  if (endNodeIndex !== void 0) {
    total += getMetric(matrix, mode, sequence[sequence.length - 1], endNodeIndex);
  }
  return total;
}
function calculateSequenceObjective2(matrix, sequence, objective, startNodeIndex, endNodeIndex) {
  const distanceKm = calculateSequenceMetric(
    matrix,
    sequence,
    "distance",
    startNodeIndex,
    endNodeIndex
  );
  const durationMin = calculateSequenceMetric(
    matrix,
    sequence,
    "duration",
    startNodeIndex,
    endNodeIndex
  );
  return calculateObjectiveCost(distanceKm, durationMin, objective);
}
function buildRoadRoute(matrix, sequence, startNodeIndex, endNodeIndex) {
  return {
    sequence: sequence.map((nodeIndex) => matrix.nodes[nodeIndex].deliveryIndex ?? nodeIndex),
    totalDistance: Math.round(
      calculateSequenceMetric(matrix, sequence, "distance", startNodeIndex, endNodeIndex) * 100
    ) / 100,
    totalTime: Math.round(
      calculateSequenceMetric(matrix, sequence, "duration", startNodeIndex, endNodeIndex)
    ),
    waypoints: sequence.map((nodeIndex, sequenceIndex) => ({
      ...matrix.nodes[nodeIndex].location,
      sequence: sequenceIndex
    }))
  };
}
function buildNearestSequence(matrix, deliveryNodeIndexes, startIndex, objective, startNodeIndex) {
  const available = new Set(deliveryNodeIndexes);
  const sequence = [];
  let currentNodeIndex = startNodeIndex ?? deliveryNodeIndexes[startIndex] ?? deliveryNodeIndexes[0];
  if (startNodeIndex === void 0) {
    available.delete(currentNodeIndex);
    sequence.push(currentNodeIndex);
  }
  while (available.size > 0) {
    let nearestIndex = -1;
    let nearestMetric = Infinity;
    for (const candidateIndex of Array.from(available)) {
      const metric = getObjectiveMetric(matrix, objective, currentNodeIndex, candidateIndex);
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }
    if (nearestIndex === -1) break;
    available.delete(nearestIndex);
    sequence.push(nearestIndex);
    currentNodeIndex = nearestIndex;
  }
  return sequence;
}
function improveSequenceWithTwoOpt2(matrix, initialSequence, objective, startNodeIndex, endNodeIndex) {
  let sequence = [...initialSequence];
  let bestMetric = calculateSequenceObjective2(
    matrix,
    sequence,
    objective,
    startNodeIndex,
    endNodeIndex
  );
  let improved = true;
  let passes = 0;
  const firstMutableIndex = startNodeIndex !== void 0 ? 1 : 0;
  while (improved && passes < 8) {
    improved = false;
    passes += 1;
    for (let i = firstMutableIndex; i < sequence.length - 1; i += 1) {
      for (let k = i + 1; k < sequence.length; k += 1) {
        const candidate = [
          ...sequence.slice(0, i),
          ...sequence.slice(i, k + 1).reverse(),
          ...sequence.slice(k + 1)
        ];
        const candidateMetric = calculateSequenceObjective2(
          matrix,
          candidate,
          objective,
          startNodeIndex,
          endNodeIndex
        );
        if (candidateMetric + 1e-6 < bestMetric) {
          sequence = candidate;
          bestMetric = candidateMetric;
          improved = true;
        }
      }
    }
  }
  return sequence;
}
function enforceLocalNearestRoadSequence(matrix, initialSequence, objective, startNodeIndex, localityMode = "local") {
  const remaining = new Set(initialSequence);
  const sequence = [];
  let currentNodeIndex = startNodeIndex ?? initialSequence[0];
  const localitySettings = getLocalitySettings2(localityMode);
  while (remaining.size > 0) {
    const plannedNext = initialSequence.find((nodeIndex) => remaining.has(nodeIndex));
    if (plannedNext === void 0) break;
    let nearestIndex = plannedNext;
    let nearestMetric = getObjectiveMetric(matrix, objective, currentNodeIndex, plannedNext);
    for (const candidateIndex of Array.from(remaining)) {
      const metric = getObjectiveMetric(matrix, objective, currentNodeIndex, candidateIndex);
      if (metric < nearestMetric) {
        nearestMetric = metric;
        nearestIndex = candidateIndex;
      }
    }
    const plannedMetric = getObjectiveMetric(matrix, objective, currentNodeIndex, plannedNext);
    const jumpIsOperationallyBad = nearestIndex !== plannedNext && isAvoidableLocalJump2(nearestMetric, plannedMetric, localitySettings);
    const nextIndex = jumpIsOperationallyBad ? nearestIndex : plannedNext;
    remaining.delete(nextIndex);
    sequence.push(nextIndex);
    currentNodeIndex = nextIndex;
  }
  return sequence;
}
function calculateAvoidableJumpPenalty2(matrix, sequence, objective, startNodeIndex, localityMode = "local") {
  const settings = getLocalitySettings2(localityMode);
  const remaining = new Set(sequence);
  let currentNodeIndex = startNodeIndex ?? sequence[0];
  let penalty = 0;
  for (const plannedNext of sequence) {
    remaining.delete(plannedNext);
    const plannedMetric = getObjectiveMetric(matrix, objective, currentNodeIndex, plannedNext);
    let nearestMetric = plannedMetric;
    for (const candidateIndex of [plannedNext, ...Array.from(remaining)]) {
      const metric = getObjectiveMetric(matrix, objective, currentNodeIndex, candidateIndex);
      if (metric < nearestMetric) {
        nearestMetric = metric;
      }
    }
    if (isAvoidableLocalJump2(nearestMetric, plannedMetric, settings)) {
      penalty += (plannedMetric - nearestMetric) * settings.penaltyMultiplier;
    }
    currentNodeIndex = plannedNext;
  }
  return penalty;
}
function buildClusteredDeliveryNodeSequence(locations, deliveryNodeIndexes, options = {}) {
  const clusters = clusterStops(locations, options);
  if (clusters.length <= 1) return null;
  const nodeByDeliveryIndex = /* @__PURE__ */ new Map();
  deliveryNodeIndexes.forEach((nodeIndex, deliveryIndex) => {
    nodeByDeliveryIndex.set(deliveryIndex, nodeIndex);
  });
  const sequence = clusters.flatMap(
    (cluster) => cluster.stops.map((stop) => nodeByDeliveryIndex.get(stop.originalIndex)).filter((nodeIndex) => nodeIndex !== void 0)
  );
  return sequence.length === deliveryNodeIndexes.length ? sequence : null;
}
function calculateClusterSwitchPenalty(matrix, locations, sequence, localityMode = "local") {
  const settings = getLocalitySettings2(localityMode);
  const clusters = clusterStops(locations, { localityMode });
  if (clusters.length <= 1) return 0;
  const clusterByDeliveryIndex = /* @__PURE__ */ new Map();
  for (const cluster of clusters) {
    if (cluster.stops.length < 2) continue;
    for (const stop of cluster.stops) {
      clusterByDeliveryIndex.set(stop.originalIndex, cluster.clusterId);
    }
  }
  const clusterByNodeIndex = /* @__PURE__ */ new Map();
  matrix.nodes.forEach((node, nodeIndex) => {
    if (node.deliveryIndex === void 0) return;
    const clusterId = clusterByDeliveryIndex.get(node.deliveryIndex);
    if (clusterId) clusterByNodeIndex.set(nodeIndex, clusterId);
  });
  let penalty = 0;
  for (let sequenceIndex = 1; sequenceIndex < sequence.length; sequenceIndex += 1) {
    const previousCluster = clusterByNodeIndex.get(sequence[sequenceIndex - 1]);
    const currentCluster = clusterByNodeIndex.get(sequence[sequenceIndex]);
    if (!previousCluster || !currentCluster || previousCluster === currentCluster) {
      continue;
    }
    const pendingInPreviousCluster = sequence.slice(sequenceIndex + 1).filter((nodeIndex) => clusterByNodeIndex.get(nodeIndex) === previousCluster);
    if (pendingInPreviousCluster.length > 0) {
      const fromNode = sequence[sequenceIndex - 1];
      const toNode = sequence[sequenceIndex];
      const switchDuration = matrix.durationsMinutes[fromNode]?.[toNode] ?? 0;
      const averagePendingDuration = pendingInPreviousCluster.reduce(
        (total, pendingNode) => total + (matrix.durationsMinutes[fromNode]?.[pendingNode] ?? 0),
        0
      ) / pendingInPreviousCluster.length;
      penalty += settings.prematureClusterSwitchPenalty * pendingInPreviousCluster.length + switchDuration * settings.penaltyMultiplier + averagePendingDuration * settings.penaltyMultiplier;
    }
  }
  return penalty;
}
async function buildSequentialRouteWithRoadMetrics(locations, options = {}) {
  const result = await fetchRoadMatrix(locations, options);
  if (!result) return null;
  const deliveryNodeIndexes = result.matrix.nodes.map((node, nodeIndex) => node.role === "delivery" ? nodeIndex : -1).filter((nodeIndex) => nodeIndex >= 0);
  return buildRoadRoute(
    result.matrix,
    deliveryNodeIndexes,
    result.startNodeIndex,
    result.endNodeIndex
  );
}
async function optimizeRouteWithRoadMetrics(locations, mode = "balanced", startIndex = 0, options = {}) {
  const result = await fetchRoadMatrix(locations, options);
  if (!result) return null;
  const deliveryNodeIndexes = result.matrix.nodes.map((node, nodeIndex) => node.role === "delivery" ? nodeIndex : -1).filter((nodeIndex) => nodeIndex >= 0);
  const objective = chooseObjective(mode);
  const clusteredSequence = buildClusteredDeliveryNodeSequence(
    locations,
    deliveryNodeIndexes,
    options
  );
  const startCandidates = result.startNodeIndex !== void 0 || deliveryNodeIndexes.length > 40 ? [Math.min(Math.max(startIndex, 0), Math.max(deliveryNodeIndexes.length - 1, 0))] : deliveryNodeIndexes.map((_, index2) => index2);
  let bestSequence = null;
  let bestScore = Infinity;
  for (const candidateStartIndex of startCandidates) {
    const nearestSequence = buildNearestSequence(
      result.matrix,
      deliveryNodeIndexes,
      candidateStartIndex,
      objective,
      result.startNodeIndex
    );
    const seedSequences = [
      nearestSequence,
      ...clusteredSequence ? [clusteredSequence] : [],
      deliveryNodeIndexes,
      [...deliveryNodeIndexes].reverse()
    ];
    for (const seedSequence of seedSequences) {
      const improved = improveSequenceWithTwoOpt2(
        result.matrix,
        seedSequence,
        objective,
        result.startNodeIndex,
        result.endNodeIndex
      );
      const candidateSequences = [
        seedSequence,
        improved,
        enforceLocalNearestRoadSequence(
          result.matrix,
          improved,
          objective,
          result.startNodeIndex,
          options.localityMode
        )
      ];
      for (const candidateSequence of candidateSequences) {
        const metric = calculateSequenceObjective2(
          result.matrix,
          candidateSequence,
          objective,
          result.startNodeIndex,
          result.endNodeIndex
        );
        const penalty = calculateAvoidableJumpPenalty2(
          result.matrix,
          candidateSequence,
          objective,
          result.startNodeIndex,
          options.localityMode
        ) + calculateClusterSwitchPenalty(
          result.matrix,
          locations,
          candidateSequence,
          options.localityMode
        );
        const score = metric + penalty;
        if (score < bestScore) {
          bestScore = score;
          bestSequence = candidateSequence;
        }
      }
    }
  }
  return buildRoadRoute(
    result.matrix,
    bestSequence ?? deliveryNodeIndexes,
    result.startNodeIndex,
    result.endNodeIndex
  );
}

// server/routeAudit.ts
var IMMEDIATE_NEARBY_KM = 0.12;
var IMMEDIATE_GAP_KM = 0.05;
var LOCAL_NEARBY_KM = 1.5;
var LOCAL_GAP_KM = 0.75;
var REVISIT_RADIUS_KM = 0.25;
var REVISIT_AFTER_JUMP_KM = 1.2;
var FIRST_STOP_FAR_KM = 2;
var ROAD_DETOUR_RATIO = 1.8;
var LONG_JUMP_KM = 2.5;
var COORDINATE_PRECISION = 5;
var BRAZIL_LATITUDE_MIN = -34;
var BRAZIL_LATITUDE_MAX = 6;
var BRAZIL_LONGITUDE_MIN = -74;
var BRAZIL_LONGITUDE_MAX = -28;
var CLUSTER_SPREAD_ATTENTION_KM = 2.5;
var CLUSTER_SPREAD_HIGH_KM = 5;
var ROUTE_QUALITY_PENALTIES = {
  region_revisited: 20,
  premature_region_exit: 25,
  cluster_spread_high: 10,
  nearby_stop_skipped: 15,
  route_crossing: 10,
  high_road_detour: 10,
  duplicate_coordinates: 30,
  generic_address: 5,
  missing_coordinates: 30,
  invalid_coordinates: 30,
  empty_address: 30,
  duplicate_sequence: 20,
  bad_preserved_sequence: 15,
  osrm_fallback: 10,
  first_stop_far: 10,
  long_jump: 8,
  missing_driver_origin: 8
};
function roundKm(value) {
  return Math.round(value * 100) / 100;
}
function stopLabel(sequence) {
  return sequence === void 0 ? "" : `parada ${sequence + 1}`;
}
function describeExpectedPlacement(movedSequence, anchorSequence, beforeSequence, distanceKm, skippedDistanceKm) {
  const moved = stopLabel(movedSequence);
  const before = stopLabel(beforeSequence);
  if (anchorSequence === void 0) {
    return `${moved} esta a ${roundKm(
      distanceKm
    )} km da origem e foi pulada antes da ${before}. Ela deve entrar no inicio da rota, antes da ${before}, porque seguir para a ${before} gera um deslocamento de ${roundKm(
      skippedDistanceKm
    )} km.`;
  }
  const anchor = stopLabel(anchorSequence);
  return `${moved} esta a ${roundKm(
    distanceKm
  )} km da ${anchor} e foi deixada para depois da ${before}. Ela deve ficar junto dessa regiao, logo apos a ${anchor} e antes da ${before}, porque seguir para a ${before} gera um deslocamento de ${roundKm(
    skippedDistanceKm
  )} km.`;
}
function coordinateKey(stop) {
  return `${stop.latitude.toFixed(COORDINATE_PRECISION)},${stop.longitude.toFixed(
    COORDINATE_PRECISION
  )}`;
}
function normalizeAddress(value) {
  return (value || "").trim().toLowerCase();
}
function hasValidCoordinateValues(stop) {
  return Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude);
}
function hasMissingCoordinateValues(stop) {
  return stop.latitude == null || stop.longitude == null || Number(stop.latitude) === 0 && Number(stop.longitude) === 0;
}
function hasSuspiciousBrazilCoordinate(stop) {
  return stop.latitude < BRAZIL_LATITUDE_MIN || stop.latitude > BRAZIL_LATITUDE_MAX || stop.longitude < BRAZIL_LONGITUDE_MIN || stop.longitude > BRAZIL_LONGITUDE_MAX;
}
function isGenericAddress(address) {
  const normalized = normalizeAddress(address);
  if (/^(endereco|endereço|parada|entrega|cliente|destino|sem endereco|sem endereço|n\/a|na|-)$/i.test(
    normalized
  )) {
    return true;
  }
  return /^(cliente|client|parada|entrega|destino|stop|pacote|pedido|rastreio|tracking)\s*[:#-]?\s*[\w.-]+$/i.test(
    normalized
  );
}
function getReportStatus(criticalCount, warningCount) {
  if (criticalCount > 0) return "critical";
  if (warningCount > 0) return "attention";
  return "approved";
}
function getRouteQuality(score) {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 65) return "attention";
  if (score >= 50) return "poor";
  return "blocked";
}
function orientation(a, b, c) {
  const value = (b.longitude - a.longitude) * (c.latitude - a.latitude) - (b.latitude - a.latitude) * (c.longitude - a.longitude);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : -1;
}
function onSegment(a, b, c) {
  return Math.min(a.longitude, c.longitude) <= b.longitude + 1e-12 && b.longitude <= Math.max(a.longitude, c.longitude) + 1e-12 && Math.min(a.latitude, c.latitude) <= b.latitude + 1e-12 && b.latitude <= Math.max(a.latitude, c.latitude) + 1e-12;
}
function samePoint(a, b) {
  return Math.abs(a.latitude - b.latitude) < 1e-9 && Math.abs(a.longitude - b.longitude) < 1e-9;
}
function segmentsIntersect(a, b, c, d) {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) {
    return false;
  }
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}
function detectRouteCrossings(route) {
  const crossings = [];
  for (let first = 0; first < route.length - 1; first += 1) {
    for (let second = first + 2; second < route.length - 1; second += 1) {
      if (second === first + 1) continue;
      const a = route[first];
      const b = route[first + 1];
      const c = route[second];
      const d = route[second + 1];
      if (segmentsIntersect(a, b, c, d)) {
        crossings.push({
          fromSequence: a.sequence,
          toSequence: b.sequence,
          crossingFromSequence: c.sequence,
          crossingToSequence: d.sequence
        });
      }
    }
  }
  return crossings;
}
function emptyClusterMetrics() {
  return {
    clusterCount: 0,
    averageRadiusKm: 0,
    maxRadiusKm: 0,
    spreadClusters: []
  };
}
function calculateClusterMetrics(route) {
  const clusters = clusterStops(route);
  if (clusters.length === 0) return emptyClusterMetrics();
  const clusterMetrics = clusters.map((cluster) => {
    const distances = cluster.stops.map(
      (stop) => calculateDistance(cluster.centroid, route[stop.originalIndex])
    );
    const averageRadiusKm = distances.reduce((total, distance) => total + distance, 0) / Math.max(1, distances.length);
    const maxRadiusKm = Math.max(0, ...distances);
    return {
      clusterId: cluster.clusterId,
      stopCount: cluster.stops.length,
      averageRadiusKm: roundKm(averageRadiusKm),
      maxRadiusKm: roundKm(maxRadiusKm)
    };
  });
  return {
    clusterCount: clusterMetrics.length,
    averageRadiusKm: roundKm(
      clusterMetrics.reduce((total, cluster) => total + cluster.averageRadiusKm, 0) / Math.max(1, clusterMetrics.length)
    ),
    maxRadiusKm: Math.max(0, ...clusterMetrics.map((cluster) => cluster.maxRadiusKm)),
    spreadClusters: clusterMetrics.filter(
      (cluster) => cluster.averageRadiusKm >= CLUSTER_SPREAD_ATTENTION_KM
    )
  };
}
function detectPrematureRegionExits(route) {
  const clusters = clusterStops(route);
  if (clusters.length <= 1) return [];
  const clusterByOriginalIndex = /* @__PURE__ */ new Map();
  for (const cluster of clusters) {
    if (cluster.stops.length < 2) continue;
    for (const stop of cluster.stops) {
      clusterByOriginalIndex.set(stop.originalIndex, cluster.clusterId);
    }
  }
  const exits = [];
  let activeClusterId;
  for (let index2 = 0; index2 < route.length; index2 += 1) {
    const clusterId = clusterByOriginalIndex.get(index2);
    if (!clusterId) {
      activeClusterId = void 0;
      continue;
    }
    if (activeClusterId !== void 0 && activeClusterId !== clusterId) {
      const pendingSequences = route.slice(index2 + 1).filter((_, laterIndex) => {
        const originalIndex = index2 + 1 + laterIndex;
        return clusterByOriginalIndex.get(originalIndex) === activeClusterId;
      }).map((stop) => stop.sequence);
      if (pendingSequences.length > 0) {
        exits.push({
          fromClusterId: activeClusterId,
          toClusterId: clusterId,
          fromSequence: route[index2 - 1].sequence,
          toSequence: route[index2].sequence,
          pendingSequences
        });
      }
    }
    activeClusterId = clusterId;
  }
  return exits;
}
function auditRouteSequence(stops2, options = {}) {
  const orderedStops = [...stops2].sort((a, b) => a.sequence - b.sequence);
  const issues = [];
  let totalDistanceKm = 0;
  let maxLegKm = 0;
  const sequenceCounts = /* @__PURE__ */ new Map();
  for (const stop of orderedStops) {
    sequenceCounts.set(stop.sequence, (sequenceCounts.get(stop.sequence) || 0) + 1);
    const address = stop.address?.trim() ?? "";
    if (!address) {
      issues.push({
        type: "empty_address",
        severity: "critical",
        title: "Parada sem endereco",
        message: `A parada ${stop.sequence + 1} esta sem endereco preenchido.`,
        stopSequence: stop.sequence
      });
    } else if (isGenericAddress(address)) {
      issues.push({
        type: "generic_address",
        severity: "high",
        title: "Endereco generico",
        message: `A parada ${stop.sequence + 1} tem endereco generico: "${address}".`,
        stopSequence: stop.sequence
      });
    }
    if (hasMissingCoordinateValues(stop)) {
      issues.push({
        type: "missing_coordinates",
        severity: "critical",
        title: "Parada sem coordenada valida",
        message: `A parada ${stop.sequence + 1} nao tem latitude/longitude valida para roteirizacao.`,
        stopSequence: stop.sequence
      });
    } else if (!hasValidCoordinateValues(stop) || hasSuspiciousBrazilCoordinate(stop)) {
      issues.push({
        type: "invalid_coordinates",
        severity: "critical",
        title: "Coordenada invalida",
        message: `A parada ${stop.sequence + 1} tem coordenadas invalidas ou fora da area esperada.`,
        stopSequence: stop.sequence
      });
    }
  }
  for (const [sequence, count] of Array.from(sequenceCounts.entries())) {
    if (count > 1) {
      issues.push({
        type: "duplicate_sequence",
        severity: "high",
        title: "Sequencia duplicada",
        message: `${count} paradas estao usando o mesmo numero de sequencia ${sequence + 1}.`,
        stopSequence: sequence
      });
    }
  }
  const routeableStops = orderedStops.filter(
    (stop) => hasValidCoordinateValues(stop) && !hasMissingCoordinateValues(stop) && !hasSuspiciousBrazilCoordinate(stop)
  );
  const clusterMetrics = calculateClusterMetrics(routeableStops);
  for (const cluster of clusterMetrics.spreadClusters) {
    if (cluster.averageRadiusKm < CLUSTER_SPREAD_HIGH_KM && cluster.maxRadiusKm < CLUSTER_SPREAD_HIGH_KM) {
      continue;
    }
    issues.push({
      type: "cluster_spread_high",
      severity: "medium",
      title: "Cluster muito espalhado",
      message: `A regiao ${cluster.clusterId} tem raio medio de ${cluster.averageRadiusKm} km e raio maximo de ${cluster.maxRadiusKm} km. Isso indica agrupamento amplo demais e merece conferencia.`,
      distanceKm: cluster.maxRadiusKm
    });
  }
  if (options.requireStartLocation && !options.startLocation && routeableStops.length > 1) {
    issues.push({
      type: "missing_driver_origin",
      severity: "medium",
      title: "Rota criada sem origem do motorista",
      message: "Sem a origem real, o sistema otimiza a sequencia entre paradas, mas pode escolher uma primeira entrega ruim para quem esta na rua."
    });
  }
  for (const exit of detectPrematureRegionExits(routeableStops)) {
    issues.push({
      type: "premature_region_exit",
      severity: "high",
      title: "Saida prematura da regiao",
      message: `A rota saiu da regiao ${exit.fromClusterId} para a regiao ${exit.toClusterId} antes de concluir ${exit.pendingSequences.length} parada(s) pendente(s) da regiao anterior.`,
      fromSequence: exit.fromSequence,
      toSequence: exit.toSequence,
      nearestSequence: exit.pendingSequences[0],
      pendingSequences: exit.pendingSequences
    });
  }
  if (options.usedRoadMetrics === false && routeableStops.length > 1) {
    issues.push({
      type: "osrm_fallback",
      severity: "high",
      title: "Otimizacao sem OSRM",
      message: "A rota foi avaliada por distancia geografica. Isso pode ignorar sentidos de rua, retornos e caminhos reais."
    });
  }
  for (let index2 = 0; index2 < routeableStops.length; index2 += 1) {
    const planned = routeableStops[index2];
    const origin = index2 === 0 ? options.startLocation : routeableStops[index2 - 1];
    if (!origin) continue;
    const plannedDistance = calculateDistance(origin, planned);
    totalDistanceKm += plannedDistance;
    maxLegKm = Math.max(maxLegKm, plannedDistance);
    if (index2 === 0 && options.startLocation && plannedDistance >= FIRST_STOP_FAR_KM) {
      issues.push({
        type: "first_stop_far",
        severity: "medium",
        title: "Primeira parada longe da origem",
        message: `A primeira parada esta a ${roundKm(
          plannedDistance
        )} km da posicao inicial informada.`,
        toSequence: planned.sequence,
        distanceKm: roundKm(plannedDistance)
      });
    }
    if (plannedDistance >= LONG_JUMP_KM) {
      issues.push({
        type: "long_jump",
        severity: "medium",
        title: "Salto longo entre paradas",
        message: `Trecho de ${roundKm(plannedDistance)} km entre paradas consecutivas.`,
        fromSequence: index2 === 0 ? void 0 : routeableStops[index2 - 1].sequence,
        toSequence: planned.sequence,
        distanceKm: roundKm(plannedDistance)
      });
    }
    const remaining = routeableStops.slice(index2 + 1);
    let nearest = null;
    let nearestDistance = Infinity;
    for (const candidate of remaining) {
      const distance = calculateDistance(origin, candidate);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (!nearest) continue;
    const gapKm = plannedDistance - nearestDistance;
    const immediateSkip = nearestDistance <= IMMEDIATE_NEARBY_KM && gapKm >= IMMEDIATE_GAP_KM;
    const localSkip = nearestDistance <= LOCAL_NEARBY_KM && gapKm >= LOCAL_GAP_KM;
    if (immediateSkip || localSkip) {
      issues.push({
        type: "nearby_stop_skipped",
        severity: immediateSkip ? "critical" : "high",
        title: immediateSkip ? "Parada muito pr\xF3xima foi pulada" : "Parada pr\xF3xima deixada para depois",
        message: describeExpectedPlacement(
          nearest.sequence,
          index2 === 0 ? void 0 : routeableStops[index2 - 1].sequence,
          planned.sequence,
          nearestDistance,
          plannedDistance
        ),
        fromSequence: index2 === 0 ? void 0 : routeableStops[index2 - 1].sequence,
        toSequence: planned.sequence,
        nearestSequence: nearest.sequence,
        distanceKm: roundKm(plannedDistance),
        nearestDistanceKm: roundKm(nearestDistance),
        gapKm: roundKm(gapKm)
      });
    }
    for (const later of remaining) {
      const returnDistance = calculateDistance(origin, later);
      if (plannedDistance >= REVISIT_AFTER_JUMP_KM && returnDistance <= REVISIT_RADIUS_KM) {
        issues.push({
          type: "region_revisited",
          severity: "high",
          title: "Retorno desnecessario para regiao proxima",
          message: describeExpectedPlacement(
            later.sequence,
            index2 === 0 ? void 0 : routeableStops[index2 - 1].sequence,
            planned.sequence,
            returnDistance,
            plannedDistance
          ),
          fromSequence: index2 === 0 ? void 0 : routeableStops[index2 - 1].sequence,
          toSequence: planned.sequence,
          nearestSequence: later.sequence,
          distanceKm: roundKm(plannedDistance),
          nearestDistanceKm: roundKm(returnDistance)
        });
        break;
      }
    }
  }
  if (options.actualTotalDistanceKm && totalDistanceKm > 0 && options.actualTotalDistanceKm / totalDistanceKm >= ROAD_DETOUR_RATIO) {
    issues.push({
      type: "high_road_detour",
      severity: "medium",
      title: "Verificar desvio alto por rua",
      message: `A distancia por rua ficou ${roundKm(
        options.actualTotalDistanceKm / totalDistanceKm
      )}x maior que a distancia em linha reta. Pode ser normal por mao unica, avenidas ou acessos indiretos, mas merece conferencia.`,
      distanceKm: roundKm(options.actualTotalDistanceKm),
      nearestDistanceKm: roundKm(totalDistanceKm)
    });
  }
  const coordinateGroups = /* @__PURE__ */ new Map();
  for (const stop of routeableStops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) {
      continue;
    }
    const key = coordinateKey(stop);
    coordinateGroups.set(key, [...coordinateGroups.get(key) || [], stop]);
  }
  for (const group of Array.from(coordinateGroups.values())) {
    const uniqueAddresses = Array.from(
      new Set(group.map((stop) => normalizeAddress(stop.address)).filter(Boolean))
    );
    if (group.length > 1 && uniqueAddresses.length > 1) {
      issues.push({
        type: "duplicate_coordinates",
        severity: "medium",
        title: "Endere\xE7os diferentes com a mesma coordenada",
        message: `${group.length} paradas ca\xEDram no mesmo ponto do mapa. Isso pode indicar geocodifica\xE7\xE3o aproximada.`,
        stopSequence: group[0].sequence,
        addresses: group.map((stop) => stop.address || `Parada ${stop.sequence + 1}`)
      });
    }
  }
  for (const crossing of detectRouteCrossings(routeableStops)) {
    issues.push({
      type: "route_crossing",
      severity: "medium",
      title: "Trajeto com cruzamento",
      message: `O trecho entre as paradas ${crossing.fromSequence + 1} e ${crossing.toSequence + 1} cruza o trecho entre as paradas ${crossing.crossingFromSequence + 1} e ${crossing.crossingToSequence + 1}. Isso indica sequencia com zigue-zague operacional.`,
      fromSequence: crossing.fromSequence,
      toSequence: crossing.toSequence,
      nearestSequence: crossing.crossingFromSequence
    });
  }
  const hasBadPreservedSequence = options.respectInputSequence && issues.length > 0;
  if (hasBadPreservedSequence) {
    issues.unshift({
      type: "bad_preserved_sequence",
      severity: "high",
      title: "Sequencia da planilha preservada com alertas",
      message: "A rota respeitou a ordem original da tabela, mas o auditor encontrou sinais de sequencia ruim. Use otimizar rota se a operacao permitir."
    });
  }
  const finalCriticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const finalWarningCount = issues.filter((issue) => issue.severity !== "critical").length;
  const score = Math.max(
    0,
    100 - issues.reduce(
      (total, issue) => total + (ROUTE_QUALITY_PENALTIES[issue.type] ?? 10),
      0
    )
  );
  return {
    status: getReportStatus(finalCriticalCount, finalWarningCount),
    score,
    quality: getRouteQuality(score),
    stopCount: orderedStops.length,
    issueCount: issues.length,
    criticalCount: finalCriticalCount,
    warningCount: finalWarningCount,
    totalDistanceKm: roundKm(totalDistanceKm),
    maxLegKm: roundKm(maxLegKm),
    clusterMetrics,
    issues
  };
}

// server/_core/llm.ts
init_env();
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 32768;
  payload.thinking = {
    "budget_tokens": 128
  };
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/chat.ts
init_db();
function formatDistanceKm(value) {
  const distance = Number(value);
  return Number.isFinite(distance) ? distance.toFixed(2) : "N/A";
}
async function buildRouteContext(userId, routeId) {
  const routes2 = await getUserRoutes(userId);
  if (routes2.length === 0) {
    return "O usu\xE1rio ainda n\xE3o tem rotas criadas.";
  }
  let context = `O usu\xE1rio tem ${routes2.length} rotas criadas:
`;
  if (routeId) {
    const route = routes2.find((r) => r.id === routeId);
    if (route) {
      const stops2 = await getRouteStops(routeId);
      context += `
Rota Selecionada: ${route.name}
`;
      context += `- Modo: ${route.mode}
`;
      context += `- Dist\xE2ncia Total: ${route.totalDistance ? parseFloat(String(route.totalDistance)).toFixed(2) : "N/A"} km
`;
      context += `- Tempo Total: ${route.totalTime || "N/A"} minutos
`;
      context += `- Status: ${route.status}
`;
      context += `- Paradas: ${stops2.length}
`;
    }
  } else {
    context += routes2.map((r) => `- ${r.name} (${r.mode}, ${formatDistanceKm(r.totalDistance)} km)`).join("\n");
  }
  const stats = await getUserStats(userId);
  if (stats) {
    context += `

Estat\xEDsticas do Usu\xE1rio:
`;
    context += `- Total de Rotas: ${stats.totalRoutes}
`;
    context += `- Dist\xE2ncia Total: ${stats.totalDistance ? parseFloat(String(stats.totalDistance)).toFixed(2) : "0"} km
`;
    context += `- Tempo M\xE9dio: ${stats.avgTime ? parseFloat(String(stats.avgTime)).toFixed(0) : "0"} minutos
`;
    context += `- Rotas Conclu\xEDdas: ${stats.completedRoutes}
`;
  }
  return context;
}
function buildFallbackAssistantResponse(routeContext) {
  return [
    "No momento o assistente de IA n\xE3o conseguiu acessar o provedor externo, mas o EconoRota continua operacional.",
    "",
    "Resumo dispon\xEDvel:",
    routeContext,
    "",
    "Recomenda\xE7\xF5es pr\xE1ticas:",
    "- confira se todos os endere\xE7os t\xEAm n\xFAmero, bairro, cidade e UF;",
    "- use a otimiza\xE7\xE3o por dist\xE2ncia para reduzir deslocamento;",
    "- revise paradas sem coordenadas antes de iniciar a rota;",
    "- escolha Google Maps ou Waze no menu lateral antes de abrir a navega\xE7\xE3o."
  ].join("\n");
}
async function chatWithLLM(userId, userMessage, routeId, previousMessages = []) {
  let routeContext = "";
  try {
    routeContext = await buildRouteContext(userId, routeId);
    const messages = [
      {
        role: "system",
        content: `Voc\xEA \xE9 um assistente especializado em otimiza\xE7\xE3o de rotas e log\xEDstica. 
Voc\xEA ajuda usu\xE1rios a criar, otimizar e gerenciar suas rotas de entrega.

Informa\xE7\xF5es sobre o usu\xE1rio:
${routeContext}

Responda de forma clara, concisa e \xFAtil. Se o usu\xE1rio perguntar sobre otimiza\xE7\xE3o de rotas, 
forne\xE7a recomenda\xE7\xF5es pr\xE1ticas baseadas em seus dados. Use markdown para formatar respostas.`
      },
      ...previousMessages,
      {
        role: "user",
        content: userMessage
      }
    ];
    const response = await invokeLLM({
      messages
    });
    const content = response.choices?.[0]?.message?.content;
    const assistantMessage = typeof content === "string" ? content : "Desculpe, n\xE3o consegui processar sua mensagem.";
    return assistantMessage;
  } catch (error) {
    console.error("[Chat] LLM Error:", error);
    return buildFallbackAssistantResponse(
      routeContext || "N\xE3o foi poss\xEDvel carregar o contexto das rotas agora."
    );
  }
}
function formatChatHistory(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content
  }));
}

// server/imile.ts
init_env();
var DEFAULT_IMILE_API_BASE_URL = "https://driverapp.imile.com";
var DEFAULT_IMILE_FALLBACK_BASE_URLS = [
  "https://driverapp-zen.imile.com",
  "https://driverapp-cf.imile.com",
  "https://driverapp-sgaws.imile.com"
];
var DEFAULT_IMILE_DELIVERIES_PATH = "/lm/express/driver/v1/driver/delivery/delivery/queryDeliveryListV2";
var DEFAULT_IMILE_APP_VERSION = "2.2.78";
var DEFAULT_IMILE_SOURCE_NAME = "REDeliveryApp";
var DIRECT_FIELDS = {
  trackingNumber: [
    "trackingNumber",
    "trackingNo",
    "waybillNo",
    "wayBillNo",
    "awbNo",
    "billCode",
    "orderNo",
    "shipmentNo",
    "scanNumber",
    "referenceNo",
    "taskNo"
  ],
  address: [
    "address",
    "destinationAddress",
    "receiverAddress",
    "recipientAddress",
    "consigneeAddress",
    "deliveryAddress",
    "addressDetail",
    "detailAddress",
    "consigneeStreet",
    "lastConsigneeAddress"
  ],
  city: ["city", "receiverCity", "recipientCity", "consigneeCity", "addressCity"],
  neighborhood: ["neighborhood", "district", "bairro", "receiverDistrict", "consigneeSuburb"],
  postalCode: ["postalCode", "zipCode", "zipcode", "cep", "consigneeZipCode"],
  latitude: [
    "latitude",
    "lat",
    "receiverLatitude",
    "recipientLatitude",
    "consigneeLatitude",
    "addressLatitude"
  ],
  longitude: [
    "longitude",
    "lng",
    "lon",
    "receiverLongitude",
    "recipientLongitude",
    "consigneeLongitude",
    "addressLongitude"
  ],
  recipientName: ["recipientName", "receiverName", "consigneeName", "customerName"],
  recipientPhone: [
    "recipientPhone",
    "receiverPhone",
    "consigneePhone",
    "consigneeMobile",
    "phone",
    "mobile"
  ],
  status: ["status", "deliveryStatus", "shipmentStatus", "state"]
};
function readFirstString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === void 0) continue;
    const text2 = String(value).trim();
    if (text2) return text2;
  }
  return "";
}
function readCoordinate(record, keys) {
  const value = readFirstString(record, keys).replace(",", ".");
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
}
function compactJoin(parts) {
  return parts.map((part) => part.trim()).filter(Boolean).filter(
    (part, index2, all) => all.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index2
  ).join(", ");
}
function pickArray(payload) {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const candidateKeys = ["data", "list", "rows", "records", "result", "orders", "deliveries"];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value)) {
      const nested = pickArray(value);
      if (nested.length) return nested;
    }
  }
  return [];
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function buildNotes(stop) {
  return [
    stop.trackingNumber ? `Rastreio: ${stop.trackingNumber}` : "",
    stop.status ? `Status iMile: ${stop.status}` : "",
    stop.recipientName ? `Destinatario: ${stop.recipientName}` : "",
    stop.recipientPhone ? `Telefone: ${stop.recipientPhone}` : ""
  ].filter(Boolean).join(" | ");
}
function normalizeDelivery(record, index2) {
  const trackingNumber = readFirstString(record, DIRECT_FIELDS.trackingNumber);
  const address = compactJoin([
    readFirstString(record, DIRECT_FIELDS.address),
    readFirstString(record, DIRECT_FIELDS.neighborhood),
    readFirstString(record, DIRECT_FIELDS.city),
    readFirstString(record, DIRECT_FIELDS.postalCode)
  ]);
  const stop = {
    address,
    latitude: readCoordinate(record, DIRECT_FIELDS.latitude),
    longitude: readCoordinate(record, DIRECT_FIELDS.longitude),
    packageNumber: String(index2 + 1).padStart(2, "0"),
    trackingNumber,
    recipientName: readFirstString(record, DIRECT_FIELDS.recipientName),
    recipientPhone: readFirstString(record, DIRECT_FIELDS.recipientPhone),
    status: readFirstString(record, DIRECT_FIELDS.status)
  };
  return {
    ...stop,
    notes: buildNotes(stop)
  };
}
function normalizeFallbackBaseUrls(value, baseUrl) {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return (raw || DEFAULT_IMILE_FALLBACK_BASE_URLS.join(",")).split(",").map((value2) => value2.trim().replace(/\/+$/, "")).filter(Boolean).filter((value2) => value2 !== baseUrl);
}
function getImileConfig(overrides = {}) {
  const baseUrl = (overrides.baseUrl || ENV.imileApiBaseUrl || DEFAULT_IMILE_API_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const deliveriesPath = overrides.deliveriesPath || ENV.imileDeliveriesPath || DEFAULT_IMILE_DELIVERIES_PATH;
  const fallbackBaseUrls = normalizeFallbackBaseUrls(
    overrides.fallbackBaseUrls || ENV.imileFallbackBaseUrls,
    baseUrl
  );
  const authToken = overrides.authToken || ENV.imileAuthToken;
  return {
    configured: Boolean(baseUrl && authToken),
    baseUrl,
    fallbackBaseUrls,
    deliveriesPath,
    customerId: overrides.customerId || ENV.imileCustomerId,
    sign: overrides.sign || ENV.imileSign,
    authHeader: overrides.authHeader || ENV.imileAuthHeader || "Authorization",
    authToken,
    country: overrides.country || ENV.imileCountry || "BRA",
    lang: overrides.lang || ENV.imileLang || "pt-BR",
    resourceCode: overrides.resourceCode || ENV.imileResourceCode || "BRA",
    timezone: overrides.timezone || ENV.imileTimezone || "America/Sao_Paulo",
    hubCode: overrides.hubCode || ENV.imileHubCode,
    appVersion: overrides.appVersion || ENV.imileAppVersion || DEFAULT_IMILE_APP_VERSION,
    sourceName: overrides.sourceName || ENV.imileSourceName || DEFAULT_IMILE_SOURCE_NAME
  };
}
function getImileConnectionStatus(overrides = {}) {
  const config = getImileConfig(overrides);
  return {
    configured: config.configured,
    baseUrlConfigured: Boolean(config.baseUrl),
    baseUrl: config.baseUrl,
    fallbackBaseUrls: config.fallbackBaseUrls,
    deliveriesPath: config.deliveriesPath,
    customerIdConfigured: Boolean(config.customerId),
    signConfigured: Boolean(config.sign),
    authTokenConfigured: Boolean(config.authToken),
    country: config.country,
    sourceName: config.sourceName,
    appVersion: config.appVersion
  };
}
function buildImileHeaders(config) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "IM-Language": config.lang,
    "IM-SourceName": config.sourceName,
    "IM-TimeZone": config.timezone,
    "IM-APP-Version": config.appVersion,
    "IM-APP-Timestamp": String(Date.now()),
    lang: config.lang,
    "resource-code": config.resourceCode,
    timezone: config.timezone
  };
  if (config.hubCode) {
    headers["IM-HubId"] = config.hubCode;
    headers.hubcode = config.hubCode;
  }
  if (config.customerId) headers.customerId = config.customerId;
  if (config.sign) headers.sign = config.sign;
  if (config.authHeader && config.authToken) {
    headers[config.authHeader] = config.authHeader.toLowerCase() === "authorization" && !config.authToken.toLowerCase().startsWith("bearer ") ? `Bearer ${config.authToken}` : config.authToken;
  }
  return headers;
}
function extractResponseMessage(payload, fallback) {
  if (!isRecord(payload)) return fallback;
  return String(payload.message || payload.msg || payload.error || payload.resultMessage || fallback);
}
function assertImilePayloadOk(payload, baseUrl) {
  if (!isRecord(payload)) return;
  const status = String(payload.status ?? "").toLowerCase();
  const resultCode = String(payload.resultCode ?? "");
  const success = payload.success;
  const authenticated = /auth|token|login/i.test(extractResponseMessage(payload, ""));
  if (resultCode === "00002" || authenticated) {
    throw new Error(
      `iMile exige autenticacao valida em ${baseUrl}. Cadastre a credencial Rider Delivery no perfil ou configure IMILE_AUTH_TOKEN no servidor.`
    );
  }
  if (success === false || status === "failure") {
    throw new Error(`iMile recusou a consulta em ${baseUrl}: ${extractResponseMessage(payload, "falha")}`);
  }
}
async function requestDeliveriesFromBaseUrl(baseUrl, path4, headers, body) {
  const url = new URL(path4, `${baseUrl}/`);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(async () => ({
    message: await response.text().catch(() => response.statusText)
  }));
  if (!response.ok) {
    const message = extractResponseMessage(payload, response.statusText);
    throw new Error(`iMile respondeu HTTP ${response.status} em ${baseUrl}: ${message}`);
  }
  assertImilePayloadOk(payload, baseUrl);
  return payload;
}
async function fetchImileDeliveries(input, overrides = {}) {
  const config = getImileConfig(overrides);
  if (!config.configured) {
    return {
      configured: false,
      source: "imile",
      total: 0,
      stops: [],
      missingAddressRows: 0,
      missingCoordinateRows: 0
    };
  }
  const body = {
    customerId: config.customerId || void 0,
    sign: config.sign || void 0,
    country: config.country,
    countryCode: config.country,
    dateFrom: input.dateFrom || void 0,
    dateTo: input.dateTo || void 0,
    status: input.status || void 0,
    pageNum: 1,
    pageNumber: 1,
    currentPage: 1,
    pageSize: 500
  };
  const headers = buildImileHeaders(config);
  const baseUrls = [config.baseUrl, ...config.fallbackBaseUrls];
  let payload = null;
  let lastError = null;
  for (const baseUrl of baseUrls) {
    try {
      payload = await requestDeliveriesFromBaseUrl(baseUrl, config.deliveriesPath, headers, body);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  const stops2 = pickArray(payload).map(normalizeDelivery).filter((stop) => stop.address);
  return {
    configured: true,
    source: "imile",
    total: stops2.length,
    stops: stops2,
    missingAddressRows: pickArray(payload).length - stops2.length,
    missingCoordinateRows: stops2.filter((stop) => !stop.latitude || !stop.longitude).length
  };
}

// server/integrationCredentials.ts
init_env();
import crypto2 from "node:crypto";
var ALGORITHM = "aes-256-gcm";
function getKey() {
  if (!ENV.integrationCredentialsSecret || ENV.integrationCredentialsSecret.length < 32) {
    throw new Error("Configure INTEGRATION_CREDENTIALS_SECRET ou JWT_SECRET com no minimo 32 caracteres.");
  }
  return crypto2.createHash("sha256").update(ENV.integrationCredentialsSecret).digest();
}
function encryptIntegrationSecret(value) {
  const iv = crypto2.randomBytes(12);
  const cipher = crypto2.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((item) => item.toString("base64url")).join(".");
}
function decryptIntegrationSecret(value) {
  const [ivValue, authTagValue, encryptedValue] = value.split(".");
  if (!ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Credencial de integracao invalida.");
  }
  const decipher = crypto2.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

// server/routers.ts
var IMILE_PROVIDER = "imile_rider_delivery";
var BLOCKING_AUDIT_ISSUE_TYPES = /* @__PURE__ */ new Set([
  "missing_coordinates",
  "invalid_coordinates",
  "empty_address",
  "generic_address"
]);
var DUPLICATE_COORDINATE_BLOCKING_GROUPS = 3;
var MAX_AUDIT_CORRECTION_ATTEMPTS = 20;
var imileCredentialInput = z2.object({
  label: z2.string().max(255).optional(),
  baseUrl: z2.string().url().optional().or(z2.literal("")),
  fallbackBaseUrls: z2.string().optional(),
  deliveriesPath: z2.string().max(500).optional(),
  authHeader: z2.string().max(128).optional(),
  authToken: z2.string().optional().default(""),
  country: z2.string().max(16).optional(),
  lang: z2.string().max(32).optional(),
  resourceCode: z2.string().max(64).optional(),
  timezone: z2.string().max(64).optional(),
  hubCode: z2.string().max(128).optional(),
  appVersion: z2.string().max(32).optional(),
  sourceName: z2.string().max(128).optional()
});
function cleanText(value) {
  const text2 = value?.trim();
  return text2 || void 0;
}
async function getUserImileOverrides(userId) {
  const integration = await getUserIntegration(userId, IMILE_PROVIDER);
  if (!integration) return void 0;
  return {
    baseUrl: cleanText(integration.baseUrl),
    fallbackBaseUrls: cleanText(integration.fallbackBaseUrls),
    deliveriesPath: cleanText(integration.deliveriesPath),
    authHeader: cleanText(integration.authHeader),
    authToken: decryptIntegrationSecret(integration.authTokenEncrypted),
    country: cleanText(integration.country),
    lang: cleanText(integration.lang),
    resourceCode: cleanText(integration.resourceCode),
    timezone: cleanText(integration.timezone),
    hubCode: cleanText(integration.hubCode),
    appVersion: cleanText(integration.appVersion),
    sourceName: cleanText(integration.sourceName)
  };
}
function toOptionalLocation(address, latitudeValue, longitudeValue) {
  const normalizedAddress = typeof address === "string" ? address.trim() : "";
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return void 0;
  }
  if (!normalizedAddress && latitude === 0 && longitude === 0) {
    return void 0;
  }
  return {
    address: normalizedAddress || void 0,
    latitude,
    longitude
  };
}
function hasMissingCoordinates(location) {
  return location.latitude === 0 && location.longitude === 0;
}
function buildSequentialRoute(locations, options = {}) {
  const waypoints = locations.map((location, index2) => ({
    ...location,
    sequence: index2
  }));
  if (waypoints.length === 0) {
    return {
      sequence: [],
      totalDistance: 0,
      totalTime: 0,
      waypoints: []
    };
  }
  let totalDistance = 0;
  let totalTime = 0;
  if (options.startLocation) {
    const firstSegmentDistance = calculateDistance(options.startLocation, waypoints[0]);
    totalDistance += firstSegmentDistance;
    totalTime += estimateTravelTime(firstSegmentDistance);
  }
  for (let index2 = 0; index2 < waypoints.length - 1; index2++) {
    const current = waypoints[index2];
    const next = waypoints[index2 + 1];
    const segmentDistance = calculateDistance(current, next);
    totalDistance += segmentDistance;
    totalTime += estimateTravelTime(segmentDistance);
  }
  if (options.endLocation) {
    const lastSegmentDistance = calculateDistance(
      waypoints[waypoints.length - 1],
      options.endLocation
    );
    totalDistance += lastSegmentDistance;
    totalTime += estimateTravelTime(lastSegmentDistance);
  }
  return {
    sequence: waypoints.map((_, index2) => index2),
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime,
    waypoints
  };
}
function isImileStopNotes(notes) {
  return /\b(Status iMile|Distancia app|Entregas agrupadas|Destinatario|Telefone)\s*:/i.test(
    notes || ""
  );
}
function buildSequentialImilePackageNumber(index2) {
  return String(index2 + 1).padStart(2, "0");
}
function replaceImilePackageInNotes(notes, sequence) {
  if (!isImileStopNotes(notes)) return notes;
  const packageNote = `Pacote: ${buildSequentialImilePackageNumber(sequence)}`;
  const parts = (notes || "").split("|").map((part) => part.trim()).filter(Boolean).filter((part) => !/^(Pacote|STOP)\s*:/i.test(part));
  return [packageNote, ...parts].join(" | ");
}
function routeToAuditableStops(route) {
  return route.waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
    sequence: waypoint.sequence
  }));
}
function parseAuditCoordinate(value) {
  return value === null || value === void 0 ? Number.NaN : parseFloat(String(value));
}
function routeStopsToAuditableStops(routeStops) {
  return routeStops.map((stop) => ({
    id: Number(stop.id),
    latitude: parseAuditCoordinate(stop.latitude),
    longitude: parseAuditCoordinate(stop.longitude),
    address: stop.address,
    notes: stop.notes ?? void 0,
    sequence: Number(stop.sequence)
  }));
}
function getBlockingAuditIssues(audit) {
  return audit.issues.filter((issue) => BLOCKING_AUDIT_ISSUE_TYPES.has(issue.type));
}
function getPostOptimizationBlockingReason(audit) {
  const nearbySkip = audit.issues.find(
    (issue) => issue.type === "nearby_stop_skipped" && (issue.severity === "critical" || issue.severity === "high")
  );
  if (nearbySkip) {
    return {
      issue: nearbySkip,
      message: `${nearbySkip.title}: ${nearbySkip.message}`
    };
  }
  const regionRevisited = audit.issues.find(
    (issue) => issue.type === "region_revisited"
  );
  if (regionRevisited) {
    return {
      issue: regionRevisited,
      message: `${regionRevisited.title}: ${regionRevisited.message}`
    };
  }
  const prematureRegionExit = audit.issues.find(
    (issue) => issue.type === "premature_region_exit"
  );
  if (prematureRegionExit) {
    return {
      issue: prematureRegionExit,
      message: `${prematureRegionExit.title}: ${prematureRegionExit.message}`
    };
  }
  const routeCrossing = audit.issues.find((issue) => issue.type === "route_crossing");
  if (routeCrossing) {
    return {
      issue: routeCrossing,
      message: `${routeCrossing.title}: ${routeCrossing.message}`
    };
  }
  const duplicateCoordinateIssues = audit.issues.filter(
    (issue) => issue.type === "duplicate_coordinates"
  );
  if (duplicateCoordinateIssues.length >= DUPLICATE_COORDINATE_BLOCKING_GROUPS) {
    return {
      issue: duplicateCoordinateIssues[0],
      message: `Geocodificacao imprecisa: ${duplicateCoordinateIssues.length} grupos de enderecos cairam no mesmo ponto do mapa.`
    };
  }
  return null;
}
function isSequenceCoherenceIssue(issue) {
  return issue.type === "nearby_stop_skipped" || issue.type === "region_revisited" || issue.type === "premature_region_exit" || issue.type === "route_crossing";
}
function countAuditIssues(audit, type) {
  return audit.issues.filter((issue) => issue.type === type).length;
}
function countCorrectedIssues(correctionAttempts) {
  return correctionAttempts.length;
}
function routeWaypointSignature(route) {
  return route.waypoints.map(
    (waypoint) => [
      waypoint.latitude.toFixed(6),
      waypoint.longitude.toFixed(6),
      waypoint.address ?? ""
    ].join(",")
  ).join("|");
}
function reorderRouteByAuditIssue(route, issue) {
  if (!isSequenceCoherenceIssue(issue) || issue.nearestSequence === void 0 || issue.toSequence === void 0) {
    return null;
  }
  const waypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));
  if (issue.type === "premature_region_exit" && issue.pendingSequences?.length) {
    const plannedIndex2 = waypoints.findIndex(
      (waypoint) => waypoint.sequence === issue.toSequence
    );
    if (plannedIndex2 < 0) return null;
    const pendingSequenceSet = new Set(issue.pendingSequences);
    const pendingWaypoints = waypoints.filter(
      (waypoint) => pendingSequenceSet.has(waypoint.sequence)
    );
    if (pendingWaypoints.length === 0) return null;
    const remainingWaypoints = waypoints.filter(
      (waypoint) => !pendingSequenceSet.has(waypoint.sequence)
    );
    const insertionIndex = remainingWaypoints.findIndex(
      (waypoint) => waypoint.sequence === issue.toSequence
    );
    if (insertionIndex < 0) return null;
    remainingWaypoints.splice(insertionIndex, 0, ...pendingWaypoints);
    return remainingWaypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      address: waypoint.address,
      notes: waypoint.notes
    }));
  }
  const nearestIndex = waypoints.findIndex(
    (waypoint) => waypoint.sequence === issue.nearestSequence
  );
  const plannedIndex = waypoints.findIndex(
    (waypoint) => waypoint.sequence === issue.toSequence
  );
  if (nearestIndex < 0 || plannedIndex < 0 || nearestIndex <= plannedIndex) {
    return null;
  }
  const [nearestWaypoint] = waypoints.splice(nearestIndex, 1);
  waypoints.splice(plannedIndex, 0, nearestWaypoint);
  return waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes
  }));
}
function assertRouteStopsReadyForOptimization(routeStops) {
  const audit = auditRouteSequence(routeStopsToAuditableStops(routeStops));
  const blockingIssues = getBlockingAuditIssues(audit);
  if (blockingIssues.length === 0) return;
  const firstIssue = blockingIssues[0];
  throw new TRPCError3({
    code: "BAD_REQUEST",
    message: `${firstIssue.title}: ${firstIssue.message}`
  });
}
function auditOptimizedRoute(route, options = {}) {
  return auditRouteSequence(routeToAuditableStops(route), {
    startLocation: options.startLocation,
    requireStartLocation: true,
    actualTotalDistanceKm: route.totalDistance,
    usedRoadMetrics: options.usedRoadMetrics,
    respectInputSequence: options.respectInputSequence
  });
}
function readBooleanMetadata(metadata, key) {
  if (!metadata || typeof metadata !== "object") return void 0;
  const value = metadata[key];
  return typeof value === "boolean" ? value : void 0;
}
function readStringMetadata(metadata, key) {
  if (!metadata || typeof metadata !== "object") return void 0;
  const value = metadata[key];
  return typeof value === "string" ? value : void 0;
}
function isLatestOptimizationContextFresh(route, event) {
  if (!event || route.status !== "optimized") return false;
  const routeUpdatedAt = route.updatedAt ? new Date(route.updatedAt).getTime() : 0;
  const eventCreatedAt = event.createdAt ? new Date(event.createdAt).getTime() : 0;
  if (!Number.isFinite(routeUpdatedAt) || !Number.isFinite(eventCreatedAt)) {
    return false;
  }
  return routeUpdatedAt <= eventCreatedAt;
}
async function requireUserRoute(routeId, userId) {
  const route = await getRouteById(routeId, userId);
  if (!route) {
    throw new TRPCError3({
      code: "NOT_FOUND",
      message: "Rota n\xE3o encontrada."
    });
  }
  return route;
}
async function optimizeUserRoute(routeId, userId, requestedMode, options) {
  const optimizationStartedAt = Date.now();
  const route = await requireUserRoute(routeId, userId);
  const excludedStopIds = new Set(options?.excludeStopIds ?? []);
  const routeStops = (await getRouteStops(routeId)).filter(
    (stop) => !excludedStopIds.has(Number(stop.id))
  );
  if (routeStops.length === 0) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: "A rota n\xE3o tem paradas."
    });
  }
  if (routeStops.length < 2) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: "A rota precisa ter pelo menos 2 paradas para otimizar."
    });
  }
  assertRouteStopsReadyForOptimization(routeStops);
  const locations = routeStops.map((stop) => ({
    latitude: parseFloat(String(stop.latitude ?? 0)),
    longitude: parseFloat(String(stop.longitude ?? 0)),
    address: stop.address,
    notes: stop.notes ?? void 0
  }));
  const validation = validateLocations(locations);
  if (!validation.valid) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: validation.error
    });
  }
  const missingCoordinateIndex = locations.findIndex(hasMissingCoordinates);
  if (missingCoordinateIndex !== -1) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: `Coordenadas ausentes na parada ${missingCoordinateIndex + 1}.`
    });
  }
  const startLocation = options?.startLocation ?? toOptionalLocation(route.startLocation, route.startLatitude, route.startLongitude);
  const endLocation = toOptionalLocation(
    route.endLocation,
    route.endLatitude,
    route.endLongitude
  );
  const endpointValidation = validateLocations(
    [startLocation, endLocation].filter(Boolean)
  );
  if ((startLocation || endLocation) && !endpointValidation.valid) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: endpointValidation.error
    });
  }
  if ([startLocation, endLocation].filter(Boolean).some(
    (location) => hasMissingCoordinates(location)
  )) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: "Coordenadas ausentes no inicio ou fim da rota."
    });
  }
  const mode = requestedMode || route.mode;
  async function buildOptimizationAttempt(attempt) {
    const attemptLocations = attempt.orderedLocations ?? locations;
    const roadMetricOptions = {
      startLocation,
      endLocation,
      localityMode: attempt.localityMode
    };
    let optimizedWithRoadMetrics = null;
    let auditSource2 = "geo-default";
    if (attempt.respectInputSequence) {
      optimizedWithRoadMetrics = await buildSequentialRouteWithRoadMetrics(
        attemptLocations,
        roadMetricOptions
      );
      auditSource2 = optimizedWithRoadMetrics ? "road-sequential" : "geo-sequential";
    } else if (attempt.orderedLocations) {
      optimizedWithRoadMetrics = await buildSequentialRouteWithRoadMetrics(
        attemptLocations,
        roadMetricOptions
      );
      auditSource2 = optimizedWithRoadMetrics ? "road-audit-repair" : "geo-audit-repair";
    } else {
      optimizedWithRoadMetrics = await optimizeRouteWithRoadMetrics(
        attemptLocations,
        mode,
        0,
        roadMetricOptions
      );
      auditSource2 = optimizedWithRoadMetrics ? "road-default" : "geo-default";
    }
    const optimized2 = optimizedWithRoadMetrics ?? (attempt.respectInputSequence ? buildSequentialRoute(attemptLocations, roadMetricOptions) : attempt.orderedLocations ? buildSequentialRoute(attemptLocations, roadMetricOptions) : optimizeRoute(attemptLocations, mode, 0, roadMetricOptions));
    const audit2 = auditOptimizedRoute(optimized2, {
      startLocation,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      respectInputSequence: Boolean(attempt.respectInputSequence)
    });
    return {
      optimized: optimized2,
      audit: audit2,
      auditSource: attempt.auditSourceSuffix ? `${auditSource2}-${attempt.auditSourceSuffix}` : auditSource2,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      localityMode: attempt.localityMode,
      respectInputSequence: Boolean(attempt.respectInputSequence)
    };
  }
  let optimizationAttempt = await buildOptimizationAttempt({
    localityMode: options?.localityMode,
    respectInputSequence: Boolean(options?.respectInputSequence)
  });
  let postOptimizationBlockingReason = getPostOptimizationBlockingReason(
    optimizationAttempt.audit
  );
  let firstBlockingReason = postOptimizationBlockingReason;
  const correctionAttempts = [];
  if (postOptimizationBlockingReason && isSequenceCoherenceIssue(postOptimizationBlockingReason.issue)) {
    const firstBlockingIssue = postOptimizationBlockingReason.issue;
    optimizationAttempt = await buildOptimizationAttempt({
      localityMode: "strict",
      respectInputSequence: false,
      auditSourceSuffix: "audit-corrected"
    });
    postOptimizationBlockingReason = getPostOptimizationBlockingReason(
      optimizationAttempt.audit
    );
    correctionAttempts.push({
      blockingIssue: firstBlockingIssue,
      auditSource: optimizationAttempt.auditSource,
      status: optimizationAttempt.audit.status,
      score: optimizationAttempt.audit.score,
      issueCount: optimizationAttempt.audit.issueCount
    });
    const seenSignatures = /* @__PURE__ */ new Set([routeWaypointSignature(optimizationAttempt.optimized)]);
    const maxRepairAttempts = Math.min(
      MAX_AUDIT_CORRECTION_ATTEMPTS,
      Math.max(1, locations.length * 2)
    );
    for (let repairAttempt = 0; postOptimizationBlockingReason && isSequenceCoherenceIssue(postOptimizationBlockingReason.issue) && repairAttempt < maxRepairAttempts; repairAttempt += 1) {
      const repairedLocations = reorderRouteByAuditIssue(
        optimizationAttempt.optimized,
        postOptimizationBlockingReason.issue
      );
      if (!repairedLocations) break;
      const repairedAttempt = await buildOptimizationAttempt({
        localityMode: "strict",
        respectInputSequence: false,
        auditSourceSuffix: `audit-repaired-${repairAttempt + 1}`,
        orderedLocations: repairedLocations
      });
      const signature = routeWaypointSignature(repairedAttempt.optimized);
      if (seenSignatures.has(signature)) break;
      seenSignatures.add(signature);
      correctionAttempts.push({
        blockingIssue: postOptimizationBlockingReason.issue,
        auditSource: repairedAttempt.auditSource,
        status: repairedAttempt.audit.status,
        score: repairedAttempt.audit.score,
        issueCount: repairedAttempt.audit.issueCount
      });
      optimizationAttempt = repairedAttempt;
      postOptimizationBlockingReason = getPostOptimizationBlockingReason(
        optimizationAttempt.audit
      );
    }
  }
  if (correctionAttempts.length > 0 && firstBlockingReason) {
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_audit_corrected_optimization",
      severity: postOptimizationBlockingReason ? "warning" : "info",
      source: "routes.audit",
      title: postOptimizationBlockingReason ? "Auditor tentou corrigir a sequ\xEAncia" : "Auditor corrigiu a sequ\xEAncia",
      message: postOptimizationBlockingReason ? `O fiscal tentou ${correctionAttempts.length} correcao(oes), mas a rota ainda tem incoerencia. ${postOptimizationBlockingReason.message}` : `A rota foi reotimizada em modo r\xEDgido ap\xF3s o fiscal detectar incoer\xEAncia. ${firstBlockingReason.message}`,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        firstBlockingIssue: firstBlockingReason.issue,
        finalStatus: optimizationAttempt.audit.status,
        finalScore: optimizationAttempt.audit.score,
        finalIssueCount: optimizationAttempt.audit.issueCount,
        finalIssues: optimizationAttempt.audit.issues.slice(0, 8),
        correctionAttempts,
        localityMode: optimizationAttempt.localityMode,
        respectInputSequence: optimizationAttempt.respectInputSequence,
        auditSource: optimizationAttempt.auditSource
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record route audit correction event:", error);
    });
  }
  async function recordRouteMetricForAttempt(blockedReason) {
    const attemptAudit = optimizationAttempt.audit;
    await createRouteMetric({
      userId,
      routeId,
      qualityScore: attemptAudit.score,
      optimizationRuntimeMs: Date.now() - optimizationStartedAt,
      osrmUsed: optimizationAttempt.usedRoadMetrics,
      osrmFallback: !optimizationAttempt.usedRoadMetrics,
      clusterCount: attemptAudit.clusterMetrics.clusterCount,
      averageClusterRadius: attemptAudit.clusterMetrics.averageRadiusKm,
      maxClusterRadius: attemptAudit.clusterMetrics.maxRadiusKm,
      regionRevisitedCount: countAuditIssues(attemptAudit, "region_revisited"),
      prematureRegionExitCount: countAuditIssues(
        attemptAudit,
        "premature_region_exit"
      ),
      nearbyStopSkippedCount: countAuditIssues(
        attemptAudit,
        "nearby_stop_skipped"
      ),
      routeCrossingCount: countAuditIssues(attemptAudit, "route_crossing"),
      issuesDetectedCount: attemptAudit.issueCount + correctionAttempts.length,
      issuesCorrectedCount: blockedReason ? 0 : countCorrectedIssues(correctionAttempts),
      issuesBlockedCount: blockedReason ? 1 : 0,
      auditStatus: attemptAudit.status,
      auditQuality: attemptAudit.quality,
      auditSource: optimizationAttempt.auditSource,
      routeMode: mode,
      localityMode: optimizationAttempt.localityMode ?? options?.localityMode ?? null,
      stopCount: attemptAudit.stopCount,
      totalDistanceKm: optimizationAttempt.optimized.totalDistance,
      totalTimeMinutes: optimizationAttempt.optimized.totalTime,
      metadata: {
        firstBlockingIssue: firstBlockingReason?.issue ?? null,
        blockingIssue: blockedReason?.issue ?? null,
        correctionAttempts,
        finalIssues: attemptAudit.issues.slice(0, 12)
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record route metric:", error);
    });
  }
  const { optimized, audit, auditSource } = optimizationAttempt;
  if (postOptimizationBlockingReason) {
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_audit_blocked_optimization",
      severity: "error",
      source: "routes.optimize",
      title: "Auditor bloqueou a otimizacao",
      message: postOptimizationBlockingReason.message,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        auditSource,
        status: audit.status,
        score: audit.score,
        issueCount: audit.issueCount,
        criticalCount: audit.criticalCount,
        warningCount: audit.warningCount,
        totalDistanceKm: audit.totalDistanceKm,
        maxLegKm: audit.maxLegKm,
        blockingIssue: postOptimizationBlockingReason.issue,
        issues: audit.issues.slice(0, 8)
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record blocked route audit event:", error);
    });
    await recordRouteMetricForAttempt(postOptimizationBlockingReason);
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: `Auditor bloqueou a otimizacao. ${postOptimizationBlockingReason.message}`
    });
  }
  await updateRoute(routeId, userId, {
    totalDistance: optimized.totalDistance,
    totalTime: optimized.totalTime,
    status: "optimized"
  });
  await deleteRouteStops(routeId);
  const updatedStops = optimized.waypoints.map((wp) => ({
    address: wp.address || "",
    latitude: wp.latitude,
    longitude: wp.longitude,
    sequence: wp.sequence,
    notes: replaceImilePackageInNotes(wp.notes, wp.sequence)
  }));
  await createStops(routeId, updatedStops);
  await recordRouteMetricForAttempt(null);
  return { ...optimized, audit, auditSource };
}
var credentialsSchema = z2.object({
  email: z2.string().email("Informe um e-mail valido."),
  password: z2.string().min(8, "A senha deve ter pelo menos 8 caracteres.")
});
var registrationSchema = credentialsSchema.extend({
  name: z2.string().min(2, "Informe seu nome."),
  phone: z2.string().min(8, "Informe um telefone valido.").max(32),
  companyName: z2.string().max(255).optional(),
  city: z2.string().min(2, "Informe sua cidade.").max(128),
  state: z2.string().min(2, "Informe o estado.").max(64),
  vehicleType: z2.string().min(2, "Informe o tipo de veiculo.").max(64),
  acceptTerms: z2.boolean().refine((value) => value === true, {
    message: "Aceite os termos para criar a conta."
  })
});
var profileUpdateSchema = z2.object({
  name: z2.string().min(2, "Informe seu nome.").max(255),
  phone: z2.string().min(8, "Informe um telefone valido.").max(32),
  companyName: z2.string().max(255).optional(),
  city: z2.string().min(2, "Informe sua cidade.").max(128),
  state: z2.string().min(2, "Informe o estado.").max(64),
  vehicleType: z2.string().min(2, "Informe o tipo de veiculo.").max(64),
  acceptTerms: z2.boolean().optional()
});
var passwordResetRequestSchema = z2.object({
  email: z2.string().email("Informe um e-mail valido.")
});
var routeModeSchema = z2.enum(["shortest_distance", "shortest_time", "balanced"]);
var localityModeSchema = z2.enum(["balanced", "local", "strict"]);
var eventSeveritySchema = z2.enum(["info", "warning", "error", "fatal"]);
var operationalEventSchema = z2.object({
  type: z2.string().min(1).max(96),
  severity: eventSeveritySchema.default("info"),
  source: z2.string().min(1).max(128),
  title: z2.string().min(1).max(255),
  message: z2.string().max(3e3).optional(),
  routeId: z2.number().optional(),
  stopId: z2.number().optional(),
  runtime: z2.string().max(64).optional(),
  url: z2.string().max(700).optional(),
  userAgent: z2.string().max(700).optional(),
  appVersion: z2.string().max(64).optional(),
  metadata: z2.record(z2.string(), z2.unknown()).optional()
});
var routeCreateSchema = z2.object({
  name: z2.string().min(1),
  description: z2.string().optional(),
  mode: routeModeSchema,
  startLocation: z2.string().optional(),
  startLatitude: z2.number().optional(),
  startLongitude: z2.number().optional(),
  endLocation: z2.string().optional(),
  endLatitude: z2.number().optional(),
  endLongitude: z2.number().optional()
});
var stopCreateSchema = z2.object({
  address: z2.string().min(1, "Informe o endere\xE7o da parada."),
  latitude: z2.number().optional(),
  longitude: z2.number().optional(),
  sequence: z2.number(),
  notes: z2.string().optional()
});
var stopUpdateSchema = z2.object({
  routeId: z2.number(),
  stopId: z2.number(),
  address: z2.string().min(1, "Informe o endere\xE7o da parada."),
  latitude: z2.number().nullable().optional(),
  longitude: z2.number().nullable().optional(),
  sequence: z2.number().optional(),
  notes: z2.string().nullable().optional()
});
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
async function recordOperationalEvent(userId, input) {
  try {
    return await createOperationalEvent({
      ...input,
      userId: userId ?? null,
      routeId: input.routeId ?? null,
      stopId: input.stopId ?? null,
      message: input.message ?? null,
      runtime: input.runtime ?? null,
      url: input.url ?? null,
      userAgent: input.userAgent ?? null,
      appVersion: input.appVersion ?? null,
      metadata: input.metadata ?? null
    });
  } catch (error) {
    console.warn("[OperationalEvent] Failed to record event:", error);
    return null;
  }
}
async function recordRouteAuditEvent(userId, routeId, audit, source) {
  if (!audit || audit.status === "approved") return;
  const firstIssue = audit.issues[0];
  await recordOperationalEvent(userId, {
    type: "route_audit_flagged",
    severity: audit.status === "critical" ? "error" : "warning",
    source: "routes.audit",
    title: audit.status === "critical" ? "Auditor reprovou a sequ\xEAncia" : "Auditor encontrou pontos de aten\xE7\xE3o",
    routeId,
    message: firstIssue?.message || "A rota tem sinais de sequ\xEAncia incoerente.",
    metadata: {
      auditSource: source,
      status: audit.status,
      score: audit.score,
      issueCount: audit.issueCount,
      criticalCount: audit.criticalCount,
      warningCount: audit.warningCount,
      totalDistanceKm: audit.totalDistanceKm,
      maxLegKm: audit.maxLegKm,
      issues: audit.issues.slice(0, 8)
    }
  });
}
async function setPasswordSession(ctx, openId, name, email) {
  const sessionToken = await sdk.createSessionToken(openId, {
    name: name || "",
    email,
    expiresInMs: ONE_YEAR_MS
  });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS
  });
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (opts.ctx.user?.openId && typeof opts.ctx.res.cookie === "function") {
        await setPasswordSession(
          opts.ctx,
          opts.ctx.user.openId,
          opts.ctx.user.name,
          opts.ctx.user.email
        );
      }
      return sanitizeUser(opts.ctx.user);
    }),
    login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail2(input.email);
      const user = await getUserByEmail(email);
      const isValidPassword = await verifyPassword(
        input.password,
        user?.passwordHash
      );
      if (!user || !isValidPassword) {
        throw new TRPCError3({
          code: "UNAUTHORIZED",
          message: "E-mail ou senha inv\xE1lidos."
        });
      }
      await upsertUser({
        openId: user.openId,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      await recordOperationalEvent(user.id, {
        type: "user_login",
        severity: "info",
        source: "auth.login",
        title: "Login realizado",
        message: user.email ?? void 0
      });
      await setPasswordSession(
        ctx,
        user.openId,
        user.name,
        user.email
      );
      return {
        ...sanitizeUser(await getUserByOpenId(user.openId) ?? user)
      };
    }),
    register: publicProcedure.input(registrationSchema).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail2(input.email);
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Ja existe uma conta com este e-mail."
        });
      }
      const role = isAdminEmail(email, ENV.adminEmails) ? "admin" : "user";
      const passwordHash = await hashPassword(input.password);
      const openId = buildPasswordOpenId(email);
      const user = await createPasswordUser({
        openId,
        name: input.name.trim(),
        email,
        passwordHash,
        role,
        phone: input.phone.trim(),
        companyName: input.companyName?.trim() || null,
        city: input.city.trim(),
        state: input.state.trim(),
        vehicleType: input.vehicleType.trim(),
        acceptedTermsAt: /* @__PURE__ */ new Date()
      });
      if (!user) {
        throw new TRPCError3({
          code: "INTERNAL_SERVER_ERROR",
          message: "N\xE3o foi poss\xEDvel criar a conta."
        });
      }
      await setPasswordSession(
        ctx,
        user.openId,
        user.name,
        user.email
      );
      await recordOperationalEvent(user.id, {
        type: "user_registered",
        severity: "info",
        source: "auth.register",
        title: "Novo cadastro",
        message: user.email ?? void 0,
        metadata: {
          role,
          city: input.city.trim(),
          state: input.state.trim(),
          vehicleType: input.vehicleType.trim(),
          companyName: input.companyName?.trim() || null
        }
      });
      return {
        ...sanitizeUser(user)
      };
    }),
    requestPasswordReset: publicProcedure.input(passwordResetRequestSchema).mutation(async ({ input }) => {
      const email = normalizeEmail2(input.email);
      const allowed = isAdminEmail(email, ENV.adminEmails);
      if (allowed) {
        const user = await getUserByEmail(email);
        await recordOperationalEvent(user?.id ?? null, {
          type: "admin_password_reset_requested",
          severity: "warning",
          source: "auth.passwordReset",
          title: "Reset de senha administrativa solicitado",
          message: email,
          metadata: {
            allowed,
            instructions: "Somente os e-mails administrativos autorizados podem solicitar reset. Execute redefinicao operacional segura pelo banco/CLI."
          }
        });
      }
      return {
        success: true,
        message: "Se o e-mail for autorizado para administracao, a solicitacao de reset sera registrada para tratamento seguro."
      };
    }),
    updateProfile: protectedProcedure.input(profileUpdateSchema).mutation(async ({ ctx, input }) => {
      const existingAcceptedTerms = Boolean(ctx.user.acceptedTermsAt);
      if (!existingAcceptedTerms && input.acceptTerms !== true) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Aceite os termos para atualizar o cadastro."
        });
      }
      const updatedUser = await updateUserProfile(ctx.user.id, {
        name: input.name.trim(),
        phone: input.phone.trim(),
        companyName: input.companyName?.trim() || null,
        city: input.city.trim(),
        state: input.state.trim(),
        vehicleType: input.vehicleType.trim(),
        acceptedTermsAt: existingAcceptedTerms ? ctx.user.acceptedTermsAt : /* @__PURE__ */ new Date()
      });
      if (!updatedUser) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Usuario nao encontrado."
        });
      }
      await recordOperationalEvent(ctx.user.id, {
        type: "user_profile_updated",
        severity: "info",
        source: "auth.updateProfile",
        title: "Cadastro atualizado",
        message: updatedUser.email ?? void 0,
        metadata: {
          city: input.city.trim(),
          state: input.state.trim(),
          vehicleType: input.vehicleType.trim(),
          companyName: input.companyName?.trim() || null
        }
      });
      return sanitizeUser(updatedUser);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  events: router({
    report: publicProcedure.input(operationalEventSchema).mutation(async ({ ctx, input }) => {
      await recordOperationalEvent(ctx.user?.id ?? null, input);
      return { success: true };
    })
  }),
  admin: router({
    dashboard: adminProcedure.query(() => getAdminOperationalDashboard()),
    routeMetrics: adminProcedure.input(z2.object({
      days: z2.number().min(1).max(365).default(30)
    })).query(({ input }) => getRouteMetricsDashboard(input.days)),
    events: adminProcedure.input(z2.object({
      limit: z2.number().min(1).max(200).default(100)
    })).query(({ input }) => getRecentOperationalEvents(input.limit)),
    cleanupE2eUsers: adminProcedure.mutation(async ({ ctx }) => {
      const result = await cleanupE2eTestUsers();
      await recordOperationalEvent(ctx.user.id, {
        type: "admin_cleanup_e2e_users",
        severity: "info",
        source: "admin.cleanup",
        title: "Usuarios E2E removidos",
        message: `${result.deletedCount} usuario(s) de teste removido(s).`,
        metadata: {
          deletedCount: result.deletedCount,
          deletedUsers: result.deletedUsers
        }
      });
      return result;
    })
  }),
  routes: router({
    list: protectedProcedure.query(
      ({ ctx }) => getUserRoutes(ctx.user.id)
    ),
    get: protectedProcedure.input(z2.object({ id: z2.number() })).query(
      ({ ctx, input }) => getRouteById(input.id, ctx.user.id)
    ),
    audit: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ ctx, input }) => {
      const route = await requireUserRoute(input.id, ctx.user.id);
      const routeStops = await getRouteStops(input.id);
      const latestOptimizationEvent = await getLatestRouteOptimizationEvent(
        input.id,
        ctx.user.id
      );
      const hasFreshOptimizationContext = isLatestOptimizationContextFresh(
        route,
        latestOptimizationEvent
      );
      const latestMetadata = hasFreshOptimizationContext ? latestOptimizationEvent?.metadata : void 0;
      const auditSource = readStringMetadata(latestMetadata, "auditSource");
      const usedRoadMetrics = readBooleanMetadata(
        latestMetadata,
        "auditUsedRoadMetrics"
      ) ?? (auditSource ? auditSource.startsWith("road-") : void 0);
      const respectInputSequence = readBooleanMetadata(
        latestMetadata,
        "respectInputSequence"
      );
      const requireStartLocation = readBooleanMetadata(
        latestMetadata,
        "auditRequireStartLocation"
      ) ?? false;
      const startLocation = toOptionalLocation(
        route.startLocation,
        route.startLatitude,
        route.startLongitude
      );
      const report = auditRouteSequence(
        routeStopsToAuditableStops(routeStops),
        {
          startLocation,
          requireStartLocation,
          actualTotalDistanceKm: Number(route.totalDistance ?? 0),
          usedRoadMetrics,
          respectInputSequence
        }
      );
      return {
        ...report,
        context: {
          auditSource: auditSource ?? null,
          usedRoadMetrics: usedRoadMetrics ?? null,
          respectInputSequence: respectInputSequence ?? null,
          requireStartLocation,
          lastOptimizationEventId: latestOptimizationEvent?.id ?? null,
          staleOptimizationContext: !hasFreshOptimizationContext && Boolean(latestOptimizationEvent)
        }
      };
    }),
    create: protectedProcedure.input(routeCreateSchema).mutation(async ({ ctx, input }) => {
      const route = await createRoute(ctx.user.id, input);
      if (route) {
        await recordOperationalEvent(ctx.user.id, {
          type: "route_created",
          severity: "info",
          source: "routes.create",
          title: "Rota criada",
          routeId: route.id,
          message: route.name,
          metadata: { mode: input.mode }
        });
      }
      return route;
    }),
    createAndOptimize: protectedProcedure.input(routeCreateSchema.extend({
      stops: z2.array(stopCreateSchema).min(2),
      respectInputSequence: z2.boolean().optional()
    })).mutation(async ({ ctx, input }) => {
      const { stops: stops2, respectInputSequence, ...routeInput } = input;
      const route = await createRoute(ctx.user.id, routeInput);
      if (!route) {
        throw new TRPCError3({
          code: "INTERNAL_SERVER_ERROR",
          message: "N\xE3o foi poss\xEDvel criar a rota."
        });
      }
      try {
        await createStops(route.id, stops2);
        const optimized = await optimizeUserRoute(route.id, ctx.user.id, input.mode, {
          respectInputSequence
        });
        const updatedRoute = await getRouteById(route.id, ctx.user.id);
        await recordOperationalEvent(ctx.user.id, {
          type: "route_optimized",
          severity: "info",
          source: "routes.createAndOptimize",
          title: "Rota criada e otimizada",
          routeId: route.id,
          message: route.name,
          metadata: {
            stops: stops2.length,
            mode: input.mode,
            respectInputSequence: Boolean(respectInputSequence),
            totalDistance: optimized.totalDistance,
            totalTime: optimized.totalTime,
            auditSource: optimized.auditSource,
            auditStatus: optimized.audit?.status,
            auditScore: optimized.audit?.score,
            auditIssueCount: optimized.audit?.issueCount,
            auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
            auditRequireStartLocation: true
          }
        });
        await recordRouteAuditEvent(
          ctx.user.id,
          route.id,
          optimized.audit,
          optimized.auditSource
        );
        return {
          route: updatedRoute ?? route,
          optimization: optimized
        };
      } catch (error) {
        console.error("[Routes] Optimization failed after route creation:", error);
        await recordOperationalEvent(ctx.user.id, {
          type: "route_optimization_failed",
          severity: "error",
          source: "routes.createAndOptimize",
          title: "Falha ao otimizar rota",
          routeId: route.id,
          message: error instanceof Error ? error.message : "Erro desconhecido",
          metadata: {
            stops: stops2.length,
            mode: input.mode,
            respectInputSequence: Boolean(respectInputSequence)
          }
        });
        await updateRoute(route.id, ctx.user.id, {
          status: "draft",
          totalDistance: 0,
          totalTime: 0
        });
        const savedRoute = await getRouteById(route.id, ctx.user.id);
        return {
          route: savedRoute ?? route,
          optimization: null,
          warning: error instanceof Error ? `A rota foi salva como rascunho, mas n\xE3o foi poss\xEDvel otimizar agora. ${error.message}` : "A rota foi salva como rascunho, mas n\xE3o foi poss\xEDvel otimizar agora. Abra a rota e tente otimizar novamente."
        };
      }
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      name: z2.string().optional(),
      description: z2.string().optional(),
      mode: routeModeSchema.optional(),
      totalDistance: z2.number().optional(),
      totalTime: z2.number().optional(),
      status: z2.enum(["draft", "optimized", "completed", "cancelled"]).optional(),
      startLocation: z2.string().nullable().optional(),
      startLatitude: z2.number().nullable().optional(),
      startLongitude: z2.number().nullable().optional(),
      endLocation: z2.string().nullable().optional(),
      endLatitude: z2.number().nullable().optional(),
      endLongitude: z2.number().nullable().optional()
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateRoute(id, ctx.user.id, data);
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(
      ({ ctx, input }) => deleteRoute(input.id, ctx.user.id)
    ),
    optimize: protectedProcedure.input(z2.object({
      id: z2.number(),
      mode: routeModeSchema.optional(),
      localityMode: localityModeSchema.optional(),
      startLatitude: z2.number().optional(),
      startLongitude: z2.number().optional()
    })).mutation(async ({ ctx, input }) => {
      const startLocation = Number.isFinite(input.startLatitude) && Number.isFinite(input.startLongitude) ? {
        latitude: Number(input.startLatitude),
        longitude: Number(input.startLongitude),
        address: "Local atual do motorista"
      } : void 0;
      const optimized = await optimizeUserRoute(input.id, ctx.user.id, input.mode, {
        startLocation,
        localityMode: input.localityMode
      });
      await recordOperationalEvent(ctx.user.id, {
        type: input.localityMode === "strict" ? "route_user_requested_better_sequence" : "route_reoptimized",
        severity: input.localityMode === "strict" ? "warning" : "info",
        source: "routes.optimize",
        title: input.localityMode === "strict" ? "Usu\xE1rio pediu sequ\xEAncia melhor" : "Rota reotimizada",
        routeId: input.id,
        metadata: {
          mode: input.mode,
          localityMode: input.localityMode,
          totalDistance: optimized.totalDistance,
          totalTime: optimized.totalTime,
          startedFromCurrentLocation: Boolean(startLocation),
          auditSource: optimized.auditSource,
          auditStatus: optimized.audit?.status,
          auditScore: optimized.audit?.score,
          auditIssueCount: optimized.audit?.issueCount,
          auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
          auditRequireStartLocation: true
        }
      });
      await recordRouteAuditEvent(
        ctx.user.id,
        input.id,
        optimized.audit,
        optimized.auditSource
      );
      return optimized;
    }),
    optimizeRemaining: protectedProcedure.input(z2.object({
      id: z2.number(),
      mode: routeModeSchema.optional(),
      excludeStopIds: z2.array(z2.number()).default([]),
      localityMode: localityModeSchema.optional(),
      startLatitude: z2.number().optional(),
      startLongitude: z2.number().optional()
    })).mutation(async ({ ctx, input }) => {
      const hasStartLocation = Number.isFinite(input.startLatitude) && Number.isFinite(input.startLongitude);
      if (input.excludeStopIds.length === 0 && !hasStartLocation) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhuma parada conclu\xEDda foi informada para deixar fora."
        });
      }
      const startLocation = hasStartLocation ? {
        latitude: Number(input.startLatitude),
        longitude: Number(input.startLongitude),
        address: "Local atual do motorista"
      } : void 0;
      const optimized = await optimizeUserRoute(input.id, ctx.user.id, input.mode, {
        excludeStopIds: input.excludeStopIds,
        startLocation,
        localityMode: input.localityMode
      });
      await recordOperationalEvent(ctx.user.id, {
        type: "route_remaining_reoptimized",
        severity: "info",
        source: "routes.optimizeRemaining",
        title: "Restantes reotimizadas",
        routeId: input.id,
        metadata: {
          excludedStops: input.excludeStopIds.length,
          localityMode: input.localityMode,
          totalDistance: optimized.totalDistance,
          totalTime: optimized.totalTime,
          startedFromCurrentLocation: Boolean(startLocation),
          auditSource: optimized.auditSource,
          auditStatus: optimized.audit?.status,
          auditScore: optimized.audit?.score,
          auditIssueCount: optimized.audit?.issueCount,
          auditUsedRoadMetrics: optimized.auditSource?.startsWith("road-"),
          auditRequireStartLocation: true
        }
      });
      await recordRouteAuditEvent(
        ctx.user.id,
        input.id,
        optimized.audit,
        optimized.auditSource
      );
      return optimized;
    })
  }),
  stops: router({
    list: protectedProcedure.input(z2.object({ routeId: z2.number() })).query(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      return getRouteStops(input.routeId);
    }),
    create: protectedProcedure.input(z2.object({
      routeId: z2.number(),
      stops: z2.array(stopCreateSchema)
    })).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      const createdStops = await createStops(input.routeId, input.stops);
      await updateRoute(input.routeId, ctx.user.id, { status: "draft" });
      return createdStops;
    }),
    update: protectedProcedure.input(stopUpdateSchema).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      const updatedStop = await updateStop(input.routeId, input.stopId, {
        address: input.address.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        sequence: input.sequence,
        notes: input.notes?.trim() || null
      });
      if (!updatedStop) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Parada n\xE3o encontrada."
        });
      }
      await updateRoute(input.routeId, ctx.user.id, { status: "draft" });
      return updatedStop;
    }),
    delete: protectedProcedure.input(z2.object({
      routeId: z2.number(),
      stopId: z2.number()
    })).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      const deleted = await deleteStop(input.routeId, input.stopId);
      if (!deleted) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Parada n\xE3o encontrada."
        });
      }
      await updateRoute(input.routeId, ctx.user.id, { status: "draft" });
      return { success: true };
    })
  }),
  analytics: router({
    stats: protectedProcedure.input(z2.object({ days: z2.number().default(30) })).query(
      ({ ctx, input }) => getUserStats(ctx.user.id, input.days)
    ),
    timeline: protectedProcedure.input(z2.object({ days: z2.number().default(30) })).query(
      ({ ctx, input }) => getRouteStatsOverTime(ctx.user.id, input.days)
    )
  }),
  chat: router({
    history: protectedProcedure.input(z2.object({ routeId: z2.number().optional() })).query(async ({ ctx, input }) => {
      if (input.routeId !== void 0) {
        await requireUserRoute(input.routeId, ctx.user.id);
      }
      return getUserChatHistory(ctx.user.id, input.routeId);
    }),
    send: protectedProcedure.input(z2.object({
      routeId: z2.number().optional(),
      content: z2.string().min(1)
    })).mutation(async ({ ctx, input }) => {
      if (input.routeId !== void 0) {
        await requireUserRoute(input.routeId, ctx.user.id);
      }
      return addChatMessage(ctx.user.id, {
        routeId: input.routeId,
        role: "user",
        content: input.content
      });
    }),
    respond: protectedProcedure.input(z2.object({
      routeId: z2.number().optional(),
      content: z2.string().min(1)
    })).mutation(async ({ ctx, input }) => {
      if (input.routeId !== void 0) {
        await requireUserRoute(input.routeId, ctx.user.id);
      }
      const history = await getUserChatHistory(ctx.user.id, input.routeId);
      const previousMessages = formatChatHistory(history);
      const response = await chatWithLLM(
        ctx.user.id,
        input.content,
        input.routeId,
        previousMessages
      );
      await addChatMessage(ctx.user.id, {
        routeId: input.routeId,
        role: "user",
        content: input.content
      });
      await addChatMessage(ctx.user.id, {
        routeId: input.routeId,
        role: "assistant",
        content: response
      });
      return response;
    })
  }),
  imile: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const integration = await getUserIntegration(ctx.user.id, IMILE_PROVIDER);
      const overrides = integration ? await getUserImileOverrides(ctx.user.id) : void 0;
      return {
        ...getImileConnectionStatus(overrides),
        userCredentialConfigured: Boolean(integration)
      };
    }),
    credential: protectedProcedure.query(async ({ ctx }) => {
      const integration = await getUserIntegration(ctx.user.id, IMILE_PROVIDER);
      return {
        configured: Boolean(integration),
        label: integration?.label ?? "",
        baseUrl: integration?.baseUrl ?? "",
        fallbackBaseUrls: integration?.fallbackBaseUrls ?? "",
        deliveriesPath: integration?.deliveriesPath ?? "",
        authHeader: integration?.authHeader ?? "Authorization",
        country: integration?.country ?? "BRA",
        lang: integration?.lang ?? "pt-BR",
        resourceCode: integration?.resourceCode ?? "BRA",
        timezone: integration?.timezone ?? "America/Sao_Paulo",
        hubCode: integration?.hubCode ?? "",
        appVersion: integration?.appVersion ?? "2.2.78",
        sourceName: integration?.sourceName ?? "REDeliveryApp"
      };
    }),
    saveCredential: protectedProcedure.input(imileCredentialInput).mutation(async ({ ctx, input }) => {
      const existing = await getUserIntegration(ctx.user.id, IMILE_PROVIDER);
      const authToken = input.authToken.trim();
      const authTokenEncrypted = authToken ? encryptIntegrationSecret(authToken) : existing?.authTokenEncrypted;
      if (!authTokenEncrypted) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Informe o token/API key do Rider Delivery."
        });
      }
      await upsertUserIntegration(ctx.user.id, IMILE_PROVIDER, {
        label: cleanText(input.label) ?? "Rider Delivery",
        baseUrl: cleanText(input.baseUrl),
        fallbackBaseUrls: cleanText(input.fallbackBaseUrls),
        deliveriesPath: cleanText(input.deliveriesPath),
        authHeader: cleanText(input.authHeader) ?? "Authorization",
        authTokenEncrypted,
        country: cleanText(input.country) ?? "BRA",
        lang: cleanText(input.lang) ?? "pt-BR",
        resourceCode: cleanText(input.resourceCode) ?? "BRA",
        timezone: cleanText(input.timezone) ?? "America/Sao_Paulo",
        hubCode: cleanText(input.hubCode),
        appVersion: cleanText(input.appVersion) ?? "2.2.78",
        sourceName: cleanText(input.sourceName) ?? "REDeliveryApp",
        isActive: true
      });
      return { configured: true };
    }),
    deleteCredential: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteUserIntegration(ctx.user.id, IMILE_PROVIDER);
      return { configured: false };
    }),
    deliveries: protectedProcedure.input(z2.object({
      dateFrom: z2.string().optional(),
      dateTo: z2.string().optional(),
      status: z2.string().optional()
    })).query(async ({ ctx, input }) => {
      const overrides = await getUserImileOverrides(ctx.user.id);
      return fetchImileDeliveries(input, overrides);
    })
  }),
  schedules: router({
    list: protectedProcedure.query(
      ({ ctx }) => getUserSchedules(ctx.user.id)
    ),
    get: protectedProcedure.input(z2.object({ id: z2.number() })).query(
      ({ ctx, input }) => getScheduleById(input.id, ctx.user.id)
    ),
    create: protectedProcedure.input(z2.object({
      routeId: z2.number(),
      recurrenceType: z2.enum(["once", "daily", "weekly"]),
      scheduledDate: z2.date(),
      scheduledTime: z2.string().optional(),
      daysOfWeek: z2.string().optional(),
      nextExecution: z2.date().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      return createSchedule(ctx.user.id, input);
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      isActive: z2.boolean().optional(),
      nextExecution: z2.date().optional()
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateSchedule(id, ctx.user.id, data);
    })
  }),
  history: router({
    list: protectedProcedure.input(z2.object({ limit: z2.number().default(50), offset: z2.number().default(0) })).query(
      ({ ctx, input }) => getUserRouteHistory(ctx.user.id, input.limit, input.offset)
    ),
    getByRoute: protectedProcedure.input(z2.object({ routeId: z2.number() })).query(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      return getRouteHistory(input.routeId, ctx.user.id);
    }),
    create: protectedProcedure.input(z2.object({
      routeId: z2.number(),
      actualDistance: z2.number().optional(),
      actualTime: z2.number().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      return createHistory(ctx.user.id, input);
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      status: z2.enum(["in_progress", "completed", "cancelled"]).optional(),
      actualDistance: z2.number().optional(),
      actualTime: z2.number().optional(),
      storageKey: z2.string().optional()
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateHistory(id, ctx.user.id, data);
    }),
    export: protectedProcedure.input(z2.object({
      format: z2.enum(["pdf", "csv"]),
      fileName: z2.string().min(1)
    })).mutation(async ({ ctx, input }) => {
      const { exportHistoryToS3: exportHistoryToS32 } = await Promise.resolve().then(() => (init_export(), export_exports));
      return exportHistoryToS32(
        ctx.user.id,
        input.format,
        input.fileName,
        ctx.user.name || "Usu\xE1rio"
      );
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/index.ts
init_env();

// server/_core/static.ts
import express from "express";
import fs2 from "fs";
import path2 from "path";
function serveStatic(app2) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/monitoring.ts
init_db();
var MONITOR_DEDUP_WINDOW_MS = 10 * 60 * 1e3;
var lastIssueKey = "";
var lastIssueAt = 0;
var pendingOutage = null;
function getDatabaseState(database) {
  if (!database?.configured) return "unconfigured";
  if (database.connected) return "connected";
  if (database.reachable) return "schema_failed";
  return "unreachable";
}
function buildIssueKey(input) {
  const databaseState = getDatabaseState(input.database);
  const dbError = input.database?.error || input.database?.schema?.error || "";
  const fallbackError = input.fallbackStore?.error || "";
  return [
    input.storageAvailable ? "ok" : "down",
    databaseState,
    dbError,
    fallbackError
  ].join("|");
}
function buildMetadata(input) {
  return {
    source: input.source,
    storageAvailable: input.storageAvailable,
    database: {
      configured: Boolean(input.database?.configured),
      reachable: Boolean(input.database?.reachable),
      connected: Boolean(input.database?.connected),
      ssl: Boolean(input.database?.ssl),
      error: input.database?.error ?? null,
      schema: input.database?.schema ?? null,
      pool: input.database?.pool ?? null
    },
    fallbackStore: {
      configured: Boolean(input.fallbackStore?.configured),
      loaded: Boolean(input.fallbackStore?.loaded),
      error: input.fallbackStore?.error ?? null
    }
  };
}
async function persistMonitorEvent(input) {
  try {
    await createOperationalEvent({
      userId: null,
      type: input.type,
      severity: input.severity,
      source: "system.monitor",
      title: input.title,
      message: input.message,
      runtime: "server",
      metadata: input.metadata
    });
    return true;
  } catch (error) {
    console.warn("[Monitor] Failed to persist monitor event:", error);
    return false;
  }
}
async function recordHealthObservation(input) {
  const now = Date.now();
  const observedAt = new Date(now).toISOString();
  const issueKey = buildIssueKey(input);
  const metadata = {
    ...buildMetadata(input),
    mode: input.mode,
    observedAt
  };
  if (input.storageAvailable) {
    if (!pendingOutage) {
      lastIssueKey = "";
      return;
    }
    const outage = pendingOutage;
    pendingOutage = null;
    lastIssueKey = "";
    await persistMonitorEvent({
      type: "system_health_recovered",
      severity: "info",
      title: "Armazenamento recuperado",
      message: `O armazenamento voltou a responder. Falha anterior: ${outage.message}`,
      metadata: {
        ...metadata,
        previousOutage: outage,
        recoveredAt: observedAt
      }
    });
    return;
  }
  const message = input.database?.error || input.database?.schema?.error || input.fallbackStore?.error || "Armazenamento indisponivel.";
  pendingOutage = pendingOutage ? {
    ...pendingOutage,
    lastSeenAt: observedAt,
    message,
    metadata
  } : {
    key: issueKey,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    message,
    metadata
  };
  console.warn("[Monitor] Storage unavailable:", {
    mode: input.mode,
    source: input.source,
    message
  });
  if (issueKey === lastIssueKey && now - lastIssueAt < MONITOR_DEDUP_WINDOW_MS) {
    return;
  }
  lastIssueKey = issueKey;
  lastIssueAt = now;
  await persistMonitorEvent({
    type: "system_health_failed",
    severity: input.database?.reachable ? "error" : "fatal",
    title: "Armazenamento indisponivel",
    message,
    metadata
  });
}

// server/_core/index.ts
init_db();
var execFileAsync = promisify2(execFile);
var imileCaptureRunPromise = null;
function getLocalImileCapturePath() {
  return path3.resolve(
    process.cwd(),
    ".tmp",
    "imile-capture",
    "imile-capture-merged.xml"
  );
}
async function runLocalImileCapture() {
  const scriptPath = path3.resolve(process.cwd(), "scripts", "capture-imile-screen.mjs");
  await execFileAsync(process.execPath, [scriptPath, "--pages=130", "--delay=700"], {
    cwd: process.cwd(),
    maxBuffer: 5 * 1024 * 1024,
    timeout: 12 * 60 * 1e3,
    windowsHide: true
  });
  const capturePath = getLocalImileCapturePath();
  if (!fs3.existsSync(capturePath)) {
    throw new Error("Captura finalizada, mas o XML consolidado nao foi encontrado.");
  }
  return fs3.readFileSync(capturePath, "utf8");
}
function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/$/, "");
  }
}
function parseAllowedOrigins() {
  const configuredOrigins = [
    ENV.publicAppUrl,
    ...ENV.allowedOrigins.split(",")
  ].map((origin) => origin.trim()).filter(Boolean).map(normalizeOrigin);
  return /* @__PURE__ */ new Set([
    ...configuredOrigins,
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost"
  ]);
}
function normalizeCaptureOwner(value) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9@._+-]+/g, "-") || "";
}
function getCaptureKeys(owner) {
  const normalizedOwner = normalizeCaptureOwner(owner);
  return {
    userKey: normalizedOwner ? `imile-capture:user:${normalizedOwner}` : "",
    globalKey: "imile-capture:global"
  };
}
async function getAuthenticatedCaptureOwner(req) {
  try {
    const user = await sdk.authenticateRequest(req);
    return normalizeCaptureOwner(user.email || user.openId || String(user.id));
  } catch {
    return "";
  }
}
function isLocalDevelopmentOrigin(origin) {
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
    throw new Error("JWT_SECRET must have at least 32 characters in production");
  }
  if (process.env.VITE_ENABLE_DEV_LOGIN === "true") {
    throw new Error("VITE_ENABLE_DEV_LOGIN cannot be true in production");
  }
  if (ENV.allowEphemeralDb && !hasPersistentFallbackDbConfigured() && !ENV.databaseUrl) {
    throw new Error(
      "ALLOW_EPHEMERAL_DB cannot be the only production storage. Configure a managed database or Upstash Redis."
    );
  }
}
async function getStorageHealthSnapshot(source) {
  const database = await getDatabaseHealth();
  if (!database.connected) {
    try {
      await ensurePersistentFallbackDbLoaded();
    } catch {
    }
  }
  const fallbackStore = getPersistentFallbackDbHealth();
  const canUseLocalFallback = !ENV.isProduction || ENV.allowEphemeralDb && !ENV.hasInvalidProductionDatabaseUrl;
  const storageAvailable = ENV.requireManagedDatabase ? database.connected : database.connected || fallbackStore.loaded || canUseLocalFallback;
  const mode = database.connected ? "persistent" : fallbackStore.configured ? "redis-fallback" : "local-fallback";
  await recordHealthObservation({
    database,
    fallbackStore,
    storageAvailable,
    mode,
    source
  });
  return {
    database,
    fallbackStore,
    storageAvailable,
    mode
  };
}
function createApp(options = {}) {
  validateProductionEnvironment();
  const app2 = express2();
  const allowedOrigins = parseAllowedOrigins();
  const shouldServeClient = options.serveClient ?? true;
  app2.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigin = origin && (allowedOrigins.has(origin) || !ENV.isProduction && isLocalDevelopmentOrigin(origin));
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
  app2.get("/assets/*", (req, res, next) => {
    if (!req.path.endsWith(".js")) {
      next();
      return;
    }
    res.status(200).type("application/javascript").setHeader("Cache-Control", "no-store, max-age=0").send(`
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
  app2.get("/api/health", async (_req, res) => {
    const { database, fallbackStore, storageAvailable, mode } = await getStorageHealthSnapshot("api.health");
    res.status(storageAvailable ? 200 : 500).json({
      ok: storageAvailable,
      app: "EconoRota",
      environment: ENV.isProduction ? "production" : "development",
      mode,
      database,
      fallbackStore,
      requiredManagedDatabase: ENV.requireManagedDatabase,
      warning: ENV.hasInvalidProductionDatabaseUrl ? "DATABASE_URL aponta para host local/Docker e n\xE3o funciona em Vercel. Configure MySQL gerenciado ou remova DATABASE_URL e use Upstash Redis." : void 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/monitor/ping", async (_req, res) => {
    const { database, fallbackStore, storageAvailable, mode } = await getStorageHealthSnapshot("api.monitor.ping");
    res.status(storageAvailable ? 200 : 500).json({
      ok: storageAvailable,
      monitor: true,
      app: "EconoRota",
      environment: ENV.isProduction ? "production" : "development",
      mode,
      database,
      fallbackStore,
      requiredManagedDatabase: ENV.requireManagedDatabase,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/app-update/android", (_req, res) => {
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
      minimumSupportedVersion: ENV.androidMinimumSupportedVersion.trim() || void 0,
      message: ENV.androidUpdateMessage.trim() || void 0,
      publishedAt: ENV.androidUpdatePublishedAt.trim() || void 0
    });
  });
  app2.get("/api/imile/capture/latest", async (req, res) => {
    const owner = await getAuthenticatedCaptureOwner(req);
    if (!owner) {
      res.status(401).json({
        message: "Entre no EconoRota para importar a captura iMile."
      });
      return;
    }
    const { userKey, globalKey } = getCaptureKeys(owner);
    const storedCapture = (userKey ? await getPersistentValue(userKey) : null) ?? await getPersistentValue(globalKey);
    if (storedCapture) {
      res.type("application/xml").send(storedCapture);
      return;
    }
    const capturePath = getLocalImileCapturePath();
    if (!fs3.existsSync(capturePath)) {
      res.status(404).json({
        message: "Nenhuma captura iMile encontrada. Rode a captura no Android antes de importar."
      });
      return;
    }
    res.type("application/xml").send(fs3.readFileSync(capturePath, "utf8"));
  });
  app2.post("/api/imile/capture/run", async (_req, res) => {
    if (process.env.VERCEL) {
      res.status(501).json({
        message: "Captura automatica exige Android conectado via ADB no computador local. No Vercel/iPhone, use envio ou importacao da captura."
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
      const message = error instanceof Error ? error.message : "Falha ao capturar a tela do Rider Delivery.";
      res.status(500).json({ message });
    }
  });
  app2.post(
    "/api/imile/capture/latest",
    express2.text({ limit: "15mb", type: ["application/xml", "text/xml", "text/plain", "*/*"] }),
    async (req, res) => {
      const uploadToken = req.headers["x-imile-capture-token"];
      const hasValidUploadToken = ENV.imileCaptureUploadToken && typeof uploadToken === "string" && uploadToken === ENV.imileCaptureUploadToken;
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
        bytes: Buffer.byteLength(capture, "utf8")
      });
    }
  );
  app2.use(express2.json({ limit: "50mb" }));
  app2.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  registerGeocodingProxy(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (shouldServeClient && process.env.NODE_ENV !== "development") {
    serveStatic(app2);
  }
  return app2;
}

// server/_vercel/index.ts
var app = createApp({ serveClient: false });
function normalizeVercelRewriteUrl(req) {
  const currentUrl = new URL(req.url || "/", "http://vercel.local");
  const route = currentUrl.searchParams.get("__route");
  if (!route) return;
  const path4 = currentUrl.searchParams.get("path")?.replace(/^\/+/, "") ?? "";
  const prefix = route === "manus-storage" ? "/manus-storage" : route === "asset-missing" ? "/assets" : "/api";
  currentUrl.searchParams.delete("__route");
  currentUrl.searchParams.delete("path");
  const normalizedPath = path4 ? `${prefix}/${path4}` : prefix;
  const query = currentUrl.searchParams.toString();
  req.url = query ? `${normalizedPath}?${query}` : normalizedPath;
}
async function handler(req, res) {
  normalizeVercelRewriteUrl(req);
  try {
    return app(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Serverless function failed";
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        app: "EconoRota",
        error: message
      })
    );
  }
}
export {
  handler as default
};
