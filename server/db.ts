import { eq, and, desc, asc, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import type { PoolOptions, RowDataPacket } from "mysql2/promise";
import {
  InsertUser,
  type InsertUserIntegration,
  users,
  routes,
  stops,
  routeSchedules,
  routeHistory,
  chatHistory,
  userIntegrations,
  operationalEvents,
  routeMetrics,
  osrmMatrixCache,
  optimizationJobs,
  performanceBenchmarks,
  adminDashboardMetrics,
  geocodeCache,
  addressCorrections,
  locationCommercialCache,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  calculateGeocodingConfidence,
  summarizeGeocodingConfidence,
  type GeocodingMethod,
} from "../shared/geocodingConfidence";
import {
  normalizeStopMetadata,
  normalizeStopSourceProvider,
  type StopMetadata,
  type StopSourceProvider,
} from "../shared/stopMetadata";

let _db: any = null;
let _pool: mysql.Pool | null = null;
let _lastDbConnectAttempt = 0;
let _lastDbConnectionError: string | null = null;

const DB_CONNECT_RETRY_MS = 30_000;
const LOCAL_DB_DIR = path.join(process.cwd(), ".data");
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, "routing-pwa-db.json");
const FALLBACK_DB_KEY =
  process.env.FALLBACK_DB_KEY || "econorotas:fallback-db:v1";
const FALLBACK_KV_PREFIX =
  process.env.FALLBACK_KV_PREFIX || "econorotas:kv:v1:";
let localDbLoaded = false;
let remoteDbLoaded = false;
let remoteDbLoadPromise: Promise<void> | null = null;
let lastRemoteFallbackError: string | null = null;

const memory = {
  users: [] as any[],
  routes: [] as any[],
  stops: [] as any[],
  routeSchedules: [] as any[],
  routeHistory: [] as any[],
  chatHistory: [] as any[],
  userIntegrations: [] as any[],
  operationalEvents: [] as any[],
  routeMetrics: [] as any[],
  optimizationJobs: [] as any[],
  performanceBenchmarks: [] as any[],
  geocodeCache: [] as any[],
  addressCorrections: [] as any[],
  locationCommercialCache: [] as any[],
  ids: {
    users: 1,
    routes: 1,
    stops: 1,
    routeSchedules: 1,
    routeHistory: 1,
    chatHistory: 1,
    userIntegrations: 1,
    operationalEvents: 1,
    routeMetrics: 1,
    optimizationJobs: 1,
    performanceBenchmarks: 1,
    geocodeCache: 1,
    addressCorrections: 1,
    locationCommercialCache: 1,
  },
};

function shouldPersistLocalDb() {
  return (
    (!ENV.isProduction || ENV.allowEphemeralDb) &&
    process.env.NODE_ENV !== "test" &&
    process.env.VITEST !== "true"
  );
}

function getRedisRestConfig() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";

  if (!url || !token) return null;

  return {
    url: url.replace(/\/+$/, ""),
    token,
  };
}

export function hasPersistentFallbackDbConfigured() {
  if (ENV.isProduction && ENV.requireManagedDatabase) return false;
  return Boolean(getRedisRestConfig());
}

export function getPersistentFallbackDbHealth() {
  return {
    configured: hasPersistentFallbackDbConfigured(),
    loaded: remoteDbLoaded,
    error: lastRemoteFallbackError,
  };
}

export async function ensurePersistentFallbackDbLoaded() {
  if (ENV.isProduction && ENV.requireManagedDatabase) return;
  if (!hasPersistentFallbackDbConfigured()) return;
  await loadRemoteDb();
}

function hydrateMemory(data: any) {
  memory.users = Array.isArray(data.users) ? data.users : [];
  memory.routes = Array.isArray(data.routes) ? data.routes : [];
  memory.stops = Array.isArray(data.stops) ? data.stops : [];
  memory.routeSchedules = Array.isArray(data.routeSchedules)
    ? data.routeSchedules
    : [];
  memory.routeHistory = Array.isArray(data.routeHistory) ? data.routeHistory : [];
  memory.chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
  memory.userIntegrations = Array.isArray(data.userIntegrations) ? data.userIntegrations : [];
  memory.operationalEvents = Array.isArray(data.operationalEvents) ? data.operationalEvents : [];
  memory.routeMetrics = Array.isArray(data.routeMetrics) ? data.routeMetrics : [];
  memory.optimizationJobs = Array.isArray(data.optimizationJobs) ? data.optimizationJobs : [];
  memory.performanceBenchmarks = Array.isArray(data.performanceBenchmarks) ? data.performanceBenchmarks : [];
  memory.geocodeCache = Array.isArray(data.geocodeCache) ? data.geocodeCache : [];
  memory.addressCorrections = Array.isArray(data.addressCorrections) ? data.addressCorrections : [];
  memory.locationCommercialCache = Array.isArray(data.locationCommercialCache) ? data.locationCommercialCache : [];
  memory.ids = {
    users: Number(data.ids?.users) || 1,
    routes: Number(data.ids?.routes) || 1,
    stops: Number(data.ids?.stops) || 1,
    routeSchedules: Number(data.ids?.routeSchedules) || 1,
    routeHistory: Number(data.ids?.routeHistory) || 1,
    chatHistory: Number(data.ids?.chatHistory) || 1,
    userIntegrations: Number(data.ids?.userIntegrations) || 1,
    operationalEvents: Number(data.ids?.operationalEvents) || 1,
    routeMetrics: Number(data.ids?.routeMetrics) || 1,
    optimizationJobs: Number(data.ids?.optimizationJobs) || 1,
    performanceBenchmarks: Number(data.ids?.performanceBenchmarks) || 1,
    geocodeCache: Number(data.ids?.geocodeCache) || 1,
    addressCorrections: Number(data.ids?.addressCorrections) || 1,
    locationCommercialCache: Number(data.ids?.locationCommercialCache) || 1,
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

async function callRedisCommand(command: unknown[]) {
  const config = getRedisRestConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(
      payload?.error || `Redis fallback respondeu HTTP ${response.status}`
    );
  }

  return payload?.result;
}

function getLocalKvPath(key: string) {
  const safeName = Buffer.from(key).toString("base64url");
  return path.join(LOCAL_DB_DIR, "kv", `${safeName}.txt`);
}

export async function getPersistentValue(key: string) {
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

export async function setPersistentValue(key: string, value: string) {
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

// ==================== GEOCODING CACHE ====================

export type GeocodeCacheHit = {
  cacheKey: string;
  query: string;
  provider: string;
  resultCount: number;
  results: unknown;
  expiresAt: Date | string;
};

function parseGeocodeResults(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function getGeocodeCache(cacheKey: string): Promise<GeocodeCacheHit | null> {
  const now = new Date();

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cached = memory.geocodeCache.find(
        (item) => item.cacheKey === cacheKey && new Date(item.expiresAt) > now
      );
      if (!cached) return null;
      cached.hitCount = Number(cached.hitCount || 0) + 1;
      await persistFallbackDb();
      return {
        cacheKey: cached.cacheKey,
        query: cached.query,
        provider: cached.provider,
        resultCount: Number(cached.resultCount || 0),
        results: parseGeocodeResults(cached.results),
        expiresAt: cached.expiresAt,
      };
    }
    return null;
  }

  const rows = await db
    .select()
    .from(geocodeCache)
    .where(and(eq(geocodeCache.cacheKey, cacheKey), gte(geocodeCache.expiresAt, now)))
    .limit(1);
  const cached = rows[0];
  if (!cached) return null;

  await db
    .update(geocodeCache)
    .set({ hitCount: sql`${geocodeCache.hitCount} + 1` } as any)
    .where(eq(geocodeCache.id, cached.id))
    .catch((error: unknown) => {
      console.warn("[Geocoding] Failed to increment cache hit count:", error);
    });

  return {
    cacheKey: cached.cacheKey,
    query: cached.query,
    provider: cached.provider,
    resultCount: Number(cached.resultCount || 0),
    results: parseGeocodeResults(cached.results),
    expiresAt: cached.expiresAt,
  };
}

export async function setGeocodeCache(data: {
  cacheKey: string;
  query: string;
  provider?: string;
  results: unknown;
  expiresAt: Date;
}) {
  const results = Array.isArray(data.results) ? data.results : [];
  const payload = {
    cacheKey: data.cacheKey.slice(0, 191),
    query: data.query.slice(0, 700),
    provider: (data.provider || "nominatim").slice(0, 64),
    resultCount: results.length,
    results,
    expiresAt: data.expiresAt,
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existingIndex = memory.geocodeCache.findIndex(
        (item) => item.cacheKey === payload.cacheKey
      );
      const next = {
        id:
          existingIndex >= 0
            ? memory.geocodeCache[existingIndex].id
            : memory.ids.geocodeCache++,
        ...payload,
        hitCount:
          existingIndex >= 0
            ? Number(memory.geocodeCache[existingIndex].hitCount || 0)
            : 0,
        createdAt:
          existingIndex >= 0
            ? memory.geocodeCache[existingIndex].createdAt
            : new Date(),
        updatedAt: new Date(),
      };

      if (existingIndex >= 0) {
        memory.geocodeCache[existingIndex] = next;
      } else {
        memory.geocodeCache.push(next);
      }
      await persistFallbackDb();
    }
    return;
  }

  await db
    .insert(geocodeCache)
    .values(payload as any)
    .onDuplicateKeyUpdate({
      set: {
        query: payload.query,
        provider: payload.provider,
        resultCount: payload.resultCount,
        results: payload.results,
        expiresAt: payload.expiresAt,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      } as any,
    });
}

// ==================== COMMERCIAL LOCATION CACHE ====================

export type CommercialCacheHit = {
  lat: number;
  lng: number;
  radius: number;
  response: unknown;
  createdAt: Date | string;
};

function parseJsonMaybe(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeCacheCoordinate(value: number) {
  return Number(value).toFixed(6);
}

export async function getLocationCommercialCache(data: {
  latitude: number;
  longitude: number;
  radius: number;
  ttlDays?: number;
}): Promise<CommercialCacheHit | null> {
  const lat = normalizeCacheCoordinate(data.latitude);
  const lng = normalizeCacheCoordinate(data.longitude);
  const radius = Math.round(data.radius);
  const cutoff = new Date(Date.now() - (data.ttlDays ?? 30) * 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cached = [...memory.locationCommercialCache]
        .filter(
          (item) =>
            String(item.lat) === lat &&
            String(item.lng) === lng &&
            Number(item.radius) === radius &&
            new Date(item.createdAt) >= cutoff
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (!cached) return null;
      return {
        lat: Number(cached.lat),
        lng: Number(cached.lng),
        radius,
        response: parseJsonMaybe(cached.response),
        createdAt: cached.createdAt,
      };
    }
    return null;
  }

  const rows = await db
    .select()
    .from(locationCommercialCache)
    .where(
      and(
        eq(locationCommercialCache.lat, lat),
        eq(locationCommercialCache.lng, lng),
        eq(locationCommercialCache.radius, radius),
        gte(locationCommercialCache.createdAt, cutoff)
      )
    )
    .orderBy(desc(locationCommercialCache.createdAt))
    .limit(1);
  const cached = rows[0];
  if (!cached) return null;

  return {
    lat: Number(cached.lat),
    lng: Number(cached.lng),
    radius,
    response: parseJsonMaybe(cached.response),
    createdAt: cached.createdAt,
  };
}

export async function setLocationCommercialCache(data: {
  latitude: number;
  longitude: number;
  radius: number;
  response: unknown;
}) {
  const payload = {
    lat: normalizeCacheCoordinate(data.latitude),
    lng: normalizeCacheCoordinate(data.longitude),
    radius: Math.round(data.radius),
    response: data.response,
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      memory.locationCommercialCache.push({
        id: memory.ids.locationCommercialCache++,
        ...payload,
        createdAt: new Date(),
      });
      await persistFallbackDb();
    }
    return;
  }

  await db.insert(locationCommercialCache).values(payload as any);
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
        lastRemoteFallbackError =
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao carregar fallback persistente.";
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
      lastRemoteFallbackError =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao persistir fallback.";
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

  if (
    ENV.isProduction &&
    !ENV.allowEphemeralDb &&
    !hasPersistentFallbackDbConfigured()
  ) {
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

function requireConfiguredDatabase(): never {
  throw new Error(formatDatabaseUnavailableMessage());
}

function shouldUseDatabaseSsl(databaseUrl: string) {
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

  return undefined;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readNonNegativeIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function getMysqlDriverUrl(databaseUrl: string) {
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

function getDatabasePoolOptions(databaseUrl: string): PoolOptions {
  const poolOptions: PoolOptions = {
    uri: getMysqlDriverUrl(databaseUrl),
    waitForConnections: true,
    connectionLimit: readPositiveIntegerEnv("DB_CONNECTION_LIMIT", 5),
    queueLimit: readNonNegativeIntegerEnv("DB_QUEUE_LIMIT", 0),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  if (shouldUseDatabaseSsl(databaseUrl)) {
    poolOptions.ssl = {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      ca: getDatabaseSslCa(),
    };
  }

  return poolOptions;
}

function createDatabasePool(databaseUrl: string) {
  return mysql.createPool(getDatabasePoolOptions(databaseUrl));
}

const REQUIRED_SCHEMA_COLUMNS = [
  ["users", "id"],
  ["users", "openId"],
  ["users", "email"],
  ["users", "role"],
  ["users", "phone"],
  ["routes", "id"],
  ["routes", "userId"],
  ["stops", "routeId"],
  ["stops", "sequence"],
  ["stops", "geocodingConfidenceScore"],
  ["stops", "geocodingMethod"],
  ["stops", "geocodingSuspect"],
  ["stops", "sourceProvider"],
  ["stops", "originalStop"],
  ["stops", "isUnsequencedStop"],
  ["stops", "metadata"],
  ["stops", "commercialDetectionStatus"],
  ["stops", "commercialConfidence"],
  ["stops", "commercialPlaceName"],
  ["stops", "commercialCategory"],
  ["stops", "commercialOpeningHours"],
  ["stops", "commercialSource"],
  ["stops", "commercialLastCheckedAt"],
  ["location_commercial_cache", "lat"],
  ["location_commercial_cache", "lng"],
  ["location_commercial_cache", "radius"],
  ["location_commercial_cache", "response"],
  ["userIntegrations", "authTokenEncrypted"],
  ["operationalEvents", "type"],
  ["operationalEvents", "severity"],
  ["route_metrics", "qualityScore"],
  ["route_metrics", "optimizationRuntimeMs"],
  ["route_metrics", "osrmUsed"],
  ["route_metrics", "issuesCorrectedCount"],
  ["route_metrics", "auditCycles"],
  ["route_metrics", "issuesRemainingCount"],
  ["route_metrics", "batchCorrectionCount"],
  ["route_metrics", "startedAt"],
  ["route_metrics", "completedAt"],
  ["route_metrics", "executionDurationMs"],
  ["route_metrics", "executionStatus"],
  ["route_metrics", "averageGeocodingConfidence"],
  ["route_metrics", "minGeocodingConfidence"],
  ["route_metrics", "suspiciousGeocodingCount"],
  ["route_metrics", "dbFetchMs"],
  ["route_metrics", "clusteringMs"],
  ["route_metrics", "osrmMs"],
  ["route_metrics", "optimizerMs"],
  ["route_metrics", "auditMs"],
  ["route_metrics", "correctionMs"],
  ["route_metrics", "dbSaveMs"],
  ["route_metrics", "totalRuntimeMs"],
  ["route_metrics", "osrmCallCount"],
  ["route_metrics", "osrmFailureCount"],
  ["route_metrics", "osrmTotalMs"],
  ["route_metrics", "osrmAverageMs"],
  ["route_metrics", "osrmProvider"],
  ["route_metrics", "osrmAvailability"],
  ["route_metrics", "osrmLatencyMs"],
  ["route_metrics", "osrmMatrixCount"],
  ["route_metrics", "osrmMatrixSize"],
  ["route_metrics", "osrmFailureReason"],
  ["route_metrics", "matrixCacheHit"],
  ["route_metrics", "matrixCacheMiss"],
  ["route_metrics", "matrixGenerationMs"],
  ["route_metrics", "macroClusterCount"],
  ["route_metrics", "microClusterCount"],
  ["route_metrics", "largestClusterSize"],
  ["osrm_matrix_cache", "matrixHash"],
  ["osrm_matrix_cache", "clusterHash"],
  ["osrm_matrix_cache", "durationMatrix"],
  ["osrm_matrix_cache", "distanceMatrix"],
  ["optimization_jobs", "route_id"],
  ["optimization_jobs", "status"],
  ["optimization_jobs", "queue_wait_ms"],
  ["optimization_jobs", "execution_ms"],
  ["optimization_jobs", "worker_memory_mb"],
  ["optimization_jobs", "peak_memory_mb"],
  ["optimization_jobs", "worker_id"],
  ["optimization_jobs", "worker_hostname"],
  ["optimization_jobs", "worker_started_at"],
  ["optimization_jobs", "worker_finished_at"],
  ["optimization_jobs", "attempt_count"],
  ["optimization_jobs", "max_attempts"],
  ["optimization_jobs", "provider_job_id"],
  ["optimization_jobs", "stack_trace"],
  ["performance_benchmarks", "stop_count"],
  ["performance_benchmarks", "runtime_ms"],
  ["performance_benchmarks", "peak_memory_mb"],
  ["performance_benchmarks", "criteria_met"],
  ["geocode_cache", "cacheKey"],
  ["geocode_cache", "results"],
  ["geocode_cache", "expiresAt"],
  ["address_corrections", "address_hash"],
  ["address_corrections", "original_address"],
  ["address_corrections", "corrected_address"],
  ["address_corrections", "user_id"],
] as const;

async function getDatabaseSchemaHealth() {
  if (!_pool) {
    return {
      ok: false,
      checkedColumns: REQUIRED_SCHEMA_COLUMNS.length,
      missing: REQUIRED_SCHEMA_COLUMNS.map(([table, column]) => `${table}.${column}`),
      error: "Pool MySQL indisponivel.",
    };
  }

  try {
    const [rows] = await _pool.query<RowDataPacket[]>(
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
    const missing = REQUIRED_SCHEMA_COLUMNS
      .map(([table, column]) => `${table}.${column}`)
      .filter((key) => !existing.has(key));

    return {
      ok: missing.length === 0,
      checkedColumns: REQUIRED_SCHEMA_COLUMNS.length,
      missing,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      checkedColumns: REQUIRED_SCHEMA_COLUMNS.length,
      missing: REQUIRED_SCHEMA_COLUMNS.map(([table, column]) => `${table}.${column}`),
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao validar schema.",
    };
  }
}

function sortByDateDesc<T extends Record<string, any>>(items: T[], field: string) {
  return [...items].sort(
    (a, b) => new Date(b[field]).getTime() - new Date(a[field]).getTime()
  );
}

function sortByDateAsc<T extends Record<string, any>>(items: T[], field: string) {
  return [...items].sort(
    (a, b) => new Date(a[field]).getTime() - new Date(b[field]).getTime()
  );
}

function toDateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;
  if (ENV.hasInvalidProductionDatabaseUrl) {
    _lastDbConnectionError =
      "DATABASE_URL usa host local/Docker; configure um MySQL gerenciado acessivel pela Vercel.";
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
    _lastDbConnectionError =
      error instanceof Error ? error.message : "Erro desconhecido ao conectar.";
    _db = null;
    _pool = null;
  }

  return _db;
}

export async function getDatabaseHealth() {
  const configured = Boolean(process.env.DATABASE_URL);

  if (!configured) {
    return {
      configured,
      connected: false,
      ssl: shouldUseDatabaseSsl(""),
      pool: null,
      error: null,
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
      lifecycle: "mysql2-native",
    },
    schema,
    error: _lastDbConnectionError,
  };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.users.find((item) => item.openId === user.openId);
      const now = new Date();
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
        lastSignedIn: user.lastSignedIn ?? now,
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
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {
      openId: user.openId,
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
      "loginMethod",
    ] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.acceptedTermsAt !== undefined) {
      values.acceptedTermsAt = user.acceptedTermsAt;
      updateSet.acceptedTermsAt = user.acceptedTermsAt;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.find((item) => item.openId === openId);
    }

    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.find(
        (item) =>
          typeof item.email === "string" &&
          item.email.trim().toLowerCase() === normalizedEmail
      );
    }

    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.find((item) => item.id === userId);
    }

    console.warn("[Database] Cannot get user by id: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function countUsers() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.users.length;
    }
    requireConfiguredDatabase();
  }

  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  return Number(result[0]?.count || 0);
}

export async function cleanupE2eTestUsers() {
  const db = await getDb();
  const isE2eUser = (user: { email?: string | null; openId?: string | null }) => {
    const email = user.email?.trim().toLowerCase() ?? "";
    const openId = user.openId?.trim().toLowerCase() ?? "";
    return (
      (email.startsWith("codex-e2e-") && email.endsWith("@example.com")) ||
      openId.startsWith("codex-e2e-")
    );
  };

  if (!db) {
    if (await shouldUseMemoryDb()) {
      const deletedUsers = memory.users.filter(isE2eUser);
      memory.users = memory.users.filter((user) => !isE2eUser(user));
      await persistFallbackDb();
      return {
        deletedCount: deletedUsers.length,
        deletedUsers: deletedUsers.map((user) => ({
          id: user.id,
          email: user.email ?? null,
          openId: user.openId ?? null,
        })),
      };
    }
    requireConfiguredDatabase();
  }

  const e2eUserWhere = sql`(${users.email} LIKE 'codex-e2e-%@example.com' OR ${users.openId} LIKE 'codex-e2e-%')`;
  const deletedUsers = await db
    .select({
      id: users.id,
      email: users.email,
      openId: users.openId,
    })
    .from(users)
    .where(e2eUserWhere);

  if (deletedUsers.length > 0) {
    await db.delete(users).where(e2eUserWhere);
  }

  return {
    deletedCount: deletedUsers.length,
    deletedUsers,
  };
}

export async function createPasswordUser(user: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
  phone?: string | null;
  companyName?: string | null;
  city?: string | null;
  state?: string | null;
  vehicleType?: string | null;
  acceptedTermsAt?: Date | null;
}) {
  const now = new Date();
  const values: InsertUser = {
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
    lastSignedIn: now,
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      if (memory.users.some((item) => item.openId === user.openId)) {
        throw new Error("Usuário já existe");
      }
      const created = {
        id: memory.ids.users++,
        ...values,
        createdAt: now,
        updatedAt: now,
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

export async function updateUserProfile(
  userId: number,
  profile: {
    name: string;
    phone: string;
    companyName?: string | null;
    city: string;
    state: string;
    vehicleType: string;
    acceptedTermsAt?: Date | null;
  }
) {
  const db = await getDb();
  const now = new Date();
  const values = {
    name: profile.name,
    phone: profile.phone,
    companyName: profile.companyName ?? null,
    city: profile.city,
    state: profile.state,
    vehicleType: profile.vehicleType,
    acceptedTermsAt: profile.acceptedTermsAt ?? null,
    updatedAt: now,
  };

  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.users.find((item) => item.id === userId);
      if (!existing) return undefined;
      Object.assign(existing, values);
      await persistFallbackDb();
      return existing;
    }
    requireConfiguredDatabase();
  }

  await db.update(users).set(values).where(eq(users.id, userId));
  return getUserById(userId);
}

// ==================== USER INTEGRATIONS ====================

export async function getUserIntegration(userId: number, provider: string) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.userIntegrations.find(
        (item) => item.userId === userId && item.provider === provider && item.isActive !== false
      );
    }

    requireConfiguredDatabase();
  }

  const result = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, provider),
        eq(userIntegrations.isActive, true)
      )
    )
    .limit(1);

  return result[0];
}

export async function upsertUserIntegration(
  userId: number,
  provider: string,
  data: Omit<InsertUserIntegration, "id" | "userId" | "provider" | "createdAt" | "updatedAt">
) {
  const db = await getDb();
  const now = new Date();

  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.userIntegrations.find(
        (item) => item.userId === userId && item.provider === provider
      );
      const nextIntegration = {
        id: existing?.id ?? memory.ids.userIntegrations++,
        userId,
        provider,
        ...data,
        isActive: data.isActive ?? true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      if (existing) {
        Object.assign(existing, nextIntegration);
      } else {
        memory.userIntegrations.push(nextIntegration);
      }

      await persistFallbackDb();
      return nextIntegration;
    }

    requireConfiguredDatabase();
  }

  const existing = await db
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
    .limit(1);

  const values = {
    ...data,
    userId,
    provider,
    isActive: data.isActive ?? true,
  };

  if (existing[0]) {
    await db
      .update(userIntegrations)
      .set(values)
      .where(eq(userIntegrations.id, existing[0].id));
    return getUserIntegration(userId, provider);
  }

  await db.insert(userIntegrations).values(values);
  return getUserIntegration(userId, provider);
}

export async function deleteUserIntegration(userId: number, provider: string) {
  const db = await getDb();

  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existing = memory.userIntegrations.find(
        (item) => item.userId === userId && item.provider === provider
      );
      if (existing) {
        existing.isActive = false;
        existing.updatedAt = new Date();
        await persistFallbackDb();
      }
      return;
    }

    requireConfiguredDatabase();
  }

  await db
    .update(userIntegrations)
    .set({ isActive: false })
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)));
}

// ==================== ROUTES ====================

export async function createRoute(userId: number, data: {
  name: string;
  description?: string;
  mode: "shortest_distance" | "shortest_time" | "balanced";
  startLocation?: string;
  startLatitude?: number;
  startLongitude?: number;
  endLocation?: string;
  endLatitude?: number;
  endLongitude?: number;
}) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = new Date();
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
        updatedAt: now,
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
    startLatitude: data.startLatitude !== undefined ? String(data.startLatitude) : null,
    startLongitude: data.startLongitude !== undefined ? String(data.startLongitude) : null,
    endLocation: data.endLocation ?? null,
    endLatitude: data.endLatitude !== undefined ? String(data.endLatitude) : null,
    endLongitude: data.endLongitude !== undefined ? String(data.endLongitude) : null,
    status: "draft",
  });

  // Fetch the latest created route for this user
  const result = await db.select().from(routes)
    .where(eq(routes.userId, userId))
    .orderBy(desc(routes.createdAt))
    .limit(1);

  return result[0] || null;
}

export async function getRouteById(routeId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return (
        memory.routes.find(
          (route) => route.id === routeId && route.userId === userId
        ) ?? null
      );
    }
    requireConfiguredDatabase();
  }

  const result = await db.select().from(routes)
    .where(and(eq(routes.id, routeId), eq(routes.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getUserRoutes(userId: number, limit = 50, offset = 0) {
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

  return db.select().from(routes)
    .where(eq(routes.userId, userId))
    .orderBy(desc(routes.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateRoute(routeId: number, userId: number, data: Partial<{
  name: string;
  description: string;
  mode: "shortest_distance" | "shortest_time" | "balanced";
  totalDistance: number;
  totalTime: number;
  status: "draft" | "optimized" | "completed" | "cancelled";
  startLocation: string | null;
  startLatitude: number | null;
  startLongitude: number | null;
  endLocation: string | null;
  endLatitude: number | null;
  endLongitude: number | null;
}>) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const route = memory.routes.find(
        (item) => item.id === routeId && item.userId === userId
      );
      if (route) {
        Object.assign(route, data, { updatedAt: new Date() });
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }

  await db.update(routes)
    .set(data as any)
    .where(and(eq(routes.id, routeId), eq(routes.userId, userId)));
}

export async function deleteRoute(routeId: number, userId: number) {
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

  await db.delete(routes)
    .where(and(eq(routes.id, routeId), eq(routes.userId, userId)));
}

// ==================== STOPS ====================

export async function createStops(routeId: number, stopsData: Array<{
  address: string;
  latitude?: number;
  longitude?: number;
  sequence: number;
  notes?: string;
  sourceProvider?: StopSourceProvider | string | null;
  originalStop?: number | null;
  isUnsequencedStop?: boolean | null;
  metadata?: StopMetadata | null;
  geocodingConfidenceScore?: number;
  geocodingMethod?: GeocodingMethod | string;
  geocodingSuspect?: boolean;
  commercialDetectionStatus?: "unknown" | "suspected" | "confirmed";
  commercialConfidence?: number;
  commercialPlaceName?: string | null;
  commercialCategory?: string | null;
  commercialOpeningHours?: string | null;
  commercialSource?: string | null;
  commercialLastCheckedAt?: Date | string | null;
}>) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = new Date();
      const createdStops = stopsData.map((stop) => {
        const confidence = calculateGeocodingConfidence({
          score: stop.geocodingConfidenceScore,
          method: stop.geocodingMethod,
          isManual:
            stop.geocodingConfidenceScore == null &&
            Number.isFinite(Number(stop.latitude)) &&
            Number.isFinite(Number(stop.longitude)) &&
            !(Number(stop.latitude) === 0 && Number(stop.longitude) === 0),
        });

        const metadata = normalizeStopMetadata(stop.metadata);

        return {
          id: memory.ids.stops++,
          routeId,
          address: stop.address,
          latitude: stop.latitude !== undefined ? String(stop.latitude) : null,
          longitude: stop.longitude !== undefined ? String(stop.longitude) : null,
          geocodingConfidenceScore: confidence.score,
          geocodingMethod: confidence.method,
          geocodingSuspect: stop.geocodingSuspect ?? confidence.suspect,
          sequence: stop.sequence,
          notes: stop.notes ?? null,
          sourceProvider: normalizeStopSourceProvider(stop.sourceProvider),
          originalStop: stop.originalStop ?? null,
          isUnsequencedStop: Boolean(stop.isUnsequencedStop),
          metadata: Object.keys(metadata).length ? metadata : null,
          commercialDetectionStatus: stop.commercialDetectionStatus ?? "unknown",
          commercialConfidence: Math.max(0, Math.min(100, Number(stop.commercialConfidence ?? 0))),
          commercialPlaceName: stop.commercialPlaceName ?? null,
          commercialCategory: stop.commercialCategory ?? null,
          commercialOpeningHours: stop.commercialOpeningHours ?? null,
          commercialSource: stop.commercialSource ?? null,
          commercialLastCheckedAt: stop.commercialLastCheckedAt ? new Date(stop.commercialLastCheckedAt) : null,
          createdAt: now,
        };
      });

      memory.stops.push(...createdStops);
      await persistFallbackDb();
      return getRouteStops(routeId);
    }
    requireConfiguredDatabase();
  }

  const values = stopsData.map(s => {
    const confidence = calculateGeocodingConfidence({
      score: s.geocodingConfidenceScore,
      method: s.geocodingMethod,
      isManual:
        s.geocodingConfidenceScore == null &&
        Number.isFinite(Number(s.latitude)) &&
        Number.isFinite(Number(s.longitude)) &&
        !(Number(s.latitude) === 0 && Number(s.longitude) === 0),
    });

    const metadata = normalizeStopMetadata(s.metadata);

    return {
      routeId,
      address: s.address,
      latitude: s.latitude !== undefined ? String(s.latitude) : null,
      longitude: s.longitude !== undefined ? String(s.longitude) : null,
      geocodingConfidenceScore: confidence.score,
      geocodingMethod: confidence.method,
      geocodingSuspect: s.geocodingSuspect ?? confidence.suspect,
      sequence: s.sequence,
      notes: s.notes,
      sourceProvider: normalizeStopSourceProvider(s.sourceProvider),
      originalStop: s.originalStop ?? null,
      isUnsequencedStop: Boolean(s.isUnsequencedStop),
      metadata: Object.keys(metadata).length ? metadata : null,
      commercialDetectionStatus: s.commercialDetectionStatus ?? "unknown",
      commercialConfidence: Math.max(0, Math.min(100, Number(s.commercialConfidence ?? 0))),
      commercialPlaceName: s.commercialPlaceName ?? null,
      commercialCategory: s.commercialCategory ?? null,
      commercialOpeningHours: s.commercialOpeningHours ?? null,
      commercialSource: s.commercialSource ?? null,
      commercialLastCheckedAt: s.commercialLastCheckedAt ? new Date(s.commercialLastCheckedAt) : null,
    };
  });

  await db.insert(stops).values(values as any);
  
  // Return the created stops
  return getRouteStops(routeId);
}

export async function getRouteStops(routeId: number) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return [...memory.stops]
        .filter((stop) => stop.routeId === routeId)
        .sort((a, b) => a.sequence - b.sequence);
    }
    requireConfiguredDatabase();
  }

  return db.select().from(stops)
    .where(eq(stops.routeId, routeId))
    .orderBy(asc(stops.sequence));
}

export async function updateStop(routeId: number, stopId: number, data: Partial<{
  address: string;
  latitude: number | null;
  longitude: number | null;
  sequence: number;
  notes: string | null;
  sourceProvider: StopSourceProvider | string | null;
  originalStop: number | null;
  isUnsequencedStop: boolean | null;
  metadata: StopMetadata | null;
  geocodingConfidenceScore: number;
  geocodingMethod: GeocodingMethod | string;
  geocodingSuspect: boolean;
  commercialDetectionStatus: "unknown" | "suspected" | "confirmed";
  commercialConfidence: number;
  commercialPlaceName: string | null;
  commercialCategory: string | null;
  commercialOpeningHours: string | null;
  commercialSource: string | null;
  commercialLastCheckedAt: Date | string | null;
}>) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const stop = memory.stops.find(
        (item) => item.id === stopId && item.routeId === routeId
      );
      if (!stop) return null;

      const normalizedMetadata =
        data.metadata !== undefined ? normalizeStopMetadata(data.metadata) : undefined;

      Object.assign(stop, {
        ...data,
        sourceProvider:
          data.sourceProvider !== undefined
            ? normalizeStopSourceProvider(data.sourceProvider)
            : stop.sourceProvider,
        originalStop:
          data.originalStop !== undefined ? data.originalStop : stop.originalStop,
        isUnsequencedStop:
          data.isUnsequencedStop !== undefined
            ? Boolean(data.isUnsequencedStop)
            : stop.isUnsequencedStop,
        metadata:
          normalizedMetadata !== undefined
            ? Object.keys(normalizedMetadata).length
              ? normalizedMetadata
              : null
            : stop.metadata,
        latitude:
          data.latitude !== undefined
            ? data.latitude === null
              ? null
              : String(data.latitude)
            : stop.latitude,
        longitude:
          data.longitude !== undefined
            ? data.longitude === null
              ? null
              : String(data.longitude)
            : stop.longitude,
      });
      await persistFallbackDb();
      return stop;
    }
    requireConfiguredDatabase();
  }

  const normalizedMetadata =
    data.metadata !== undefined ? normalizeStopMetadata(data.metadata) : undefined;

  await db.update(stops)
    .set({
      ...data,
      sourceProvider:
        data.sourceProvider !== undefined
          ? normalizeStopSourceProvider(data.sourceProvider)
          : undefined,
      metadata:
        normalizedMetadata !== undefined
          ? Object.keys(normalizedMetadata).length
            ? normalizedMetadata
            : null
          : undefined,
      isUnsequencedStop:
        data.isUnsequencedStop !== undefined
          ? Boolean(data.isUnsequencedStop)
          : undefined,
      latitude:
        data.latitude !== undefined
          ? data.latitude === null
            ? null
            : String(data.latitude)
          : undefined,
      longitude:
        data.longitude !== undefined
          ? data.longitude === null
            ? null
            : String(data.longitude)
          : undefined,
    } as any)
    .where(and(eq(stops.id, stopId), eq(stops.routeId, routeId)));

  const [updatedStop] = await db.select().from(stops)
    .where(and(eq(stops.id, stopId), eq(stops.routeId, routeId)))
    .limit(1);
  return updatedStop ?? null;
}

export async function deleteStop(routeId: number, stopId: number) {
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

  const [existingStop] = await db.select().from(stops)
    .where(and(eq(stops.id, stopId), eq(stops.routeId, routeId)))
    .limit(1);

  if (!existingStop) return false;

  await db.delete(stops)
    .where(and(eq(stops.id, stopId), eq(stops.routeId, routeId)));
  return true;
}

export async function deleteRouteStops(routeId: number) {
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

// ==================== ROUTE SCHEDULES ====================

export async function createSchedule(userId: number, data: {
  routeId: number;
  recurrenceType: "once" | "daily" | "weekly";
  scheduledDate: Date;
  scheduledTime?: string;
  daysOfWeek?: string;
  nextExecution?: Date;
}) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = new Date();
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
        updatedAt: now,
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
    isActive: true,
  });

  // Fetch the latest created schedule for this user
  const result = await db.select().from(routeSchedules)
    .where(eq(routeSchedules.userId, userId))
    .orderBy(desc(routeSchedules.createdAt))
    .limit(1);

  return result[0] || null;
}

export async function getScheduleById(scheduleId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return (
        memory.routeSchedules.find(
          (schedule) => schedule.id === scheduleId && schedule.userId === userId
        ) ?? null
      );
    }
    requireConfiguredDatabase();
  }

  const result = await db.select().from(routeSchedules)
    .where(and(eq(routeSchedules.id, scheduleId), eq(routeSchedules.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getUserSchedules(userId: number) {
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

  return db.select().from(routeSchedules)
    .where(eq(routeSchedules.userId, userId))
    .orderBy(desc(routeSchedules.nextExecution));
}

export async function updateSchedule(scheduleId: number, userId: number, data: Partial<{
  recurrenceType: "once" | "daily" | "weekly";
  scheduledDate: Date;
  scheduledTime: string;
  daysOfWeek: string;
  isActive: boolean;
  lastExecuted: Date;
  nextExecution: Date;
  heartbeatJobId: string;
}>) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const schedule = memory.routeSchedules.find(
        (item) => item.id === scheduleId && item.userId === userId
      );
      if (schedule) {
        Object.assign(schedule, data, { updatedAt: new Date() });
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }

  await db.update(routeSchedules)
    .set(data as any)
    .where(and(eq(routeSchedules.id, scheduleId), eq(routeSchedules.userId, userId)));
}

// ==================== ROUTE HISTORY ====================

export async function createHistory(userId: number, data: {
  routeId: number;
  executedDate?: Date;
  actualDistance?: number;
  actualTime?: number;
  status?: "in_progress" | "completed" | "cancelled";
  notes?: string;
}) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = new Date();
      const history = {
        id: memory.ids.routeHistory++,
        userId,
        routeId: data.routeId,
        executedDate: data.executedDate ?? now,
        actualDistance:
          data.actualDistance !== undefined ? String(data.actualDistance) : null,
        actualTime: data.actualTime ?? null,
        status: data.status ?? "in_progress",
        notes: data.notes ?? null,
        exportedAt: null,
        exportFormat: null,
        storageKey: null,
        createdAt: now,
        updatedAt: now,
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
    executedDate: data.executedDate || new Date(),
    actualDistance: data.actualDistance ? String(data.actualDistance) : null,
    actualTime: data.actualTime,
    status: data.status || "in_progress",
    notes: data.notes,
  } as any);

  // Fetch the latest created history for this user
  const result = await db.select().from(routeHistory)
    .where(eq(routeHistory.userId, userId))
    .orderBy(desc(routeHistory.createdAt))
    .limit(1);

  return result[0] || null;
}

export async function getUserRouteHistory(userId: number, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routeHistory
          .filter((history) => history.userId === userId)
          .map((history) => {
            const route = memory.routes.find((item) => item.id === history.routeId);
            return {
              ...history,
              routeName: route?.name ?? null,
            };
          }),
        "executedDate"
      ).slice(offset, offset + limit);
    }
    requireConfiguredDatabase();
  }

  return db
    .select({
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
      routeName: routes.name,
    })
    .from(routeHistory)
    .leftJoin(routes, eq(routeHistory.routeId, routes.id))
    .where(eq(routeHistory.userId, userId))
    .orderBy(desc(routeHistory.executedDate))
    .limit(limit)
    .offset(offset);
}

export async function getRouteHistory(routeId: number, userId: number) {
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

  return db.select().from(routeHistory)
    .where(and(eq(routeHistory.routeId, routeId), eq(routeHistory.userId, userId)))
    .orderBy(desc(routeHistory.executedDate));
}

export async function updateHistory(historyId: number, userId: number, data: Partial<{
  actualDistance: number;
  actualTime: number;
  status: "in_progress" | "completed" | "cancelled";
  notes: string;
  exportedAt: Date;
  exportFormat: "pdf" | "csv";
  storageKey: string;
}>) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const history = memory.routeHistory.find(
        (item) => item.id === historyId && item.userId === userId
      );
      if (history) {
        Object.assign(history, data, { updatedAt: new Date() });
        if (data.actualDistance !== undefined) {
          history.actualDistance = String(data.actualDistance);
        }
        await persistFallbackDb();
      }
      return;
    }
    requireConfiguredDatabase();
  }

  const updateData: any = {};
  if (data.actualDistance !== undefined) updateData.actualDistance = String(data.actualDistance);
  if (data.actualTime !== undefined) updateData.actualTime = data.actualTime;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.exportedAt !== undefined) updateData.exportedAt = data.exportedAt;
  if (data.exportFormat !== undefined) updateData.exportFormat = data.exportFormat;
  if (data.storageKey !== undefined) updateData.storageKey = data.storageKey;

  await db.update(routeHistory)
    .set(updateData)
    .where(and(eq(routeHistory.id, historyId), eq(routeHistory.userId, userId)));
}

// ==================== CHAT HISTORY ====================

export async function addChatMessage(userId: number, data: {
  routeId?: number;
  role: "user" | "assistant";
  content: string;
}) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = new Date();
      const message = {
        id: memory.ids.chatHistory++,
        userId,
        routeId: data.routeId ?? null,
        role: data.role,
        content: data.content,
        createdAt: now,
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
    content: data.content,
  });

  // Fetch the latest created message for this user
  const result = await db.select().from(chatHistory)
    .where(eq(chatHistory.userId, userId))
    .orderBy(desc(chatHistory.createdAt))
    .limit(1);

  return result[0] || null;
}

export async function getUserChatHistory(userId: number, routeId?: number, limit = 100) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateAsc(
        memory.chatHistory.filter(
          (message) =>
            message.userId === userId &&
            (routeId === undefined || message.routeId === routeId)
        ),
        "createdAt"
      ).slice(0, limit);
    }
    requireConfiguredDatabase();
  }

  const whereCondition = routeId
    ? and(eq(chatHistory.userId, userId), eq(chatHistory.routeId, routeId))
    : eq(chatHistory.userId, userId);

  return db.select().from(chatHistory)
    .where(whereCondition)
    .orderBy(asc(chatHistory.createdAt))
    .limit(limit);
}

// ==================== OPERATIONAL EVENTS ====================

export async function createOperationalEvent(data: {
  userId?: number | null;
  routeId?: number | null;
  stopId?: number | null;
  type: string;
  severity?: "info" | "warning" | "error" | "fatal";
  source: string;
  title: string;
  message?: string | null;
  runtime?: string | null;
  url?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
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
    metadata: data.metadata ?? null,
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.operationalEvents++,
        ...event,
        createdAt: new Date(),
      };
      memory.operationalEvents.push(created);
      await updateRouteExecutionMetricFromEvent(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }

  const inserted = await db
    .insert(operationalEvents)
    .values(event as any)
    .$returningId();
  const insertedId = inserted[0]?.id;
  if (insertedId) {
    const result = await db
      .select()
      .from(operationalEvents)
      .where(eq(operationalEvents.id, insertedId))
      .limit(1);

    const created = result[0] ?? null;
    if (created) await updateRouteExecutionMetricFromEvent(created);
    return created;
  }

  const result = await db
    .select()
    .from(operationalEvents)
    .where(
      and(
        data.userId == null
          ? sql`${operationalEvents.userId} IS NULL`
          : eq(operationalEvents.userId, data.userId),
        eq(operationalEvents.type, event.type),
        eq(operationalEvents.source, event.source),
        eq(operationalEvents.title, event.title)
      )
    )
    .orderBy(desc(operationalEvents.id))
    .limit(1);

  const created = result[0] ?? null;
  if (created) await updateRouteExecutionMetricFromEvent(created);
  return created;
}

type RouteExecutionStatus = "pending" | "started" | "completed" | "abandoned";

function normalizeExecutionEventType(type: string) {
  if (type === "route_execution_started") return "route_started";
  if (type === "route_execution_completed") return "route_completed";
  return type;
}

function routeExecutionStatusForEvent(type: string): RouteExecutionStatus | null {
  const normalized = normalizeExecutionEventType(type);
  if (normalized === "route_started" || normalized === "route_paused" || normalized === "route_resumed") {
    return "started";
  }
  if (normalized === "route_completed") return "completed";
  if (normalized === "route_abandoned") return "abandoned";
  return null;
}

async function updateRouteExecutionMetricFromEvent(event: {
  routeId?: number | null;
  type: string;
  createdAt?: Date | string;
}) {
  const routeId = Number(event.routeId);
  if (!Number.isFinite(routeId) || routeId <= 0) return;

  const status = routeExecutionStatusForEvent(event.type);
  if (!status) return;

  const eventDate = event.createdAt ? new Date(event.createdAt) : new Date();
  const db = await getDb();

  if (!db) {
    if (await shouldUseMemoryDb()) {
      const candidates = memory.routeMetrics
        .filter((metric) => Number(metric.routeId) === routeId)
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      const metric = candidates[0];
      if (!metric) return;

      if (status === "started") {
        metric.startedAt = metric.startedAt ?? eventDate;
        metric.executionStatus = "started";
      } else if (status === "completed") {
        metric.startedAt = metric.startedAt ?? eventDate;
        metric.completedAt = eventDate;
        metric.executionStatus = "completed";
        const startedAt = metric.startedAt ? new Date(metric.startedAt).getTime() : NaN;
        metric.executionDurationMs = Number.isFinite(startedAt)
          ? Math.max(0, eventDate.getTime() - startedAt)
          : null;
      } else if (status === "abandoned") {
        metric.executionStatus = "abandoned";
      }
      return;
    }
    return;
  }

  const latestRows = await db
    .select({
      id: routeMetrics.id,
      startedAt: routeMetrics.startedAt,
    })
    .from(routeMetrics)
    .where(eq(routeMetrics.routeId, routeId))
    .orderBy(desc(routeMetrics.createdAt), desc(routeMetrics.id))
    .limit(1);
  const latest = latestRows[0];
  if (!latest) return;

  if (status === "started") {
    await db
      .update(routeMetrics)
      .set({
        startedAt: latest.startedAt ?? eventDate,
        executionStatus: "started",
      } as any)
      .where(eq(routeMetrics.id, latest.id));
    return;
  }

  if (status === "completed") {
    const startedAt = latest.startedAt ? new Date(latest.startedAt).getTime() : NaN;
    await db
      .update(routeMetrics)
      .set({
        startedAt: latest.startedAt ?? eventDate,
        completedAt: eventDate,
        executionDurationMs: Number.isFinite(startedAt)
          ? Math.max(0, eventDate.getTime() - startedAt)
          : 0,
        executionStatus: "completed",
      } as any)
      .where(eq(routeMetrics.id, latest.id));
    return;
  }

  if (status === "abandoned") {
    await db
      .update(routeMetrics)
      .set({
        executionStatus: "abandoned",
      } as any)
      .where(eq(routeMetrics.id, latest.id));
  }
}

export async function getRecentOperationalEvents(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(memory.operationalEvents, "createdAt")
        .slice(0, safeLimit)
        .map((event) => ({
          ...event,
          userName: memory.users.find((user) => user.id === event.userId)?.name ?? null,
          userEmail: memory.users.find((user) => user.id === event.userId)?.email ?? null,
          routeName: memory.routes.find((route) => route.id === event.routeId)?.name ?? null,
        }));
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT
        e.id,
        e.userId,
        e.routeId,
        e.stopId,
        e.type,
        e.severity,
        e.source,
        e.title,
        e.message,
        e.runtime,
        e.url,
        e.userAgent,
        e.appVersion,
        e.metadata,
        e.createdAt,
        u.name as userName,
        u.email as userEmail,
        r.name as routeName
      FROM operationalEvents e FORCE INDEX (operationalEvents_createdAt_idx)
      LEFT JOIN users u ON e.userId = u.id
      LEFT JOIN routes r ON e.routeId = r.id
      ORDER BY e.createdAt DESC
      LIMIT ${safeLimit}
    `
  );

  return rows;
}

export async function getLatestRouteOptimizationEvent(routeId: number, userId: number) {
  const optimizationTypes = [
    "route_optimized",
    "route_reoptimized",
    "route_remaining_reoptimized",
    "route_user_requested_better_sequence",
  ];

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.operationalEvents.filter(
          (event) =>
            event.routeId === routeId &&
            event.userId === userId &&
            optimizationTypes.includes(event.type)
        ),
        "createdAt"
      )[0] ?? null;
    }
    requireConfiguredDatabase();
  }

  const result = await db
    .select()
    .from(operationalEvents)
    .where(
      and(
        eq(operationalEvents.routeId, routeId),
        eq(operationalEvents.userId, userId),
        sql`${operationalEvents.type} IN (${sql.join(
          optimizationTypes.map((type) => sql`${type}`),
          sql`, `
        )})`
      )
    )
    .orderBy(desc(operationalEvents.createdAt))
    .limit(1);

  return result[0] ?? null;
}

// ==================== ADDRESS CORRECTIONS ====================

function hashAddress(value: string) {
  return createHash("sha256")
    .update(value.replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex");
}

function extractCityFromAddress(address: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const stateLike = parts.findIndex((part) => /\bSP\b|\bSao Paulo\b/i.test(part));
    if (stateLike > 0) return parts[stateLike - 1].slice(0, 128);
    return parts[Math.max(0, parts.length - 2)].slice(0, 128);
  }

  return null;
}

export async function createAddressCorrection(data: {
  userId?: number | null;
  routeId?: number | null;
  stopId?: number | null;
  originalAddress: string;
  correctedAddress: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const originalAddress = data.originalAddress.replace(/\s+/g, " ").trim();
  const correctedAddress = data.correctedAddress.replace(/\s+/g, " ").trim();
  if (!originalAddress || !correctedAddress) {
    return null;
  }

  const payload = {
    addressHash: hashAddress(originalAddress),
    originalAddress: originalAddress.slice(0, 500),
    correctedAddress: correctedAddress.slice(0, 500),
    latitude:
      data.latitude == null || !Number.isFinite(Number(data.latitude))
        ? null
        : String(data.latitude),
    longitude:
      data.longitude == null || !Number.isFinite(Number(data.longitude))
        ? null
        : String(data.longitude),
    userId: data.userId ?? null,
    routeId: data.routeId ?? null,
    stopId: data.stopId ?? null,
    city: extractCityFromAddress(correctedAddress),
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.addressCorrections++,
        ...payload,
        latitude: payload.latitude == null ? null : Number(payload.latitude),
        longitude: payload.longitude == null ? null : Number(payload.longitude),
        createdAt: new Date(),
      };
      memory.addressCorrections.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }

  const inserted = await db
    .insert(addressCorrections)
    .values(payload as any)
    .$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;

  const result = await db
    .select()
    .from(addressCorrections)
    .where(eq(addressCorrections.id, insertedId))
    .limit(1);

  return result[0] ?? null;
}

// ==================== ROUTE METRICS ====================

export type OptimizationJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type CreateOptimizationJobInput = {
  routeId: number;
  userId?: number | null;
  status?: OptimizationJobStatus;
  errorMessage?: string | null;
  runtimeMs?: number | null;
  queueWaitMs?: number | null;
  executionMs?: number | null;
  workerMemoryMb?: number | null;
  peakMemoryMb?: number | null;
  workerId?: string | null;
  workerHostname?: string | null;
  workerStartedAt?: Date | null;
  workerFinishedAt?: Date | null;
  attemptCount?: number;
  maxAttempts?: number;
  providerJobId?: string | null;
  stackTrace?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function createOptimizationJob(data: CreateOptimizationJobInput) {
  const payload = {
    routeId: data.routeId,
    userId: data.userId ?? null,
    status: data.status ?? "queued",
    runtimeMs: data.runtimeMs ?? null,
    queueWaitMs: data.queueWaitMs ?? null,
    executionMs: data.executionMs ?? null,
    workerMemoryMb: data.workerMemoryMb ?? null,
    peakMemoryMb: data.peakMemoryMb ?? null,
    workerId: data.workerId ?? null,
    workerHostname: data.workerHostname ?? null,
    workerStartedAt: data.workerStartedAt ?? null,
    workerFinishedAt: data.workerFinishedAt ?? null,
    attemptCount: data.attemptCount ?? 0,
    maxAttempts: data.maxAttempts ?? 3,
    providerJobId: data.providerJobId ?? null,
    errorMessage: data.errorMessage ?? null,
    stackTrace: data.stackTrace ?? null,
    metadata: data.metadata ?? null,
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.optimizationJobs++,
        ...payload,
        createdAt: new Date(),
        startedAt: payload.status === "running" ? new Date() : null,
        finishedAt:
          payload.status === "completed" ||
          payload.status === "failed" ||
          payload.status === "cancelled"
            ? new Date()
            : null,
      };
      memory.optimizationJobs.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }

  const inserted = await db
    .insert(optimizationJobs)
    .values(payload as any)
    .$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;

  const result = await db
    .select()
    .from(optimizationJobs)
    .where(eq(optimizationJobs.id, insertedId))
    .limit(1);

  return result[0] ?? null;
}

export async function updateOptimizationJob(
  id: number,
  patch: {
    status?: OptimizationJobStatus;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    runtimeMs?: number | null;
    queueWaitMs?: number | null;
    executionMs?: number | null;
    workerMemoryMb?: number | null;
    peakMemoryMb?: number | null;
    workerId?: string | null;
    workerHostname?: string | null;
    workerStartedAt?: Date | null;
    workerFinishedAt?: Date | null;
    attemptCount?: number;
    maxAttempts?: number;
    providerJobId?: string | null;
    errorMessage?: string | null;
    stackTrace?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const job = memory.optimizationJobs.find((item) => Number(item.id) === id);
      if (!job) return null;
      Object.assign(job, patch);
      await persistFallbackDb();
      return job;
    }
    requireConfiguredDatabase();
  }

  await db
    .update(optimizationJobs)
    .set(patch as any)
    .where(eq(optimizationJobs.id, id));

  const result = await db
    .select()
    .from(optimizationJobs)
    .where(eq(optimizationJobs.id, id))
    .limit(1);

  return result[0] ?? null;
}

export async function getOptimizationJobById(id: number) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return memory.optimizationJobs.find((item) => Number(item.id) === id) ?? null;
    }
    requireConfiguredDatabase();
  }

  const result = await db
    .select()
    .from(optimizationJobs)
    .where(eq(optimizationJobs.id, id))
    .limit(1);

  return result[0] ?? null;
}

const QUEUE_INTEGRITY_EVENT_TYPES = [
  "duplicate_job_detected",
  "worker_crash_recovered",
  "job_recovered_after_crash",
  "optimization_job_stalled",
  "redis_reconnect_detected",
  "optimization_job_failed",
];

export async function getQueueIntegrityDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      const events = memory.operationalEvents.filter(
        (event) =>
          QUEUE_INTEGRITY_EVENT_TYPES.includes(String(event.type)) &&
          new Date(event.createdAt).getTime() >= cutoff
      );
      const failedJobs = memory.optimizationJobs.filter(
        (job) =>
          job.status === "failed" &&
          new Date(job.createdAt).getTime() >= cutoff
      );
      const runningJobs = memory.optimizationJobs.filter(
        (job) => job.status === "running"
      );
      return buildQueueIntegrityDashboard(events, failedJobs, runningJobs, safeDays);
    }
    requireConfiguredDatabase();
  }

  const [events] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id, type, severity, source, title, message, metadata, createdAt
      FROM operationalEvents FORCE INDEX (operationalEvents_type_createdAt_idx)
      WHERE type IN (${QUEUE_INTEGRITY_EVENT_TYPES.map(() => "?").join(",")})
        AND createdAt >= ?
      ORDER BY createdAt DESC
      LIMIT 5000
    `,
    [...QUEUE_INTEGRITY_EVENT_TYPES, cutoffDate]
  );
  const [failedJobs] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id, route_id AS routeId, worker_id AS workerId, attempt_count AS attemptCount,
        max_attempts AS maxAttempts, error_message AS errorMessage, created_at AS createdAt,
        finished_at AS finishedAt
      FROM optimization_jobs
      WHERE status = 'failed'
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 2000
    `,
    [cutoffDate]
  );
  const [runtimeRows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT AVG(NULLIF(COALESCE(runtime_ms, execution_ms, 0), 0)) AS averageRuntimeMs
      FROM optimization_jobs
      WHERE status = 'completed'
        AND created_at >= ?
    `,
    [cutoffDate]
  );
  const averageRuntimeMs = Math.max(60_000, Number(runtimeRows[0]?.averageRuntimeMs || 0));
  const [runningJobs] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id, route_id AS routeId, user_id AS userId, worker_id AS workerId,
        worker_hostname AS workerHostname, attempt_count AS attemptCount,
        started_at AS startedAt, created_at AS createdAt,
        ROUND(TIMESTAMPDIFF(MICROSECOND, COALESCE(started_at, created_at), NOW()) / 1000) AS runningMs
      FROM optimization_jobs
      WHERE status = 'running'
      ORDER BY COALESCE(started_at, created_at) ASC
      LIMIT 200
    `
  );
  const runningAlerts = buildLongRunningJobAlerts(runningJobs, averageRuntimeMs);
  await persistLongRunningJobAlerts(runningAlerts);

  return buildQueueIntegrityDashboard(
    events,
    failedJobs,
    runningJobs,
    safeDays,
    averageRuntimeMs,
    runningAlerts
  );
}

function countEventsByType(events: any[], type: string) {
  return events.filter((event) => event.type === type).length;
}

function buildLongRunningJobAlerts(runningJobs: any[], averageRuntimeMs: number) {
  const warningThresholdMs = averageRuntimeMs * 2;
  const criticalThresholdMs = averageRuntimeMs * 5;
  return runningJobs
    .map((job) => {
      const runningMs =
        Number(job.runningMs || 0) ||
        Math.max(
          0,
          Date.now() -
            new Date(job.startedAt || job.started_at || job.createdAt || Date.now()).getTime()
        );
      const severity =
        runningMs > criticalThresholdMs
          ? "critical"
          : runningMs > warningThresholdMs
            ? "warning"
            : null;
      if (!severity) return null;
      return {
        jobId: Number(job.id),
        routeId: job.routeId ?? job.route_id ?? null,
        userId: job.userId ?? job.user_id ?? null,
        workerId: job.workerId ?? job.worker_id ?? null,
        workerHostname: job.workerHostname ?? job.worker_hostname ?? null,
        runningMs,
        averageRuntimeMs,
        thresholdMultiplier: severity === "critical" ? 5 : 2,
        severity,
      };
    })
    .filter(Boolean) as Array<{
      jobId: number;
      routeId: number | null;
      userId: number | null;
      workerId: string | null;
      workerHostname: string | null;
      runningMs: number;
      averageRuntimeMs: number;
      thresholdMultiplier: number;
      severity: "warning" | "critical";
    }>;
}

async function hasRecentQueueIntegrityEvent(type: string, title: string, minutes = 30) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = Date.now() - minutes * 60_000;
      return memory.operationalEvents.some(
        (event) =>
          event.type === type &&
          event.title === title &&
          new Date(event.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id
      FROM operationalEvents FORCE INDEX (operationalEvents_type_createdAt_idx)
      WHERE type = ?
        AND title = ?
        AND createdAt >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      LIMIT 1
    `,
    [type, title, minutes]
  );
  return rows.length > 0;
}

const DISASTER_CRITICAL_TABLES = [
  { table: "routes", memoryKey: "routes" },
  { table: "stops", memoryKey: "stops" },
  { table: "route_metrics", memoryKey: "routeMetrics" },
  { table: "optimization_jobs", memoryKey: "optimizationJobs" },
  { table: "operationalEvents", memoryKey: "operationalEvents" },
  { table: "address_corrections", memoryKey: "addressCorrections" },
  { table: "osrm_matrix_cache", memoryKey: null },
  { table: "admin_dashboard_metrics", memoryKey: null },
] as const;

const DISASTER_EVENT_TYPES = [
  "backup_completed",
  "backup_missing",
  "backup_failed",
  "restore_test_passed",
  "restore_test_failed",
] as const;

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateAgeHours(date: Date | null) {
  if (!date) return null;
  return Math.max(0, Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10);
}

function readBooleanLike(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim", "passed", "ok"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não", "failed"].includes(normalized)) return false;
  }
  return false;
}

async function hasRecentDisasterReadinessEvent(type: string, title: string, minutes = 360) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = Date.now() - minutes * 60_000;
      return memory.operationalEvents.some(
        (event) =>
          event.type === type &&
          event.title === title &&
          new Date(event.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id
      FROM operationalEvents FORCE INDEX (operationalEvents_type_createdAt_idx)
      WHERE type = ?
        AND title = ?
        AND createdAt >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      LIMIT 1
    `,
    [type, title, minutes]
  );
  return rows.length > 0;
}

async function persistDisasterReadinessAlerts(
  alerts: Array<{
    type: string;
    severity: "warning" | "error" | "fatal";
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>
) {
  for (const alert of alerts) {
    if (await hasRecentDisasterReadinessEvent(alert.type, alert.title)) {
      continue;
    }
    await createOperationalEvent({
      userId: null,
      routeId: null,
      stopId: null,
      type: alert.type,
      severity: alert.severity,
      source: "admin.disasterReadiness",
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata ?? null,
    });
  }
}

async function getLatestDisasterEvents() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return DISASTER_EVENT_TYPES.map((type) =>
        sortByDateDesc(
          memory.operationalEvents.filter((event) => event.type === type),
          "createdAt"
        )[0] ?? null
      ).filter(Boolean);
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id, type, severity, title, message, metadata, createdAt
      FROM operationalEvents FORCE INDEX (operationalEvents_type_createdAt_idx)
      WHERE type IN (${DISASTER_EVENT_TYPES.map(() => "?").join(",")})
      ORDER BY createdAt DESC
      LIMIT 100
    `,
    [...DISASTER_EVENT_TYPES]
  );
  return rows;
}

function latestEventByType(events: any[], type: string) {
  return events.find((event) => event?.type === type) ?? null;
}

async function getCriticalTableReadiness() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return DISASTER_CRITICAL_TABLES.map((item) => {
        const records = item.memoryKey
          ? Number((memory as any)[item.memoryKey]?.length ?? 0)
          : 0;
        return {
          table: item.table,
          records,
          status: "ok" as const,
        };
      });
    }
    requireConfiguredDatabase();
  }

  const counts = await Promise.all(
    DISASTER_CRITICAL_TABLES.map(async (item) => {
      try {
        const [rows] = await _pool!.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS records FROM \`${item.table}\``
        );
        return {
          table: item.table,
          records: Number(rows[0]?.records ?? 0),
          status: "ok" as const,
        };
      } catch (error) {
        return {
          table: item.table,
          records: 0,
          status: "error" as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return counts;
}

export async function getDisasterReadinessDashboard() {
  const rpoTargetHours = 24;
  const rtoTargetHours = 4;
  const events = await getLatestDisasterEvents();
  const lastBackupEvent = latestEventByType(events, "backup_completed");
  const backupFailedEvent = latestEventByType(events, "backup_failed");
  const restorePassedEvent = latestEventByType(events, "restore_test_passed");
  const restoreFailedEvent = latestEventByType(events, "restore_test_failed");

  const envBackupAt = parseOptionalDate(ENV.backupLastCompletedAt);
  const eventBackupAt = parseOptionalDate(lastBackupEvent?.createdAt);
  const lastBackupAt = envBackupAt ?? eventBackupAt;
  const backupAgeHours = dateAgeHours(lastBackupAt);
  const backupStatus = (ENV.backupStatus || (backupFailedEvent ? "failed" : "unknown"))
    .trim()
    .toLowerCase();

  const envRestoreAt = parseOptionalDate(ENV.restoreTestLastPassedAt);
  const eventRestoreAt = parseOptionalDate(restorePassedEvent?.createdAt);
  const restoreTestAt = envRestoreAt ?? eventRestoreAt;
  const restoreTestPassed =
    ENV.restoreTestPassed ||
    Boolean(restoreTestAt && (!restoreFailedEvent || restoreTestAt >= new Date(restoreFailedEvent.createdAt)));

  const criticalTables = await getCriticalTableReadiness();
  const tableErrors = criticalTables.filter((table) => table.status !== "ok");
  const alerts: Array<{
    type: string;
    severity: "warning" | "error" | "fatal";
    severityLabel: "warning" | "critical";
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }> = [];

  if (!lastBackupAt) {
    alerts.push({
      type: "backup_missing",
      severity: "fatal",
      severityLabel: "critical",
      title: "Backup sem evidencia registrada",
      message: "Nenhuma evidencia de backup foi encontrada em variaveis ou eventos operacionais.",
      metadata: { rpoTargetHours, backupAgeHours: null },
    });
  } else if ((backupAgeHours ?? 0) > 72) {
    alerts.push({
      type: "backup_missing",
      severity: "fatal",
      severityLabel: "critical",
      title: "Backup acima de 72 horas",
      message: `Ultimo backup tem ${backupAgeHours}h. Meta RPO: ${rpoTargetHours}h.`,
      metadata: { rpoTargetHours, backupAgeHours, thresholdHours: 72 },
    });
  } else if ((backupAgeHours ?? 0) > 24) {
    alerts.push({
      type: "backup_missing",
      severity: "warning",
      severityLabel: "warning",
      title: "Backup acima de 24 horas",
      message: `Ultimo backup tem ${backupAgeHours}h. Meta RPO: ${rpoTargetHours}h.`,
      metadata: { rpoTargetHours, backupAgeHours, thresholdHours: 24 },
    });
  }

  if (backupStatus === "failed") {
    alerts.push({
      type: "backup_failed",
      severity: "fatal",
      severityLabel: "critical",
      title: "Falha de backup registrada",
      message: "A ultima evidencia de backup indica falha.",
      metadata: { backupStatus, backupFailedAt: backupFailedEvent?.createdAt ?? null },
    });
  }

  if (!restoreTestPassed) {
    alerts.push({
      type: "restore_test_failed",
      severity: "warning",
      severityLabel: "warning",
      title: "Restore test nao aprovado",
      message: "Nenhuma evidencia de teste de restore aprovado foi encontrada.",
      metadata: { rtoTargetHours, restoreTestAt: restoreTestAt?.toISOString() ?? null },
    });
  }

  for (const table of tableErrors) {
    alerts.push({
      type: "restore_test_failed",
      severity: "fatal",
      severityLabel: "critical",
      title: `Tabela critica inacessivel: ${table.table}`,
      message: table.error ?? "Tabela critica nao respondeu a consulta de prontidao.",
      metadata: { table: table.table, status: table.status },
    });
  }

  await persistDisasterReadinessAlerts(alerts);

  const status = alerts.some((alert) => alert.severity === "fatal")
    ? "critical"
    : alerts.length > 0
      ? "warning"
      : "healthy";

  return {
    status,
    rpoTargetHours,
    rtoTargetHours,
    lastBackupAt: lastBackupAt?.toISOString() ?? null,
    backupAgeHours,
    backupStatus: backupStatus || "unknown",
    restoreTestAt: restoreTestAt?.toISOString() ?? null,
    restoreTestPassed,
    criticalTables,
    alerts,
    events: {
      lastBackupEventId: lastBackupEvent?.id ?? null,
      backupFailedEventId: backupFailedEvent?.id ?? null,
      restorePassedEventId: restorePassedEvent?.id ?? null,
      restoreFailedEventId: restoreFailedEvent?.id ?? null,
    },
    checkedAt: new Date().toISOString(),
  };
}

async function persistLongRunningJobAlerts(
  alerts: ReturnType<typeof buildLongRunningJobAlerts>
) {
  for (const alert of alerts) {
    const title = `Job ${alert.jobId} executando acima do esperado`;
    if (await hasRecentQueueIntegrityEvent("optimization_job_stalled", title)) {
      continue;
    }
    await createOperationalEvent({
      userId: alert.userId,
      routeId: alert.routeId,
      stopId: null,
      type: "optimization_job_stalled",
      severity: alert.severity === "critical" ? "fatal" : "warning",
      source: "optimization.queue.integrity",
      title,
      message: `Job executando ha ${Math.round(alert.runningMs / 1000)}s, acima de ${alert.thresholdMultiplier}x o runtime medio.`,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        optimizationJobId: alert.jobId,
        routeId: alert.routeId,
        workerId: alert.workerId,
        workerHostname: alert.workerHostname,
        runningMs: alert.runningMs,
        averageRuntimeMs: alert.averageRuntimeMs,
        thresholdMultiplier: alert.thresholdMultiplier,
        stalledCount: 1,
      },
    });
  }
}

function buildQueueIntegrityDashboard(
  events: any[],
  failedJobs: any[],
  runningJobs: any[],
  days: number,
  averageRuntimeMs = 60_000,
  runningAlerts = buildLongRunningJobAlerts(runningJobs, averageRuntimeMs)
) {
  const duplicateJobs = countEventsByType(events, "duplicate_job_detected");
  const jobRecoveredAfterCrash = countEventsByType(events, "job_recovered_after_crash");
  const workerCrashRecovered = countEventsByType(events, "worker_crash_recovered");
  const stalledCount = countEventsByType(events, "optimization_job_stalled");
  const stalledRecoveredCount = jobRecoveredAfterCrash;
  const redisReconnectCount = countEventsByType(events, "redis_reconnect_detected");
  const failedRecoveries = failedJobs.filter((job) => {
    const attemptCount = Number(job.attemptCount ?? job.attempt_count ?? 0);
    const maxAttempts = Number(job.maxAttempts ?? job.max_attempts ?? 3);
    return attemptCount >= maxAttempts;
  }).length;
  const lastEvent = events[0];

  return {
    periodDays: days,
    duplicateJobs,
    duplicateJobDetected: duplicateJobs,
    recoveredJobs: jobRecoveredAfterCrash,
    jobRecoveredAfterCrash,
    workerCrashRecovered,
    stalledCount,
    stalledRecoveredCount,
    runningStalledJobs: runningAlerts.length,
    stalledJobs: stalledCount + runningAlerts.length,
    averageRuntimeMs,
    longRunningJobs: runningAlerts,
    failedRecoveries,
    redisReconnectCount,
    lastIntegrityCheck: lastEvent?.createdAt ?? null,
    status:
      duplicateJobs === 0 && failedRecoveries === 0 && stalledCount === 0 && runningAlerts.length === 0
        ? "healthy"
        : "attention",
    target: {
      duplicateJobs: 0,
      failedRecoveries: 0,
      stalledJobs: 0,
      recoveryAfterFailure: "100%",
    },
    recentEvents: events.slice(0, 20),
  };
}

export async function getOptimizationWorkerJobStats(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const db = await getDb();

  if (!db) {
    if (await shouldUseMemoryDb()) {
      const rows = memory.optimizationJobs.filter(
        (job) =>
          job.workerId &&
          new Date(job.createdAt).getTime() >= cutoffDate.getTime()
      );
      const byWorker = new Map<
        string,
        {
          workerId: string;
          workerHostname: string | null;
          jobsProcessed: number;
          jobsFailed: number;
          runtimeTotal: number;
          runtimeCount: number;
        }
      >();

      for (const job of rows) {
        const workerId = String(job.workerId);
        const current =
          byWorker.get(workerId) ??
          {
            workerId,
            workerHostname: job.workerHostname ?? null,
            jobsProcessed: 0,
            jobsFailed: 0,
            runtimeTotal: 0,
            runtimeCount: 0,
          };
        if (job.status === "completed") current.jobsProcessed += 1;
        if (job.status === "failed") current.jobsFailed += 1;
        const runtimeMs = Number(job.runtimeMs || job.executionMs || 0);
        if (runtimeMs > 0) {
          current.runtimeTotal += runtimeMs;
          current.runtimeCount += 1;
        }
        byWorker.set(workerId, current);
      }

      return Array.from(byWorker.values()).map((worker) => ({
        workerId: worker.workerId,
        workerHostname: worker.workerHostname,
        jobsProcessed: worker.jobsProcessed,
        jobsFailed: worker.jobsFailed,
        workerAverageRuntime: worker.runtimeCount
          ? Math.round(worker.runtimeTotal / worker.runtimeCount)
          : 0,
      }));
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT
        worker_id AS workerId,
        MAX(worker_hostname) AS workerHostname,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS jobsProcessed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS jobsFailed,
        ROUND(AVG(NULLIF(COALESCE(runtime_ms, execution_ms, 0), 0))) AS workerAverageRuntime
      FROM optimization_jobs
      WHERE worker_id IS NOT NULL
        AND created_at >= ?
      GROUP BY worker_id
    `,
    [cutoffDate]
  );

  return rows.map((row) => ({
    workerId: String(row.workerId),
    workerHostname: row.workerHostname ? String(row.workerHostname) : null,
    jobsProcessed: Number(row.jobsProcessed || 0),
    jobsFailed: Number(row.jobsFailed || 0),
    workerAverageRuntime: Number(row.workerAverageRuntime || 0),
  }));
}

export async function getOptimizationJobsDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const rows = await (async () => {
    const db = await getDb();
    if (!db) {
      if (await shouldUseMemoryDb()) {
        const cutoff = cutoffDate.getTime();
        return memory.optimizationJobs.filter(
          (job) => new Date(job.createdAt).getTime() >= cutoff
        );
      }
      requireConfiguredDatabase();
    }

    return db
      .select()
      .from(optimizationJobs)
      .where(gte(optimizationJobs.createdAt, cutoffDate))
      .orderBy(desc(optimizationJobs.createdAt))
      .limit(2000);
  })();

  const byStatus = rows.reduce((acc: Record<string, number>, job: any) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const runtimeValues = rows
    .map((job: any) => Number(job.runtimeMs || 0))
    .filter((value: number) => value > 0);
  const queueWaitValues = rows
    .map((job: any) => {
      const explicit = Number(job.queueWaitMs || 0);
      if (explicit > 0) return explicit;
      const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
      const createdAt = job.createdAt ? new Date(job.createdAt).getTime() : 0;
      return startedAt > createdAt ? startedAt - createdAt : 0;
    })
    .filter((value: number) => value > 0);
  const attempted = rows.filter((job: any) =>
    ["completed", "failed", "cancelled"].includes(String(job.status))
  ).length;
  const completed = byStatus.completed || 0;
  const failed = byStatus.failed || 0;
  const retrying = rows.filter(
    (job: any) =>
      Number(job.attemptCount || 0) > 1 && String(job.status) !== "completed"
  ).length;

  return {
    periodDays: safeDays,
    total: rows.length,
    byStatus,
    queued: byStatus.queued || 0,
    running: byStatus.running || 0,
    completed: byStatus.completed || 0,
    failed: byStatus.failed || 0,
    cancelled: byStatus.cancelled || 0,
    successRate: roundMetric(metricPercent(completed, attempted)),
    failureRate: roundMetric(metricPercent(failed, attempted)),
    retrying,
    queueWait: {
      averageMs: roundMetric(metricAverage(queueWaitValues)),
      p50Ms: roundMetric(metricPercentile(queueWaitValues, 50)),
      p95Ms: roundMetric(metricPercentile(queueWaitValues, 95)),
      p99Ms: roundMetric(metricPercentile(queueWaitValues, 99)),
      maxMs: Math.max(0, ...queueWaitValues),
    },
    runtime: {
      averageMs: roundMetric(metricAverage(runtimeValues)),
      p50Ms: roundMetric(metricPercentile(runtimeValues, 50)),
      p95Ms: roundMetric(metricPercentile(runtimeValues, 95)),
      p99Ms: roundMetric(metricPercentile(runtimeValues, 99)),
      maxMs: Math.max(0, ...runtimeValues),
    },
    recent: rows.slice(0, 20),
  };
}

export type CreateRouteMetricInput = {
  userId?: number | null;
  routeId?: number | null;
  qualityScore: number;
  optimizationRuntimeMs: number;
  osrmUsed: boolean;
  osrmFallback: boolean;
  clusterCount: number;
  averageClusterRadius: number;
  maxClusterRadius: number;
  regionRevisitedCount: number;
  prematureRegionExitCount: number;
  nearbyStopSkippedCount: number;
  routeCrossingCount: number;
  averageGeocodingConfidence?: number;
  minGeocodingConfidence?: number;
  suspiciousGeocodingCount?: number;
  dbFetchMs?: number;
  clusteringMs?: number;
  osrmMs?: number;
  optimizerMs?: number;
  auditMs?: number;
  correctionMs?: number;
  dbSaveMs?: number;
  totalRuntimeMs?: number;
  osrmCallCount?: number;
  osrmFailureCount?: number;
  osrmTotalMs?: number;
  osrmAverageMs?: number;
  osrmProvider?: string | null;
  osrmAvailability?: "unknown" | "available" | "degraded" | "unavailable";
  osrmLatencyMs?: number;
  osrmMatrixCount?: number;
  osrmMatrixSize?: number;
  osrmFailureReason?: string | null;
  matrixCacheHit?: number;
  matrixCacheMiss?: number;
  matrixGenerationMs?: number;
  macroClusterCount?: number;
  microClusterCount?: number;
  largestClusterSize?: number;
  issuesDetectedCount: number;
  issuesCorrectedCount: number;
  issuesBlockedCount: number;
  auditCycles?: number;
  issuesRemainingCount?: number;
  batchCorrectionCount?: number;
  auditStatus: "approved" | "attention" | "critical";
  auditQuality: "excellent" | "good" | "attention" | "poor" | "blocked";
  auditSource?: string | null;
  routeMode?: "shortest_distance" | "shortest_time" | "balanced" | null;
  localityMode?: "balanced" | "local" | "strict" | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  executionDurationMs?: number | null;
  executionStatus?: "pending" | "started" | "completed" | "abandoned";
  stopCount: number;
  totalDistanceKm: number;
  totalTimeMinutes: number;
  metadata?: Record<string, unknown> | null;
};

function normalizeMetricNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metricAverage(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function metricPercentile(values: number[], percentile: number) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

function metricPercent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function roundMetric(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const PERFORMANCE_BENCHMARK_TARGETS: Record<number, number> = {
  250: 15_000,
  500: 30_000,
  1000: 60_000,
  2000: 180_000,
};

export type CreatePerformanceBenchmarkInput = {
  scenario?: string;
  stopCount: number;
  runtimeMs: number;
  peakMemoryMb?: number;
  queueWaitMs?: number;
  osrmLatencyMs?: number;
  auditCycles?: number;
  microClusterCount?: number;
  osrmCalls?: number;
  osrmFailures?: number;
  matrixCacheHit?: number;
  matrixCacheMiss?: number;
  success?: boolean;
  criteriaMet?: boolean;
  metadata?: Record<string, unknown> | null;
};

function benchmarkCriteriaMet(stopCount: number, runtimeMs: number, success = true) {
  const targetMs = PERFORMANCE_BENCHMARK_TARGETS[stopCount];
  if (!targetMs) return Boolean(success);
  return Boolean(success) && runtimeMs > 0 && runtimeMs < targetMs;
}

export async function createPerformanceBenchmark(data: CreatePerformanceBenchmarkInput) {
  const stopCount = Math.round(normalizeMetricNumber(data.stopCount));
  const runtimeMs = Math.round(normalizeMetricNumber(data.runtimeMs));
  const success = data.success ?? true;
  const criteriaMet =
    data.criteriaMet ?? benchmarkCriteriaMet(stopCount, runtimeMs, success);
  const benchmark = {
    scenario: (data.scenario || "stress-suite").slice(0, 64),
    stopCount,
    runtimeMs,
    peakMemoryMb: Math.round(normalizeMetricNumber(data.peakMemoryMb)),
    queueWaitMs: Math.round(normalizeMetricNumber(data.queueWaitMs)),
    osrmLatencyMs: Math.round(normalizeMetricNumber(data.osrmLatencyMs)),
    auditCycles: Math.round(normalizeMetricNumber(data.auditCycles)),
    microClusterCount: Math.round(normalizeMetricNumber(data.microClusterCount)),
    osrmCalls: Math.round(normalizeMetricNumber(data.osrmCalls)),
    osrmFailures: Math.round(normalizeMetricNumber(data.osrmFailures)),
    matrixCacheHit: Math.round(normalizeMetricNumber(data.matrixCacheHit)),
    matrixCacheMiss: Math.round(normalizeMetricNumber(data.matrixCacheMiss)),
    success,
    criteriaMet,
    metadata: data.metadata ?? null,
  };

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.performanceBenchmarks++,
        ...benchmark,
        createdAt: new Date(),
      };
      memory.performanceBenchmarks.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }

  const inserted = await db
    .insert(performanceBenchmarks)
    .values(benchmark as any)
    .$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;

  const result = await db
    .select()
    .from(performanceBenchmarks)
    .where(eq(performanceBenchmarks.id, insertedId))
    .limit(1);

  return result[0] ?? null;
}

function buildPerformanceBenchmarkDashboard(rows: any[], days: number, tableAvailable = true) {
  const scenarioTargets = [250, 500, 1000, 2000].map((stopCount) => {
    const values = rows.filter((row) => Number(row.stopCount ?? row.stop_count) === stopCount);
    const runtimes = values.map((row) => Number(row.runtimeMs ?? row.runtime_ms ?? 0));
    const latest = values
      .slice()
      .sort((a, b) =>
        new Date(b.createdAt ?? b.created_at ?? 0).getTime() -
        new Date(a.createdAt ?? a.created_at ?? 0).getTime()
      )[0];
    const latestRuntimeMs = Number(latest?.runtimeMs ?? latest?.runtime_ms ?? 0);
    const targetMs = PERFORMANCE_BENCHMARK_TARGETS[stopCount];
    const latestCriteriaMet = Boolean(latest?.criteriaMet ?? latest?.criteria_met ?? false);
    return {
      stopCount,
      targetMs,
      runs: values.length,
      latestRuntimeMs,
      latestPeakMemoryMb: Number(latest?.peakMemoryMb ?? latest?.peak_memory_mb ?? 0),
      latestQueueWaitMs: Number(latest?.queueWaitMs ?? latest?.queue_wait_ms ?? 0),
      latestOsrmLatencyMs: Number(latest?.osrmLatencyMs ?? latest?.osrm_latency_ms ?? 0),
      latestAuditCycles: Number(latest?.auditCycles ?? latest?.audit_cycles ?? 0),
      latestMicroClusterCount: Number(latest?.microClusterCount ?? latest?.micro_cluster_count ?? 0),
      latestCriteriaMet,
      averageRuntimeMs: Math.round(metricAverage(runtimes)),
      p95RuntimeMs: Math.round(metricPercentile(runtimes, 95)),
      p99RuntimeMs: Math.round(metricPercentile(runtimes, 99)),
      status: !latest
        ? "missing"
        : latestCriteriaMet && latestRuntimeMs > 0 && latestRuntimeMs < targetMs
          ? "ready"
          : "no-go",
      latestAt: latest?.createdAt ?? latest?.created_at ?? null,
    };
  });

  const totalRuns = rows.length;
  const successfulRuns = rows.filter((row) => Boolean(row.success)).length;
  const criteriaMetRuns = rows.filter((row) =>
    Boolean(row.criteriaMet ?? row.criteria_met)
  ).length;
  const osrmCalls = rows.reduce(
    (total, row) => total + Number(row.osrmCalls ?? row.osrm_calls ?? 0),
    0
  );
  const osrmFailures = rows.reduce(
    (total, row) => total + Number(row.osrmFailures ?? row.osrm_failures ?? 0),
    0
  );

  return {
    tableAvailable,
    days,
    totalRuns,
    successfulRuns,
    criteriaMetRuns,
    successRate: roundMetric(metricPercent(successfulRuns, totalRuns)),
    criteriaMetRate: roundMetric(metricPercent(criteriaMetRuns, totalRuns)),
    osrmCalls,
    osrmFailures,
    osrmFailureRate: roundMetric(metricPercent(osrmFailures, osrmCalls)),
    targets: scenarioTargets,
    status: !tableAvailable
      ? "unavailable"
      : scenarioTargets.every((target) => target.status === "ready")
        ? "ready"
        : scenarioTargets.some((target) => target.status === "no-go")
          ? "no-go"
          : "partial",
    generatedAt: new Date().toISOString(),
  };
}

export async function getPerformanceBenchmarkDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const rows = memory.performanceBenchmarks.filter(
        (row) => new Date(row.createdAt).getTime() >= cutoffDate.getTime()
      );
      return buildPerformanceBenchmarkDashboard(rows, safeDays);
    }
    requireConfiguredDatabase();
  }

  try {
    const rows = await db
      .select()
      .from(performanceBenchmarks)
      .where(gte(performanceBenchmarks.createdAt, cutoffDate))
      .orderBy(desc(performanceBenchmarks.createdAt))
      .limit(500);

    return buildPerformanceBenchmarkDashboard(rows, safeDays);
  } catch (error) {
    return {
      ...buildPerformanceBenchmarkDashboard([], safeDays, false),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildGoLive500Dashboard(args: {
  routeStopCounts: number[];
  routeMetricRows: any[];
  performanceBenchmarks: any;
  maxRouteStops?: number;
}) {
  const maxRouteStops = args.maxRouteStops || ENV.maxRouteStops || 500;
  const routeStopCounts = args.routeStopCounts
    .map((value) => Number(value || 0))
    .filter((value) => value >= 0);
  const largestRouteStops = Math.max(0, ...routeStopCounts);
  const routesAboveLimit = routeStopCounts.filter(
    (value) => value > maxRouteStops
  ).length;
  const routesAtLimit = routeStopCounts.filter(
    (value) => value === maxRouteStops
  ).length;
  const routesAbove250 = routeStopCounts.filter((value) => value > 250).length;
  const routesNearLimit = routeStopCounts.filter(
    (value) => value >= Math.round(maxRouteStops * 0.9) && value <= maxRouteStops
  ).length;
  const routeMetricsRows = args.routeMetricRows.filter((row) => {
    const stopCount = Number(row.stopCount ?? row.stop_count ?? 0);
    return stopCount > 0 && stopCount <= maxRouteStops;
  });
  const runtimeValues = routeMetricsRows
    .map((row) =>
      Number(
        row.totalRuntimeMs ??
          row.total_runtime_ms ??
          row.optimizationRuntimeMs ??
          row.optimization_runtime_ms ??
          0
      )
    )
    .filter((value) => Number.isFinite(value) && value > 0);
  const benchmark500 = args.performanceBenchmarks?.targets?.find(
    (target: any) => Number(target.stopCount) === 500
  );
  const benchmark500Status = benchmark500?.status ?? "missing";
  const runtimeP95Ms = Math.round(metricPercentile(runtimeValues, 95));
  const osrmFailureRate = roundMetric(
    metricPercent(
      routeMetricsRows.reduce(
        (total, row) => total + Number(row.osrmFailureCount ?? row.osrm_failure_count ?? 0),
        0
      ),
      routeMetricsRows.reduce(
        (total, row) => total + Number(row.osrmCallCount ?? row.osrm_call_count ?? 0),
        0
      )
    )
  );

  const issues: Array<{ severity: "warning" | "critical"; message: string }> = [];
  if (routesAboveLimit > 0) {
    issues.push({
      severity: "warning",
      message: `${routesAboveLimit} rota(s) historica(s) acima do limite comercial de ${maxRouteStops} paradas. Novas rotas acima do limite ja sao bloqueadas.`,
    });
  }
  if (benchmark500Status === "missing") {
    issues.push({
      severity: "warning",
      message: `Benchmark oficial de ${maxRouteStops} paradas ainda nao foi executado.`,
    });
  } else if (benchmark500Status !== "ready") {
    issues.push({
      severity: "critical",
      message: `Benchmark oficial de ${maxRouteStops} paradas nao atingiu a meta de 30 segundos.`,
    });
  }
  if (runtimeP95Ms > 60_000) {
    issues.push({
      severity: "warning",
      message: `P95 operacional ate ${maxRouteStops} paradas acima de 60 segundos.`,
    });
  }
  if (osrmFailureRate > 25) {
    issues.push({
      severity: "warning",
      message: `Falha OSRM em ${osrmFailureRate}% das chamadas nas rotas ate ${maxRouteStops} paradas.`,
    });
  }

  const verdict = issues.some((issue) => issue.severity === "critical")
    ? "NO_GO"
    : issues.length > 0
      ? "ATTENTION"
      : "READY";

  return {
    maxRouteStops,
    targetConcurrentUsers: 20,
    targetRegisteredUsers: 200,
    targetConcurrentOptimizations: 5,
    routes: {
      total: routeStopCounts.length,
      averageStops: roundMetric(metricAverage(routeStopCounts)),
      largestRouteStops,
      routesAbove100: routeStopCounts.filter((value) => value > 100).length,
      routesAbove250,
      routesAbove500: routesAboveLimit,
      routesAtLimit,
      routesNearLimit,
      utilizationPercent: roundMetric(
        maxRouteStops > 0 ? (largestRouteStops / maxRouteStops) * 100 : 0
      ),
    },
    runtime: {
      sampleCount: runtimeValues.length,
      averageMs: Math.round(metricAverage(runtimeValues)),
      p50Ms: Math.round(metricPercentile(runtimeValues, 50)),
      p95Ms: runtimeP95Ms,
      p99Ms: Math.round(metricPercentile(runtimeValues, 99)),
    },
    pipeline: {
      auditMsAverage: Math.round(
        metricAverage(routeMetricsRows.map((row) => Number(row.auditMs ?? row.audit_ms ?? 0)))
      ),
      correctionMsAverage: Math.round(
        metricAverage(routeMetricsRows.map((row) => Number(row.correctionMs ?? row.correction_ms ?? 0)))
      ),
      optimizerMsAverage: Math.round(
        metricAverage(routeMetricsRows.map((row) => Number(row.optimizerMs ?? row.optimizer_ms ?? 0)))
      ),
      osrmMsAverage: Math.round(
        metricAverage(routeMetricsRows.map((row) => Number(row.osrmMs ?? row.osrm_ms ?? 0)))
      ),
      osrmFailureRate,
    },
    benchmark500: benchmark500
      ? {
          status: benchmark500Status,
          targetMs: benchmark500.targetMs,
          latestRuntimeMs: benchmark500.latestRuntimeMs,
          latestPeakMemoryMb: benchmark500.latestPeakMemoryMb,
          latestOsrmLatencyMs: benchmark500.latestOsrmLatencyMs,
          runs: benchmark500.runs,
          latestAt: benchmark500.latestAt,
        }
      : {
          status: "missing",
          targetMs: 30_000,
          latestRuntimeMs: 0,
          latestPeakMemoryMb: 0,
          latestOsrmLatencyMs: 0,
          runs: 0,
          latestAt: null,
        },
    verdict,
    issues,
    generatedAt: new Date().toISOString(),
  };
}

export async function getGoLive500Dashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const performanceBenchmarks = await getPerformanceBenchmarkDashboard(safeDays);

  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const stopCountsByRoute = new Map<number, number>();
      for (const route of memory.routes) stopCountsByRoute.set(Number(route.id), 0);
      for (const stop of memory.stops) {
        const routeId = Number(stop.routeId);
        stopCountsByRoute.set(routeId, (stopCountsByRoute.get(routeId) || 0) + 1);
      }
      const routeMetricRows = memory.routeMetrics.filter(
        (metric) => new Date(metric.createdAt).getTime() >= cutoffDate.getTime()
      );
      return buildGoLive500Dashboard({
        routeStopCounts: Array.from(stopCountsByRoute.values()),
        routeMetricRows,
        performanceBenchmarks,
      });
    }
    requireConfiguredDatabase();
  }

  const [routeRows] = await _pool!.query<RowDataPacket[]>(`
    SELECT r.id, COUNT(s.id) AS stopCount
    FROM routes r
    LEFT JOIN stops s ON s.routeId = r.id
    GROUP BY r.id
  `);
  const [metricRows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT
        stopCount,
        totalRuntimeMs,
        optimizationRuntimeMs,
        auditMs,
        correctionMs,
        optimizerMs,
        osrmMs,
        osrmCallCount,
        osrmFailureCount
      FROM route_metrics
      WHERE createdAt >= ?
        AND stopCount > 0
        AND stopCount <= ?
    `,
    [cutoffDate, ENV.maxRouteStops]
  );

  return buildGoLive500Dashboard({
    routeStopCounts: routeRows.map((row) => Number(row.stopCount || 0)),
    routeMetricRows: metricRows,
    performanceBenchmarks,
  });
}

function parseMetricMetadata(metadata: unknown): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof metadata === "object" ? metadata as Record<string, any> : {};
}

function estimateCorrectedKmSaved(metric: any) {
  if (Number(metric.issuesCorrectedCount || 0) <= 0) return 0;

  const metadata = parseMetricMetadata(metric.metadata);
  const candidates = [
    metadata.firstBlockingIssue,
    metadata.blockingIssue,
    ...(Array.isArray(metadata.finalIssues) ? metadata.finalIssues : []),
  ].filter((issue) => issue && typeof issue === "object");

  const bestSaving = candidates.reduce((best, issue) => {
    const distanceKm = Number(issue.distanceKm);
    const nearestDistanceKm = Number(issue.nearestDistanceKm);
    if (
      Number.isFinite(distanceKm) &&
      Number.isFinite(nearestDistanceKm) &&
      distanceKm > nearestDistanceKm
    ) {
      return Math.max(best, distanceKm - nearestDistanceKm);
    }
    return best;
  }, 0);

  return bestSaving;
}

function getMetricRouteMetadata(metric: any) {
  const metadata = parseMetricMetadata(metric.metadata);
  return metadata.routeMetadata && typeof metadata.routeMetadata === "object"
    ? metadata.routeMetadata
    : {};
}

export async function createRouteMetric(data: CreateRouteMetricInput) {
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
    averageGeocodingConfidence: Math.round(
      normalizeMetricNumber(data.averageGeocodingConfidence)
    ),
    minGeocodingConfidence: Math.round(
      normalizeMetricNumber(data.minGeocodingConfidence)
    ),
    suspiciousGeocodingCount: Math.round(
      normalizeMetricNumber(data.suspiciousGeocodingCount)
    ),
    dbFetchMs: Math.round(normalizeMetricNumber(data.dbFetchMs)),
    clusteringMs: Math.round(normalizeMetricNumber(data.clusteringMs)),
    osrmMs: Math.round(normalizeMetricNumber(data.osrmMs)),
    optimizerMs: Math.round(normalizeMetricNumber(data.optimizerMs)),
    auditMs: Math.round(normalizeMetricNumber(data.auditMs)),
    correctionMs: Math.round(normalizeMetricNumber(data.correctionMs)),
    dbSaveMs: Math.round(normalizeMetricNumber(data.dbSaveMs)),
    totalRuntimeMs: Math.round(
      normalizeMetricNumber(data.totalRuntimeMs, data.optimizationRuntimeMs)
    ),
    osrmCallCount: Math.round(normalizeMetricNumber(data.osrmCallCount)),
    osrmFailureCount: Math.round(normalizeMetricNumber(data.osrmFailureCount)),
    osrmTotalMs: Math.round(normalizeMetricNumber(data.osrmTotalMs)),
    osrmAverageMs: Math.round(normalizeMetricNumber(data.osrmAverageMs)),
    osrmProvider: data.osrmProvider?.slice(0, 64) ?? null,
    osrmAvailability: data.osrmAvailability ?? "unknown",
    osrmLatencyMs: Math.round(normalizeMetricNumber(data.osrmLatencyMs)),
    osrmMatrixCount: Math.round(normalizeMetricNumber(data.osrmMatrixCount)),
    osrmMatrixSize: Math.round(normalizeMetricNumber(data.osrmMatrixSize)),
    osrmFailureReason: data.osrmFailureReason?.slice(0, 255) ?? null,
    matrixCacheHit: Math.round(normalizeMetricNumber(data.matrixCacheHit)),
    matrixCacheMiss: Math.round(normalizeMetricNumber(data.matrixCacheMiss)),
    matrixGenerationMs: Math.round(normalizeMetricNumber(data.matrixGenerationMs)),
    macroClusterCount: Math.round(normalizeMetricNumber(data.macroClusterCount)),
    microClusterCount: Math.round(normalizeMetricNumber(data.microClusterCount)),
    largestClusterSize: Math.round(normalizeMetricNumber(data.largestClusterSize)),
    issuesDetectedCount: Math.round(
      normalizeMetricNumber(data.issuesDetectedCount)
    ),
    issuesCorrectedCount: Math.round(
      normalizeMetricNumber(data.issuesCorrectedCount)
    ),
    issuesBlockedCount: Math.round(
      normalizeMetricNumber(data.issuesBlockedCount)
    ),
    auditCycles: Math.round(normalizeMetricNumber(data.auditCycles)),
    issuesRemainingCount: Math.round(
      normalizeMetricNumber(data.issuesRemainingCount)
    ),
    batchCorrectionCount: Math.round(
      normalizeMetricNumber(data.batchCorrectionCount)
    ),
    auditStatus: data.auditStatus,
    auditQuality: data.auditQuality,
    auditSource: data.auditSource?.slice(0, 128) ?? null,
    routeMode: data.routeMode ?? null,
    localityMode: data.localityMode ?? null,
    startedAt: data.startedAt ? new Date(data.startedAt) : null,
    completedAt: data.completedAt ? new Date(data.completedAt) : null,
    executionDurationMs:
      data.executionDurationMs == null
        ? null
        : Math.round(normalizeMetricNumber(data.executionDurationMs)),
    executionStatus: data.executionStatus ?? "pending",
    stopCount: Math.round(normalizeMetricNumber(data.stopCount)),
    totalDistanceKm: String(
      roundMetric(normalizeMetricNumber(data.totalDistanceKm), 2)
    ),
    totalTimeMinutes: Math.round(
      normalizeMetricNumber(data.totalTimeMinutes)
    ),
    metadata: data.metadata ?? null,
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
        createdAt: new Date(),
      };
      memory.routeMetrics.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }

  const inserted = await db
    .insert(routeMetrics)
    .values(metric as any)
    .$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;

  const result = await db
    .select()
    .from(routeMetrics)
    .where(eq(routeMetrics.id, insertedId))
    .limit(1);

  return result[0] ?? null;
}

export async function getOsrmMatrixCache(matrixHash: string) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(osrmMatrixCache)
    .where(eq(osrmMatrixCache.matrixHash, matrixHash))
    .limit(1);
  const cached = rows[0];
  if (!cached) return null;

  await db
    .update(osrmMatrixCache)
    .set({
      lastUsedAt: new Date(),
      hitCount: sql`${osrmMatrixCache.hitCount} + 1`,
    } as any)
    .where(eq(osrmMatrixCache.id, cached.id));

  return cached;
}

export async function upsertOsrmMatrixCache(data: {
  matrixHash: string;
  clusterHash: string;
  stopCount: number;
  durationMatrix: unknown;
  distanceMatrix: unknown;
  profile?: string;
  provider?: string;
  osrmBaseUrl?: string | null;
  expiresAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) return null;

  await db
    .insert(osrmMatrixCache)
    .values({
      matrixHash: data.matrixHash,
      clusterHash: data.clusterHash,
      stopCount: Math.round(normalizeMetricNumber(data.stopCount)),
      durationMatrix: data.durationMatrix as any,
      distanceMatrix: data.distanceMatrix as any,
      profile: data.profile ?? "driving",
      provider: data.provider ?? "osrm",
      osrmBaseUrl: data.osrmBaseUrl ?? null,
      expiresAt: data.expiresAt ?? null,
      lastUsedAt: new Date(),
    } as any)
    .onDuplicateKeyUpdate({
      set: {
        lastUsedAt: new Date(),
        durationMatrix: data.durationMatrix as any,
        distanceMatrix: data.distanceMatrix as any,
        stopCount: Math.round(normalizeMetricNumber(data.stopCount)),
        osrmBaseUrl: data.osrmBaseUrl ?? null,
      } as any,
    });

  const rows = await db
    .select()
    .from(osrmMatrixCache)
    .where(eq(osrmMatrixCache.matrixHash, data.matrixHash))
    .limit(1);
  return rows[0] ?? null;
}

function buildRouteMetricsSummary(metrics: any[], days: number) {
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
    (totalCount, metric) =>
      totalCount + Number(metric.prematureRegionExitCount || 0),
    0
  );
  const nearbySkips = metrics.reduce(
    (totalCount, metric) =>
      totalCount + Number(metric.nearbyStopSkippedCount || 0),
    0
  );
  const crossings = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.routeCrossingCount || 0),
    0
  );
  const suspiciousGeocoding = metrics.reduce(
    (totalCount, metric) =>
      totalCount + Number(metric.suspiciousGeocodingCount || 0),
    0
  );
  const geocodingAverageScores = metrics
    .map((metric) => Number(metric.averageGeocodingConfidence || 0))
    .filter((score) => Number.isFinite(score) && score > 0);
  const geocodingMinScores = metrics
    .map((metric) => Number(metric.minGeocodingConfidence || 0))
    .filter((score) => Number.isFinite(score) && score > 0);
  const geocodingScoreDistribution = {
    excellent: geocodingAverageScores.filter((score) => score >= 90).length,
    good: geocodingAverageScores.filter((score) => score >= 75 && score < 90)
      .length,
    attention: geocodingAverageScores.filter(
      (score) => score >= 60 && score < 75
    ).length,
    suspicious: geocodingAverageScores.filter((score) => score < 60).length,
    notClassified: Math.max(0, total - geocodingAverageScores.length),
  };
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
  const auditCycles = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.auditCycles || 0),
    0
  );
  const issuesRemaining = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.issuesRemainingCount || 0),
    0
  );
  const batchCorrections = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.batchCorrectionCount || 0),
    0
  );
  const clusterEfficiencyBase = metrics.filter(
    (metric) => Number(metric.clusterCount || 0) > 0
  );
  const routesWithRegionalProblems = metrics.filter(
    (metric) =>
      Number(metric.regionRevisitedCount || 0) > 0 ||
      Number(metric.prematureRegionExitCount || 0) > 0
  ).length;
  const estimatedKmSaved = metrics.reduce(
    (totalSaved, metric) => totalSaved + estimateCorrectedKmSaved(metric),
    0
  );
  const estimatedMinutesSaved = estimatedKmSaved * 2.5;
  const estimatedFuelLitersSaved = estimatedKmSaved / 10;
  const estimatedCo2KgAvoided = estimatedFuelLitersSaved * 2.31;
  const partitionedMetrics = metrics.filter((metric) =>
    Boolean(getMetricRouteMetadata(metric).partitioned)
  );
  const partitionCounts = partitionedMetrics.map((metric) =>
    Number(getMetricRouteMetadata(metric).partitionCount || 0)
  );
  const largestPartitionSizes = partitionedMetrics.map((metric) =>
    Number(getMetricRouteMetadata(metric).largestPartitionSize || 0)
  );
  const routeModes = ["shortest_distance", "shortest_time", "balanced"] as const;
  const stageNames = [
    "dbFetchMs",
    "clusteringMs",
    "osrmMs",
    "optimizerMs",
    "auditMs",
    "correctionMs",
    "dbSaveMs",
    "totalRuntimeMs",
  ] as const;
  const performanceStages = Object.fromEntries(
    stageNames.map((stage) => {
      const values = metrics.map((metric) => Number(metric[stage] || 0));
      return [
        stage,
        {
          averageMs: roundMetric(metricAverage(values)),
          p50Ms: roundMetric(metricPercentile(values, 50)),
          p95Ms: roundMetric(metricPercentile(values, 95)),
          p99Ms: roundMetric(metricPercentile(values, 99)),
          maxMs: Math.max(0, ...values),
        },
      ];
    })
  );
  const osrmCallCount = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.osrmCallCount || 0),
    0
  );
  const osrmFailureCount = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.osrmFailureCount || 0),
    0
  );
  const osrmTotalMs = metrics.reduce(
    (totalMs, metric) => totalMs + Number(metric.osrmTotalMs || 0),
    0
  );
  const executionStarted = metrics.filter((metric) =>
    ["started", "completed", "abandoned"].includes(String(metric.executionStatus || ""))
  ).length;
  const executionCompleted = metrics.filter(
    (metric) => metric.executionStatus === "completed"
  ).length;
  const executionAbandoned = metrics.filter(
    (metric) => metric.executionStatus === "abandoned"
  ).length;
  const executionDurations = metrics
    .map((metric) => Number(metric.executionDurationMs || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const modePerformance = routeModes.map((mode) => {
    const modeMetrics = metrics.filter((metric) => metric.routeMode === mode);
    const modeTotal = modeMetrics.length;
    const modeCorrected = modeMetrics.filter(
      (metric) => Number(metric.issuesCorrectedCount || 0) > 0
    ).length;
    const modeFallback = modeMetrics.filter((metric) =>
      Boolean(metric.osrmFallback)
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
      osrmFallbackRate: roundMetric(metricPercent(modeFallback, modeTotal)),
      averageGeocodingConfidence: roundMetric(
        metricAverage(
          modeMetrics.map((metric) =>
            Number(metric.averageGeocodingConfidence || 0)
          )
        )
      ),
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
      ) / 1000,
      2
    ),
    osrmUsedCount: metrics.filter((metric) => Boolean(metric.osrmUsed)).length,
    osrmFallbackCount: osrmFallback,
    osrmFallbackRate: roundMetric(metricPercent(osrmFallback, total)),
    geocodingConfidence: {
      averageScore: roundMetric(
        metricAverage(geocodingAverageScores)
      ),
      minScore: geocodingMinScores.length ? Math.min(...geocodingMinScores) : 0,
      suspiciousStopCount: suspiciousGeocoding,
      suspiciousStopRate: roundMetric(
        metricPercent(
          suspiciousGeocoding,
          metrics.reduce(
            (totalStops, metric) => totalStops + Number(metric.stopCount || 0),
            0
          )
        )
      ),
      scoreDistribution: geocodingScoreDistribution,
    },
    auditorCorrectionRate: roundMetric(metricPercent(corrected, total)),
    regionalReworkIndex: roundMetric(
      metricPercent(revisits + prematureExits, total)
    ),
    regionalRevisitIndex: roundMetric(
      metricPercent(routesWithRegionalProblems, total)
    ),
    clusterEfficiencyIndex: roundMetric(
      100 -
        metricPercent(
          clusterEfficiencyBase.filter(
            (metric) =>
              Number(metric.regionRevisitedCount || 0) > 0 ||
              Number(metric.prematureRegionExitCount || 0) > 0 ||
              Number(metric.nearbyStopSkippedCount || 0) > 0
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
        (metric) =>
          metric.auditStatus === "approved" &&
          Number(metric.issuesDetectedCount || 0) === 0 &&
          Number(metric.issuesCorrectedCount || 0) === 0 &&
          Number(metric.issuesBlockedCount || 0) === 0
      ).length,
    },
    execution: {
      optimizedCount: total,
      startedCount: executionStarted,
      completedCount: executionCompleted,
      abandonedCount: executionAbandoned,
      pendingCount: Math.max(0, total - executionStarted),
      startRate: roundMetric(metricPercent(executionStarted, total)),
      completionRate: roundMetric(metricPercent(executionCompleted, executionStarted)),
      abandonmentRate: roundMetric(metricPercent(executionAbandoned, executionStarted)),
      averageExecutionDurationMs: roundMetric(metricAverage(executionDurations)),
      p50ExecutionDurationMs: roundMetric(metricPercentile(executionDurations, 50)),
      p95ExecutionDurationMs: roundMetric(metricPercentile(executionDurations, 95)),
      p99ExecutionDurationMs: roundMetric(metricPercentile(executionDurations, 99)),
    },
    issues: {
      regionRevisited: revisits,
      prematureRegionExit: prematureExits,
      nearbyStopSkipped: nearbySkips,
      routeCrossing: crossings,
      detected: detectedIssues,
      corrected: correctedIssues,
      blocked: blockedIssues,
      remaining: issuesRemaining,
    },
    optimizerV2: {
      averageAuditCycles: roundMetric(metricAverage(
        metrics.map((metric) => Number(metric.auditCycles || 0))
      )),
      totalAuditCycles: auditCycles,
      batchCorrectionCount: batchCorrections,
      averageIssuesCorrectedPerBatch: roundMetric(
        batchCorrections > 0 ? correctedIssues / batchCorrections : 0
      ),
      issuesRemaining,
    },
    commercialImpact: {
      estimatedKmSaved: roundMetric(estimatedKmSaved, 1),
      estimatedMinutesSaved: Math.round(estimatedMinutesSaved),
      estimatedFuelLitersSaved: roundMetric(estimatedFuelLitersSaved, 1),
      estimatedCo2KgAvoided: roundMetric(estimatedCo2KgAvoided, 1),
    },
    partitioning: {
      partitionedRouteCount: partitionedMetrics.length,
      partitionedRouteRate: roundMetric(metricPercent(partitionedMetrics.length, total)),
      averagePartitionCount: roundMetric(metricAverage(partitionCounts)),
      maxPartitionCount: Math.max(0, ...partitionCounts),
      largestPartitionSize: Math.max(0, ...largestPartitionSizes),
    },
    performance: {
      stages: performanceStages,
      osrm: {
        callCount: osrmCallCount,
        failureCount: osrmFailureCount,
        failureRate: roundMetric(metricPercent(osrmFailureCount, osrmCallCount)),
        totalMs: Math.round(osrmTotalMs),
        averageMs: Math.round(osrmCallCount > 0 ? osrmTotalMs / osrmCallCount : 0),
      },
    },
    modePerformance,
  };
}

export async function getRouteMetricsDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;
      const metrics = memory.routeMetrics.filter(
        (metric) => new Date(metric.createdAt).getTime() >= cutoff
      );
      return buildRouteMetricsSummary(metrics, safeDays);
    }
    requireConfiguredDatabase();
  }

  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const metrics = await db
    .select()
    .from(routeMetrics)
    .where(gte(routeMetrics.createdAt, cutoffDate))
    .orderBy(desc(routeMetrics.createdAt));

  return buildRouteMetricsSummary(metrics, safeDays);
}

function buildExecutionReportPeriod(metrics: any[], blockedEvents: any[], days: number) {
  const optimized = metrics.length;
  const started = metrics.filter((metric) =>
    ["started", "completed", "abandoned"].includes(String(metric.executionStatus || ""))
  ).length;
  const completed = metrics.filter((metric) => metric.executionStatus === "completed").length;
  const abandoned = metrics.filter((metric) => metric.executionStatus === "abandoned").length;
  const pending = Math.max(0, optimized - started);
  const durations = metrics
    .map((metric) => Number(metric.executionDurationMs || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const blockedByReason = blockedEvents.reduce<Record<string, number>>((acc, event) => {
    const metadata = parseOperationalMetadata(event.metadata);
    const reason = String(metadata.reason || metadata.blockReason || "other");
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  return {
    periodDays: days,
    optimizedRoutes: optimized,
    startedRoutes: started,
    completedRoutes: completed,
    abandonedRoutes: abandoned,
    pendingAfterOptimization: pending,
    startBlockedAttempts: blockedEvents.length,
    startBlockedByReason: blockedByReason,
    startRate: roundMetric(metricPercent(started, optimized)),
    completionRate: roundMetric(metricPercent(completed, started)),
    abandonmentRate: roundMetric(metricPercent(abandoned, started)),
    averageExecutionDurationMs: roundMetric(metricAverage(durations)),
    p50ExecutionDurationMs: roundMetric(metricPercentile(durations, 50)),
    p95ExecutionDurationMs: roundMetric(metricPercentile(durations, 95)),
    p99ExecutionDurationMs: roundMetric(metricPercentile(durations, 99)),
    executionStartCount: started,
    executionCompletionCount: completed,
    executionAbandonmentCount: abandoned,
  };
}

async function getExecutionBlockedEvents(days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      return memory.operationalEvents.filter(
        (event) =>
          event.type === "route_start_blocked" &&
          new Date(event.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT id, userId, routeId, type, severity, source, title, message, metadata, createdAt
      FROM operationalEvents FORCE INDEX (operationalEvents_type_createdAt_idx)
      WHERE type = 'route_start_blocked'
        AND createdAt >= ?
      ORDER BY createdAt DESC
      LIMIT 2000
    `,
    [cutoffDate]
  );
  return rows;
}

export async function getOperationExecutionReport() {
  const metrics30 = await getRouteMetricsRows(30);
  const blocked30 = await getExecutionBlockedEvents(30);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const metrics7 = metrics30.filter(
    (metric: any) => new Date(metric.createdAt).getTime() >= sevenDaysAgo
  );
  const blocked7 = blocked30.filter(
    (event) => new Date(event.createdAt).getTime() >= sevenDaysAgo
  );
  const last7Days = buildExecutionReportPeriod(metrics7, blocked7, 7);
  const last30Days = buildExecutionReportPeriod(metrics30, blocked30, 30);

  return {
    generatedAt: new Date().toISOString(),
    last7Days,
    last30Days,
    comparison: {
      startRate: roundMetric(last7Days.startRate - last30Days.startRate),
      completionRate: roundMetric(last7Days.completionRate - last30Days.completionRate),
      abandonmentRate: roundMetric(last7Days.abandonmentRate - last30Days.abandonmentRate),
      optimizedRoutes: last7Days.optimizedRoutes - last30Days.optimizedRoutes,
      startedRoutes: last7Days.startedRoutes - last30Days.startedRoutes,
      completedRoutes: last7Days.completedRoutes - last30Days.completedRoutes,
      abandonedRoutes: last7Days.abandonedRoutes - last30Days.abandonedRoutes,
    },
  };
}

async function getRouteMetricsRows(days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      return memory.routeMetrics.filter(
        (metric) => new Date(metric.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }

  return db
    .select()
    .from(routeMetrics)
    .where(gte(routeMetrics.createdAt, cutoffDate))
    .orderBy(desc(routeMetrics.createdAt));
}

async function getOperationalEventsRows(days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      return sortByDateDesc(
        memory.operationalEvents.filter(
          (event) => new Date(event.createdAt).getTime() >= cutoff
        ),
        "createdAt"
      );
    }
    requireConfiguredDatabase();
  }

  const limit = 2000;
  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT
        id,
        userId,
        routeId,
        stopId,
        type,
        severity,
        source,
        title,
        message,
        runtime,
        url,
        userAgent,
        appVersion,
        metadata,
        createdAt
      FROM operationalEvents FORCE INDEX (operationalEvents_type_idx)
      WHERE createdAt >= ?
        AND type IN (
          'geocoding_cache_hit',
          'geocoding_cache_miss',
          'geocoding_low_confidence',
          'geocoding_manual_correction',
          'geocoding_provider_fallback'
        )
      LIMIT ${limit}
    `,
    [cutoffDate]
  );

  return rows;
}

async function getStopGeocodingRows(days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      return memory.stops.filter(
        (stop) => new Date(stop.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }

  return db
    .select({
      id: stops.id,
      geocodingConfidenceScore: stops.geocodingConfidenceScore,
      geocodingMethod: stops.geocodingMethod,
      geocodingSuspect: stops.geocodingSuspect,
      createdAt: stops.createdAt,
    })
    .from(stops)
    .where(gte(stops.createdAt, cutoffDate));
}

async function getAddressCorrectionRows(days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      return sortByDateDesc(
        memory.addressCorrections.filter(
          (correction) => new Date(correction.createdAt).getTime() >= cutoff
        ),
        "createdAt"
      );
    }
    requireConfiguredDatabase();
  }

  return db
    .select()
    .from(addressCorrections)
    .where(gte(addressCorrections.createdAt, cutoffDate))
    .orderBy(desc(addressCorrections.createdAt));
}

function buildConfidenceBuckets(scores: number[]) {
  return {
    score_0_20: scores.filter((score) => score >= 0 && score <= 20).length,
    score_21_40: scores.filter((score) => score >= 21 && score <= 40).length,
    score_41_60: scores.filter((score) => score >= 41 && score <= 60).length,
    score_61_80: scores.filter((score) => score >= 61 && score <= 80).length,
    score_81_100: scores.filter((score) => score >= 81 && score <= 100).length,
  };
}

function getProviderFromMethod(method: string) {
  if (method === "manual_coordinate") return "manual";
  return "nominatim";
}

function incrementKey(target: Record<string, number>, key: string, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function buildProviderDistribution(events: any[], stopRows: any[]) {
  const providers: Record<string, number> = {};

  for (const stop of stopRows) {
    const provider = getProviderFromMethod(String(stop.geocodingMethod || ""));
    incrementKey(providers, provider);
  }

  for (const event of events) {
    const metadata = parseOperationalMetadata(event.metadata);
    const provider = String(metadata.provider_used || metadata.providerUsed || "");
    if (!provider) continue;
    const amount =
      Number(metadata.geocoding_cache_hit_local || 0) ||
      Number(metadata.geocoding_cache_hit_backend || 0) ||
      Number(metadata.geocoding_cache_miss || 0) ||
      1;
    incrementKey(providers, provider, amount);
  }

  const total = Object.values(providers).reduce((sum, value) => sum + value, 0);
  return Object.entries(providers)
    .sort((a, b) => b[1] - a[1])
    .map(([provider, count]) => ({
      provider,
      count,
      rate: roundMetric(metricPercent(count, total)),
    }));
}

function buildManualCorrectionsSummary(corrections: any[]) {
  const addressCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();

  for (const correction of corrections) {
    const address = String(correction.originalAddress || "").slice(0, 160);
    const city = correction.city || extractCityFromAddress(String(correction.correctedAddress || ""));
    if (address) addressCounts.set(address, (addressCounts.get(address) || 0) + 1);
    if (city) cityCounts.set(String(city), (cityCounts.get(String(city)) || 0) + 1);
  }

  const top = (entries: [string, number][]) =>
    entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count }));

  return {
    count: corrections.length,
    topAddresses: top(Array.from(addressCounts.entries())),
    topCities: top(Array.from(cityCounts.entries())),
  };
}

function buildGeocodingWindowSummary(args: {
  days: number;
  metrics: any[];
  events: any[];
  stops: any[];
  corrections: any[];
}) {
  const routeMetricsSummary = buildRouteMetricsSummary(args.metrics, args.days);
  const stopScores = args.stops
    .map((stop) => Number(stop.geocodingConfidenceScore))
    .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
  const cache = buildGeocodingCacheDashboard(args.events);
  const manualCorrections = buildManualCorrectionsSummary(args.corrections);
  const fiscalLowConfidenceBlocks = args.events.filter((event) => {
    const metadata = parseOperationalMetadata(event.metadata);
    return (
      event.type === "geocoding_low_confidence" ||
      String(metadata.blockingIssueType || metadata.issueType || "") ===
        "low_geocoding_confidence"
    );
  }).length;

  return {
    periodDays: args.days,
    processedRoutes: routeMetricsSummary.routeMetricCount,
    averageConfidence: routeMetricsSummary.geocodingConfidence.averageScore,
    minConfidence: routeMetricsSummary.geocodingConfidence.minScore,
    suspiciousStops: routeMetricsSummary.geocodingConfidence.suspiciousStopCount,
    fiscalBlocks: routeMetricsSummary.routeOutcomes.blockedCount,
    fiscalLowConfidenceBlocks,
    autoCorrections: routeMetricsSummary.routeOutcomes.correctedCount,
    averageOperationalScore: routeMetricsSummary.averageQualityScore,
    confidenceDistribution: buildConfidenceBuckets(stopScores),
    cache,
    providers: buildProviderDistribution(args.events, args.stops),
    manualCorrections,
    fallbackRate: routeMetricsSummary.osrmFallbackRate,
    routeMetrics: routeMetricsSummary,
  };
}

function buildImpactComparison(last7Days: any, last30Days: any) {
  const compare = (current: number, baseline: number) =>
    baseline > 0 ? roundMetric(((current - baseline) / baseline) * 100) : 0;

  return {
    processedRoutes: compare(last7Days.processedRoutes, last30Days.processedRoutes),
    averageConfidence: compare(last7Days.averageConfidence, last30Days.averageConfidence),
    minConfidence: compare(last7Days.minConfidence, last30Days.minConfidence),
    suspiciousStops: compare(last7Days.suspiciousStops, last30Days.suspiciousStops),
    fiscalBlocks: compare(last7Days.fiscalBlocks, last30Days.fiscalBlocks),
    autoCorrections: compare(last7Days.autoCorrections, last30Days.autoCorrections),
    averageOperationalScore: compare(
      last7Days.averageOperationalScore,
      last30Days.averageOperationalScore
    ),
    cacheHitRate: compare(last7Days.cache.hitRate, last30Days.cache.hitRate),
  };
}

export async function getGeocodingImpactDashboard() {
  const [
    metrics7,
    metrics30,
    events7,
    events30,
    stops7,
    stops30,
    corrections7,
    corrections30,
  ] = await Promise.all([
    getRouteMetricsRows(7),
    getRouteMetricsRows(30),
    getOperationalEventsRows(7),
    getOperationalEventsRows(30),
    getStopGeocodingRows(7),
    getStopGeocodingRows(30),
    getAddressCorrectionRows(7),
    getAddressCorrectionRows(30),
  ]);

  const last7Days = buildGeocodingWindowSummary({
    days: 7,
    metrics: metrics7,
    events: events7,
    stops: stops7,
    corrections: corrections7,
  });
  const last30Days = buildGeocodingWindowSummary({
    days: 30,
    metrics: metrics30,
    events: events30,
    stops: stops30,
    corrections: corrections30,
  });

  return {
    last7Days,
    last30Days,
    comparison: buildImpactComparison(last7Days, last30Days),
  };
}

export async function getGeocodingExecutiveReport() {
  const impact = await getGeocodingImpactDashboard();
  return {
    averageConfidence: impact.last30Days.averageConfidence,
    minConfidence: impact.last30Days.minConfidence,
    suspiciousStops: impact.last30Days.suspiciousStops,
    lowConfidenceBlocks: impact.last30Days.fiscalLowConfidenceBlocks,
    cacheRate: impact.last30Days.cache.hitRate,
    fallbackRate: impact.last30Days.fallbackRate,
    manualCorrections: impact.last30Days.manualCorrections.count,
    weeklyEvolution: impact.last7Days,
    monthlyEvolution: impact.last30Days,
    generatedAt: new Date().toISOString(),
  };
}

function parseOperationalMetadata(metadata: unknown): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof metadata === "object" ? (metadata as Record<string, any>) : {};
}

function metadataNumber(metadata: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return undefined;
}

function collectIssueTypes(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  const issueTypes: string[] = [];

  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const issue = item as Record<string, any>;
    if (typeof issue.type === "string") issueTypes.push(issue.type);
    if (issue.blockingIssue?.type) issueTypes.push(String(issue.blockingIssue.type));
  }

  return issueTypes;
}

function buildRouteQualityDashboard(events: any[]) {
  const routeEvents = events.filter((event) => String(event.type || "").startsWith("route_"));
  const scores: number[] = [];
  let corrections = 0;
  let revisitsAvoided = 0;
  let prematureExitsCorrected = 0;
  let routeCrossingsDetected = 0;
  let estimatedKmSaved = 0;

  for (const event of routeEvents) {
    const metadata = parseOperationalMetadata(event.metadata);
    const score = metadataNumber(metadata, ["auditScore", "finalScore", "score"]);
    if (score !== undefined) scores.push(score);

    const issueTypes = [
      ...collectIssueTypes(metadata.firstBlockingIssue),
      ...collectIssueTypes(metadata.issues),
      ...collectIssueTypes(metadata.finalIssues),
      ...collectIssueTypes(metadata.correctionAttempts),
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
      if (
        Number.isFinite(distanceKm) &&
        Number.isFinite(nearestDistanceKm) &&
        distanceKm > nearestDistanceKm
      ) {
        estimatedKmSaved += distanceKm - nearestDistanceKm;
      }
    }
  }

  const averageScore =
    scores.length > 0
      ? scores.reduce((total, score) => total + score, 0) / scores.length
      : 0;

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    scoredRoutes: scores.length,
    corrections,
    revisitsAvoided,
    prematureExitsCorrected,
    routeCrossingsDetected,
    estimatedKmSaved: Math.round(estimatedKmSaved * 10) / 10,
    estimatedMinutesSaved: Math.round(estimatedKmSaved * 2.5),
  };
}

function buildRouteQualityDashboardFromMetrics(
  routeMetricsSummary: ReturnType<typeof buildRouteMetricsSummary>,
  eventFallback: ReturnType<typeof buildRouteQualityDashboard>
) {
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
    osrmFallbackRoutes: routeMetricsSummary.osrmFallbackCount,
  };
}

function buildGeocodingCacheDashboard(events: any[]) {
  let localHits = 0;
  let localMisses = 0;
  let backendHits = 0;
  let misses = 0;

  for (const event of events) {
    const metadata = parseOperationalMetadata(event.metadata);
    localHits += Number(metadata.geocoding_cache_hit_local || 0);
    localMisses += Number(metadata.geocoding_cache_miss_local || 0);
    backendHits += Number(metadata.geocoding_cache_hit_backend || 0);
    misses += Number(metadata.geocoding_cache_miss || 0);

    if (event.type === "geocoding_cache_hit") {
      const provider = String(metadata.provider_used || "");
      if (provider === "cache_local" && !metadata.geocoding_cache_hit_local) {
        localHits += 1;
      }
      if (provider === "cache_backend" && !metadata.geocoding_cache_hit_backend) {
        backendHits += 1;
      }
    }
    if (event.type === "geocoding_cache_miss" && !metadata.geocoding_cache_miss) {
      misses += 1;
    }
  }

  const total = localHits + backendHits + misses;
  const localTotal = localHits + localMisses;
  return {
    localHits,
    localMisses,
    backendHits,
    misses,
    externalCalls: misses,
    callsAvoided: localHits + backendHits,
    hitRate: roundMetric(metricPercent(localHits + backendHits, total)),
    backendReuseRate: roundMetric(metricPercent(backendHits, total)),
    externalCallRate: roundMetric(metricPercent(misses, total)),
    externalCallsSavedRate: roundMetric(metricPercent(localHits + backendHits, total)),
    localReuseRate: roundMetric(metricPercent(localHits, total)),
    localReuseRateFromClient: roundMetric(metricPercent(localHits, localTotal)),
  };
}

async function buildAdminOperationalDashboardLive() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const sevenDaysAgo = now - 7 * oneDay;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const events = sortByDateDesc(memory.operationalEvents, "createdAt");
      const recentUsers = sortByDateDesc(memory.users, "createdAt").slice(0, 8);
      const recentRoutes = sortByDateDesc(memory.routes, "createdAt").slice(0, 8);
      const routeMetrics = buildRouteMetricsSummary(
        memory.routeMetrics.filter(
          (metric) => now - new Date(metric.createdAt).getTime() <= 30 * oneDay
        ),
        30
      );
      const routeQuality = buildRouteQualityDashboardFromMetrics(
        routeMetrics,
        buildRouteQualityDashboard(events.slice(0, 200))
      );
      const geocodingCache = buildGeocodingCacheDashboard(events.slice(0, 500));
      const geocodingImpact = await getGeocodingImpactDashboard();
      const geocodingExecutiveReport = await getGeocodingExecutiveReport();
      const optimizationJobsSummary = await getOptimizationJobsDashboard(30);
      const operationExecutionReport = await getOperationExecutionReport();
      const performanceBenchmarks = await getPerformanceBenchmarkDashboard(30);
      const goLive500 = await getGoLive500Dashboard(30);

      return {
        stats: {
          usersTotal: memory.users.length,
          usersToday: memory.users.filter((user) => new Date(user.createdAt) >= today).length,
          activeUsers7d: new Set(
            memory.operationalEvents
              .filter((event) => new Date(event.createdAt).getTime() >= sevenDaysAgo && event.userId)
              .map((event) => event.userId)
          ).size,
          routesTotal: memory.routes.length,
          routesToday: memory.routes.filter((route) => new Date(route.createdAt) >= today).length,
          events24h: events.filter((event) => now - new Date(event.createdAt).getTime() <= oneDay).length,
          criticalEvents24h: events.filter(
            (event) =>
              now - new Date(event.createdAt).getTime() <= oneDay &&
              ["error", "fatal"].includes(event.severity)
          ).length,
          routeWarnings24h: events.filter(
            (event) =>
              now - new Date(event.createdAt).getTime() <= oneDay &&
              event.severity === "warning" &&
              event.type.startsWith("route_")
          ).length,
        },
        routeQuality,
        routeMetrics,
        optimizationJobs: optimizationJobsSummary,
        operationExecutionReport,
        performanceBenchmarks,
        goLive500,
        geocodingCache,
        geocodingImpact,
        geocodingExecutiveReport,
        recentUsers,
        recentRoutes,
        recentEvents: [],
      };
    }
    requireConfiguredDatabase();
  }

  const [[statsRow], routeMetricsSummary, geocodingImpact, geocodingExecutiveReport, optimizationJobsSummary, operationExecutionReport, performanceBenchmarks, goLive500] =
    await Promise.all([
      _pool!.query<RowDataPacket[]>(`
        SELECT
          (SELECT COUNT(*) FROM users) AS usersTotal,
          (SELECT COUNT(*) FROM users WHERE createdAt >= CURRENT_DATE()) AS usersToday,
          (SELECT COUNT(DISTINCT userId) FROM operationalEvents WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS activeUsers7d,
          (SELECT COUNT(*) FROM routes) AS routesTotal,
          (SELECT COUNT(*) FROM routes WHERE createdAt >= CURRENT_DATE()) AS routesToday,
          (SELECT COUNT(*) FROM operationalEvents WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS events24h,
          (SELECT COUNT(*) FROM operationalEvents WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND severity IN ('error', 'fatal')) AS criticalEvents24h,
          (SELECT COUNT(*) FROM operationalEvents WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND severity = 'warning' AND type LIKE 'route_%') AS routeWarnings24h
      `).then(([rows]) => rows),
      getRouteMetricsDashboard(30),
      getGeocodingImpactDashboard(),
      getGeocodingExecutiveReport(),
      getOptimizationJobsDashboard(30),
      getOperationExecutionReport(),
      getPerformanceBenchmarkDashboard(30),
      getGoLive500Dashboard(30),
    ]);
  const routeQuality = buildRouteQualityDashboardFromMetrics(
    routeMetricsSummary,
    buildRouteQualityDashboard([])
  );
  const geocodingCache = geocodingImpact.last30Days.cache;

  const [recentUsers, recentRoutes] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(8),
    db
      .select({
        id: routes.id,
        userId: routes.userId,
        name: routes.name,
        status: routes.status,
        totalDistance: routes.totalDistance,
        totalTime: routes.totalTime,
        createdAt: routes.createdAt,
        updatedAt: routes.updatedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(routes)
      .leftJoin(users, eq(routes.userId, users.id))
      .orderBy(desc(routes.createdAt))
      .limit(8),
  ]);

  return {
    stats: {
      usersTotal: Number(statsRow?.usersTotal || 0),
      usersToday: Number(statsRow?.usersToday || 0),
      activeUsers7d: Number(statsRow?.activeUsers7d || 0),
      routesTotal: Number(statsRow?.routesTotal || 0),
      routesToday: Number(statsRow?.routesToday || 0),
      events24h: Number(statsRow?.events24h || 0),
      criticalEvents24h: Number(statsRow?.criticalEvents24h || 0),
      routeWarnings24h: Number(statsRow?.routeWarnings24h || 0),
    },
    routeQuality,
    routeMetrics: routeMetricsSummary,
    optimizationJobs: optimizationJobsSummary,
    operationExecutionReport,
    performanceBenchmarks,
    goLive500,
    geocodingCache,
    geocodingImpact,
    geocodingExecutiveReport,
    recentUsers,
    recentRoutes,
    recentEvents: [],
  };
}

function parseDashboardPayload(payload: unknown) {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? payload as Record<string, any> : null;
}

export async function refreshAdminDashboardMetrics() {
  const dashboard = await buildAdminOperationalDashboardLive();
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) return dashboard;
    requireConfiguredDatabase();
  }

  await db.insert(adminDashboardMetrics).values({
    generatedAt: new Date(),
    usersTotal: dashboard.stats.usersTotal,
    activeUsers7d: dashboard.stats.activeUsers7d,
    routesTotal: dashboard.stats.routesTotal,
    routesToday: dashboard.stats.routesToday,
    jobsWaiting: dashboard.optimizationJobs.queued,
    jobsRunning: dashboard.optimizationJobs.running,
    jobsFailed: dashboard.optimizationJobs.failed,
    avgOptimizationRuntime: Math.round(
      dashboard.routeMetrics.averageOptimizationRuntimeMs || 0
    ),
    avgGeocodingConfidence: Math.round(
      dashboard.routeMetrics.geocodingConfidence?.averageScore || 0
    ),
    events24h: dashboard.stats.events24h,
    errors24h: dashboard.stats.criticalEvents24h,
    warnings24h: dashboard.stats.routeWarnings24h,
    payload: dashboard,
  });

  return {
    ...dashboard,
    materialized: {
      generatedAt: new Date().toISOString(),
      refreshed: true,
      stale: false,
    },
  };
}

export async function getAdminOperationalDashboard() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) return buildAdminOperationalDashboardLive();
    requireConfiguredDatabase();
  }

  try {
    const latest = await db
      .select()
      .from(adminDashboardMetrics)
      .orderBy(desc(adminDashboardMetrics.generatedAt))
      .limit(1);
    const row = latest[0];
    const payload = parseDashboardPayload(row?.payload);
    if (row && payload) {
      const generatedAt = new Date(row.generatedAt);
      const ageMs = Date.now() - generatedAt.getTime();
      return {
        ...payload,
        recentEvents: [],
        materialized: {
          generatedAt: generatedAt.toISOString(),
          refreshed: false,
          stale: ageMs > 5 * 60 * 1000,
          ageMs,
        },
      };
    }
  } catch (error) {
    console.warn("[Admin] Failed to load materialized dashboard:", error);
  }

  return refreshAdminDashboardMetrics();
}

export async function getAdminDashboardEvents(page = 1, limit = 30) {
  const safeLimit = Math.min(Math.max(Math.round(limit), 1), 100);
  const safePage = Math.max(Math.round(page), 1);
  const offset = (safePage - 1) * safeLimit;
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const rows = sortByDateDesc(memory.operationalEvents, "createdAt");
      return {
        page: safePage,
        limit: safeLimit,
        events: rows.slice(offset, offset + safeLimit),
        hasMore: rows.length > offset + safeLimit,
      };
    }
    requireConfiguredDatabase();
  }

  const [rows] = await _pool!.query<RowDataPacket[]>(
    `
      SELECT
        e.id,
        e.userId,
        e.routeId,
        e.stopId,
        e.type,
        e.severity,
        e.source,
        e.title,
        e.message,
        e.runtime,
        e.url,
        e.userAgent,
        e.appVersion,
        e.metadata,
        e.createdAt,
        u.name as userName,
        u.email as userEmail,
        r.name as routeName
      FROM operationalEvents e FORCE INDEX (operationalEvents_createdAt_idx)
      LEFT JOIN users u ON e.userId = u.id
      LEFT JOIN routes r ON e.routeId = r.id
      ORDER BY e.createdAt DESC
      LIMIT ${safeLimit + 1}
      OFFSET ${offset}
    `
  );

  return {
    page: safePage,
    limit: safeLimit,
    events: rows.slice(0, safeLimit),
    hasMore: rows.length > safeLimit,
  };
}

// ==================== ANALYTICS ====================

export async function getUserStats(userId: number, days = 30) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const userRoutes = memory.routes.filter(
        (route) =>
          route.userId === userId && new Date(route.createdAt) >= cutoffDate
      );
      const userCompletedHistory = memory.routeHistory.filter(
        (history) =>
          history.userId === userId &&
          history.status === "completed" &&
          new Date(history.executedDate) >= cutoffDate
      );
      const distances = userRoutes.map((route) => Number(route.totalDistance || 0));
      const times = userRoutes
        .map((route) => Number(route.totalTime || 0))
        .filter((time) => time > 0);

      return {
        totalRoutes: userRoutes.length,
        totalDistance: distances.reduce((sum, value) => sum + value, 0),
        avgTime:
          times.length > 0
            ? times.reduce((sum, value) => sum + value, 0) / times.length
            : 0,
        completedRoutes: userCompletedHistory.length,
      };
    }
    requireConfiguredDatabase();
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const totalRoutes = await db.select({ count: sql`COUNT(*)` })
    .from(routes)
    .where(and(eq(routes.userId, userId), gte(routes.createdAt, cutoffDate)));

  const totalDistance = await db.select({ sum: sql`SUM(totalDistance)` })
    .from(routes)
    .where(and(eq(routes.userId, userId), gte(routes.createdAt, cutoffDate)));

  const avgTime = await db.select({ avg: sql`AVG(totalTime)` })
    .from(routes)
    .where(and(eq(routes.userId, userId), gte(routes.createdAt, cutoffDate)));

  const completedRoutes = await db.select({ count: sql`COUNT(*)` })
    .from(routeHistory)
    .where(and(eq(routeHistory.userId, userId), eq(routeHistory.status, "completed"), gte(routeHistory.executedDate, cutoffDate)));

  return {
    totalRoutes: Number(totalRoutes[0]?.count || 0),
    totalDistance: parseFloat(String(totalDistance[0]?.sum || "0")),
    avgTime: Number(avgTime[0]?.avg || 0),
    completedRoutes: Number(completedRoutes[0]?.count || 0),
  };
}

export async function getRouteStatsOverTime(userId: number, days = 30) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const grouped = new Map<
        string,
        { date: string; count: number; totalDistance: number; totalTime: number }
      >();

      for (const history of memory.routeHistory) {
        if (history.userId !== userId || new Date(history.executedDate) < startDate) {
          continue;
        }

        const date = toDateKey(history.executedDate);
        const current =
          grouped.get(date) ?? { date, count: 0, totalDistance: 0, totalTime: 0 };

        current.count += 1;
        current.totalDistance += Number(history.actualDistance || 0);
        current.totalTime += Number(history.actualTime || 0);
        grouped.set(date, current);
      }

      return Array.from(grouped.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    }
    requireConfiguredDatabase();
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return db.select({
    date: sql`DATE(executedDate)`,
    count: sql`COUNT(*)`,
    totalDistance: sql`SUM(actualDistance)`,
    totalTime: sql`SUM(actualTime)`,
  })
    .from(routeHistory)
    .where(and(
      eq(routeHistory.userId, userId),
      sql`executedDate >= ${startDate}`
    ))
    .groupBy(sql`DATE(executedDate)`)
    .orderBy(asc(sql`DATE(executedDate)`));
}

