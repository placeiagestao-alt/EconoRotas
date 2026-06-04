import { eq, and, desc, asc, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
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
  geocodeCache,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  calculateGeocodingConfidence,
  summarizeGeocodingConfidence,
  type GeocodingMethod,
} from "../shared/geocodingConfidence";

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
  geocodeCache: [] as any[],
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
    geocodeCache: 1,
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
  memory.geocodeCache = Array.isArray(data.geocodeCache) ? data.geocodeCache : [];
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
    geocodeCache: Number(data.ids?.geocodeCache) || 1,
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
  ["userIntegrations", "authTokenEncrypted"],
  ["operationalEvents", "type"],
  ["operationalEvents", "severity"],
  ["route_metrics", "qualityScore"],
  ["route_metrics", "optimizationRuntimeMs"],
  ["route_metrics", "osrmUsed"],
  ["route_metrics", "issuesCorrectedCount"],
  ["route_metrics", "averageGeocodingConfidence"],
  ["route_metrics", "minGeocodingConfidence"],
  ["route_metrics", "suspiciousGeocodingCount"],
  ["geocode_cache", "cacheKey"],
  ["geocode_cache", "results"],
  ["geocode_cache", "expiresAt"],
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
  geocodingConfidenceScore?: number;
  geocodingMethod?: GeocodingMethod | string;
  geocodingSuspect?: boolean;
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
  geocodingConfidenceScore: number;
  geocodingMethod: GeocodingMethod | string;
  geocodingSuspect: boolean;
}>) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const stop = memory.stops.find(
        (item) => item.id === stopId && item.routeId === routeId
      );
      if (!stop) return null;

      Object.assign(stop, {
        ...data,
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

  await db.update(stops)
    .set({
      ...data,
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

    return result[0] ?? null;
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

  return result[0] ?? null;
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

  return db
    .select({
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
      routeName: routes.name,
    })
    .from(operationalEvents)
    .leftJoin(users, eq(operationalEvents.userId, users.id))
    .leftJoin(routes, eq(operationalEvents.routeId, routes.id))
    .orderBy(desc(operationalEvents.createdAt))
    .limit(safeLimit);
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

// ==================== ROUTE METRICS ====================

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
  issuesDetectedCount: number;
  issuesCorrectedCount: number;
  issuesBlockedCount: number;
  auditStatus: "approved" | "attention" | "critical";
  auditQuality: "excellent" | "good" | "attention" | "poor" | "blocked";
  auditSource?: string | null;
  routeMode?: "shortest_distance" | "shortest_time" | "balanced" | null;
  localityMode?: "balanced" | "local" | "strict" | null;
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

function metricPercent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function roundMetric(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
    issues: {
      regionRevisited: revisits,
      prematureRegionExit: prematureExits,
      nearbyStopSkipped: nearbySkips,
      routeCrossing: crossings,
      detected: detectedIssues,
      corrected: correctedIssues,
      blocked: blockedIssues,
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

  for (const event of events) {
    if (event.type !== "geocoding_cache_client_metrics") continue;
    const metadata = parseOperationalMetadata(event.metadata);
    localHits += Number(metadata.geocoding_cache_hit_local || 0);
    localMisses += Number(metadata.geocoding_cache_miss_local || 0);
  }

  const total = localHits + localMisses;
  return {
    localHits,
    localMisses,
    localReuseRate: roundMetric(metricPercent(localHits, total)),
  };
}

export async function getAdminOperationalDashboard() {
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
        geocodingCache,
        recentUsers,
        recentRoutes,
        recentEvents: events.slice(0, 12),
      };
    }
    requireConfiguredDatabase();
  }

  const [usersTotal] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  const [usersToday] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(sql`DATE(${users.createdAt}) = CURRENT_DATE()`);
  const [activeUsers7d] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${operationalEvents.userId})` })
    .from(operationalEvents)
    .where(sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  const [routesTotal] = await db.select({ count: sql<number>`COUNT(*)` }).from(routes);
  const [routesToday] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(routes)
    .where(sql`DATE(${routes.createdAt}) = CURRENT_DATE()`);
  const [events24h] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(operationalEvents)
    .where(sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`);
  const [criticalEvents24h] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(operationalEvents)
    .where(
      and(
        sql`${operationalEvents.createdAt} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
        sql`${operationalEvents.severity} IN ('error', 'fatal')`
      )
    );
  const [routeWarnings24h] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(operationalEvents)
    .where(
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
  const geocodingCache = buildGeocodingCacheDashboard(recentOperationalEvents);

  const recentUsers = await db
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
    .limit(8);

  const recentRoutes = await db
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
    .limit(8);

  return {
    stats: {
      usersTotal: Number(usersTotal?.count || 0),
      usersToday: Number(usersToday?.count || 0),
      activeUsers7d: Number(activeUsers7d?.count || 0),
      routesTotal: Number(routesTotal?.count || 0),
      routesToday: Number(routesToday?.count || 0),
      events24h: Number(events24h?.count || 0),
      criticalEvents24h: Number(criticalEvents24h?.count || 0),
      routeWarnings24h: Number(routeWarnings24h?.count || 0),
    },
    routeQuality,
    routeMetrics: routeMetricsSummary,
    geocodingCache,
    recentUsers,
    recentRoutes,
    recentEvents: recentOperationalEvents.slice(0, 12),
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

