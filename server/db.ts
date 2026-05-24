import { eq, and, desc, asc, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import type { PoolOptions } from "mysql2/promise";
import { InsertUser, users, routes, stops, routeSchedules, routeHistory, chatHistory } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;
let _lastDbConnectAttempt = 0;

const DB_CONNECT_RETRY_MS = 30_000;
const LOCAL_DB_DIR = path.join(process.cwd(), ".data");
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, "routing-pwa-db.json");
let localDbLoaded = false;

const memory = {
  users: [] as any[],
  routes: [] as any[],
  stops: [] as any[],
  routeSchedules: [] as any[],
  routeHistory: [] as any[],
  chatHistory: [] as any[],
  ids: {
    users: 1,
    routes: 1,
    stops: 1,
    routeSchedules: 1,
    routeHistory: 1,
    chatHistory: 1,
  },
};

function shouldPersistLocalDb() {
  return (
    (!ENV.isProduction || ENV.allowEphemeralDb) &&
    process.env.NODE_ENV !== "test" &&
    process.env.VITEST !== "true"
  );
}

function loadLocalDb() {
  if (localDbLoaded) return;
  localDbLoaded = true;

  if (!shouldPersistLocalDb() || !fs.existsSync(LOCAL_DB_FILE)) {
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, "utf-8"));
    memory.users = Array.isArray(data.users) ? data.users : [];
    memory.routes = Array.isArray(data.routes) ? data.routes : [];
    memory.stops = Array.isArray(data.stops) ? data.stops : [];
    memory.routeSchedules = Array.isArray(data.routeSchedules)
      ? data.routeSchedules
      : [];
    memory.routeHistory = Array.isArray(data.routeHistory) ? data.routeHistory : [];
    memory.chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    memory.ids = {
      users: Number(data.ids?.users) || 1,
      routes: Number(data.ids?.routes) || 1,
      stops: Number(data.ids?.stops) || 1,
      routeSchedules: Number(data.ids?.routeSchedules) || 1,
      routeHistory: Number(data.ids?.routeHistory) || 1,
      chatHistory: Number(data.ids?.chatHistory) || 1,
    };
  } catch (error) {
    console.warn("[Database] Failed to load local fallback database:", error);
  }
}

function persistLocalDb() {
  if (!shouldPersistLocalDb()) return;

  try {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.warn("[Database] Failed to persist local fallback database:", error);
  }
}

function shouldUseMemoryDb() {
  if (ENV.isProduction && !ENV.allowEphemeralDb) return false;
  loadLocalDb();
  return true;
}

function requireConfiguredDatabase(): never {
  throw new Error("Database not available");
}

function shouldUseDatabaseSsl(databaseUrl: string) {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;

  return /ssl-mode=required|tidbcloud|aivencloud|planetscale|railway/i.test(
    databaseUrl
  );
}

function createDatabasePool(databaseUrl: string) {
  if (!shouldUseDatabaseSsl(databaseUrl)) {
    return mysql.createPool(databaseUrl);
  }

  const poolOptions: PoolOptions = {
    uri: databaseUrl,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    },
  };

  return mysql.createPool(poolOptions);
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

  const now = Date.now();
  if (!ENV.isProduction && now - _lastDbConnectAttempt < DB_CONNECT_RETRY_MS) {
    return null;
  }

  _lastDbConnectAttempt = now;

  try {
    const pool = createDatabasePool(process.env.DATABASE_URL);
    await pool.query("SELECT 1");
    _db = drizzle(pool);
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _db = null;
  }

  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      const existing = memory.users.find((item) => item.openId === user.openId);
      const now = new Date();
      const nextUser = {
        id: existing?.id ?? memory.ids.users++,
        openId: user.openId,
        name: user.name ?? existing?.name ?? null,
        email: user.email ?? existing?.email ?? null,
        passwordHash: user.passwordHash ?? existing?.passwordHash ?? null,
        loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
        role: user.role ?? existing?.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      };

      if (existing) {
        Object.assign(existing, nextUser);
      } else {
        memory.users.push(nextUser);
      }
      persistLocalDb();
      return;
    }

    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "passwordHash", "loginMethod"] as const;
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
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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

export async function countUsers() {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      return memory.users.length;
    }
    requireConfiguredDatabase();
  }

  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  return Number(result[0]?.count || 0);
}

export async function createPasswordUser(user: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
}) {
  const now = new Date();
  const values: InsertUser = {
    openId: user.openId,
    name: user.name,
    email: user.email.trim().toLowerCase(),
    passwordHash: user.passwordHash,
    loginMethod: "password",
    role: user.role ?? "user",
    lastSignedIn: now,
  };

  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      if (memory.users.some((item) => item.openId === user.openId)) {
        throw new Error("Usuario ja existe");
      }
      const created = {
        id: memory.ids.users++,
        ...values,
        createdAt: now,
        updatedAt: now,
      };
      memory.users.push(created);
      persistLocalDb();
      return created;
    }
    requireConfiguredDatabase();
  }

  await db.insert(users).values(values);
  return getUserByOpenId(user.openId);
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
      const route = memory.routes.find(
        (item) => item.id === routeId && item.userId === userId
      );
      if (route) {
        Object.assign(route, data, { updatedAt: new Date() });
        persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
}>) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      const now = new Date();
      const createdStops = stopsData.map((stop) => ({
        id: memory.ids.stops++,
        routeId,
        address: stop.address,
        latitude: stop.latitude ? String(stop.latitude) : null,
        longitude: stop.longitude ? String(stop.longitude) : null,
        sequence: stop.sequence,
        notes: stop.notes ?? null,
        createdAt: now,
      }));

      memory.stops.push(...createdStops);
      persistLocalDb();
      return getRouteStops(routeId);
    }
    requireConfiguredDatabase();
  }

  const values = stopsData.map(s => ({
    routeId,
    address: s.address,
    latitude: s.latitude ? String(s.latitude) : null,
    longitude: s.longitude ? String(s.longitude) : null,
    sequence: s.sequence,
    notes: s.notes,
  }));

  await db.insert(stops).values(values as any);
  
  // Return the created stops
  return getRouteStops(routeId);
}

export async function getRouteStops(routeId: number) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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

export async function deleteRouteStops(routeId: number) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      memory.stops = memory.stops.filter((stop) => stop.routeId !== routeId);
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
      const schedule = memory.routeSchedules.find(
        (item) => item.id === scheduleId && item.userId === userId
      );
      if (schedule) {
        Object.assign(schedule, data, { updatedAt: new Date() });
        persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routeHistory.filter((history) => history.userId === userId),
        "executedDate"
      ).slice(offset, offset + limit);
    }
    requireConfiguredDatabase();
  }

  return db.select().from(routeHistory)
    .where(eq(routeHistory.userId, userId))
    .orderBy(desc(routeHistory.executedDate))
    .limit(limit)
    .offset(offset);
}

export async function getRouteHistory(routeId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
      const history = memory.routeHistory.find(
        (item) => item.id === historyId && item.userId === userId
      );
      if (history) {
        Object.assign(history, data, { updatedAt: new Date() });
        if (data.actualDistance !== undefined) {
          history.actualDistance = String(data.actualDistance);
        }
        persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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

// ==================== ANALYTICS ====================

export async function getUserStats(userId: number, days = 30) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
