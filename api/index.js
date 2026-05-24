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
import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, foreignKey } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
var users, routes, stops, routeSchedules, routeHistory, chatHistory, usersRelations, routesRelations, stopsRelations, routeSchedulesRelations, routeHistoryRelations, chatHistoryRelations;
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
    usersRelations = relations(users, ({ many }) => ({
      routes: many(routes),
      routeSchedules: many(routeSchedules),
      routeHistory: many(routeHistory),
      chatHistory: many(chatHistory)
    }));
    routesRelations = relations(routes, ({ one, many }) => ({
      user: one(users, { fields: [routes.userId], references: [users.id] }),
      stops: many(stops),
      schedules: many(routeSchedules),
      history: many(routeHistory),
      chats: many(chatHistory)
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
  }
});

// server/_core/env.ts
var isVercel, demoCookieSecret, ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    isVercel = Boolean(
      process.env.VERCEL || process.env.VERCEL_URL || process.env.NOW_REGION
    );
    demoCookieSecret = "econorotas-vercel-demo-session-secret-change-before-production";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? (isVercel ? demoCookieSecret : ""),
      databaseUrl: process.env.DATABASE_URL ?? "",
      databaseSsl: process.env.DATABASE_SSL ?? "",
      databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      ownerEmail: process.env.OWNER_EMAIL ?? "",
      publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
      allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
      isProduction: process.env.NODE_ENV === "production",
      allowEphemeralDb: process.env.ALLOW_EPHEMERAL_DB === "true" || isVercel,
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
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
    memory.routeSchedules = Array.isArray(data.routeSchedules) ? data.routeSchedules : [];
    memory.routeHistory = Array.isArray(data.routeHistory) ? data.routeHistory : [];
    memory.chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    memory.ids = {
      users: Number(data.ids?.users) || 1,
      routes: Number(data.ids?.routes) || 1,
      stops: Number(data.ids?.stops) || 1,
      routeSchedules: Number(data.ids?.routeSchedules) || 1,
      routeHistory: Number(data.ids?.routeHistory) || 1,
      chatHistory: Number(data.ids?.chatHistory) || 1
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
function requireConfiguredDatabase() {
  throw new Error("Database not available");
}
function shouldUseDatabaseSsl(databaseUrl) {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  return /ssl-mode=required|tidbcloud|aivencloud|planetscale|railway/i.test(
    databaseUrl
  );
}
function createDatabasePool(databaseUrl) {
  if (!shouldUseDatabaseSsl(databaseUrl)) {
    return mysql.createPool(databaseUrl);
  }
  const poolOptions = {
    uri: databaseUrl,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"
    }
  };
  return mysql.createPool(poolOptions);
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      const existing = memory.users.find((item) => item.openId === user.openId);
      const now = /* @__PURE__ */ new Date();
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
        lastSignedIn: user.lastSignedIn ?? now
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
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "passwordHash", "loginMethod"];
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
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
async function countUsers() {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      return memory.users.length;
    }
    requireConfiguredDatabase();
  }
  const result = await db.select({ count: sql`COUNT(*)` }).from(users);
  return Number(result[0]?.count || 0);
}
async function createPasswordUser(user) {
  const now = /* @__PURE__ */ new Date();
  const values = {
    openId: user.openId,
    name: user.name,
    email: user.email.trim().toLowerCase(),
    passwordHash: user.passwordHash,
    loginMethod: "password",
    role: user.role ?? "user",
    lastSignedIn: now
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
        updatedAt: now
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
async function createRoute(userId, data) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
      const route = memory.routes.find(
        (item) => item.id === routeId && item.userId === userId
      );
      if (route) {
        Object.assign(route, data, { updatedAt: /* @__PURE__ */ new Date() });
        persistLocalDb();
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
  await db.delete(routes).where(and(eq(routes.id, routeId), eq(routes.userId, userId)));
}
async function createStops(routeId, stopsData) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      const now = /* @__PURE__ */ new Date();
      const createdStops = stopsData.map((stop) => ({
        id: memory.ids.stops++,
        routeId,
        address: stop.address,
        latitude: stop.latitude ? String(stop.latitude) : null,
        longitude: stop.longitude ? String(stop.longitude) : null,
        sequence: stop.sequence,
        notes: stop.notes ?? null,
        createdAt: now
      }));
      memory.stops.push(...createdStops);
      persistLocalDb();
      return getRouteStops(routeId);
    }
    requireConfiguredDatabase();
  }
  const values = stopsData.map((s) => ({
    routeId,
    address: s.address,
    latitude: s.latitude ? String(s.latitude) : null,
    longitude: s.longitude ? String(s.longitude) : null,
    sequence: s.sequence,
    notes: s.notes
  }));
  await db.insert(stops).values(values);
  return getRouteStops(routeId);
}
async function getRouteStops(routeId) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      return [...memory.stops].filter((stop) => stop.routeId === routeId).sort((a, b) => a.sequence - b.sequence);
    }
    requireConfiguredDatabase();
  }
  return db.select().from(stops).where(eq(stops.routeId, routeId)).orderBy(asc(stops.sequence));
}
async function deleteRouteStops(routeId) {
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
async function createSchedule(userId, data) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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
    isActive: true
  });
  const result = await db.select().from(routeSchedules).where(eq(routeSchedules.userId, userId)).orderBy(desc(routeSchedules.createdAt)).limit(1);
  return result[0] || null;
}
async function getScheduleById(scheduleId, userId) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
      const schedule = memory.routeSchedules.find(
        (item) => item.id === scheduleId && item.userId === userId
      );
      if (schedule) {
        Object.assign(schedule, data, { updatedAt: /* @__PURE__ */ new Date() });
        persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
      return sortByDateDesc(
        memory.routeHistory.filter((history) => history.userId === userId),
        "executedDate"
      ).slice(offset, offset + limit);
    }
    requireConfiguredDatabase();
  }
  return db.select().from(routeHistory).where(eq(routeHistory.userId, userId)).orderBy(desc(routeHistory.executedDate)).limit(limit).offset(offset);
}
async function getRouteHistory(routeId, userId) {
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
  return db.select().from(routeHistory).where(and(eq(routeHistory.routeId, routeId), eq(routeHistory.userId, userId))).orderBy(desc(routeHistory.executedDate));
}
async function updateHistory(historyId, userId, data) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
      const history = memory.routeHistory.find(
        (item) => item.id === historyId && item.userId === userId
      );
      if (history) {
        Object.assign(history, data, { updatedAt: /* @__PURE__ */ new Date() });
        if (data.actualDistance !== void 0) {
          history.actualDistance = String(data.actualDistance);
        }
        persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
      persistLocalDb();
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
    if (shouldUseMemoryDb()) {
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
async function getUserStats(userId, days = 30) {
  const db = await getDb();
  if (!db) {
    if (shouldUseMemoryDb()) {
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
    if (shouldUseMemoryDb()) {
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
var _db, _lastDbConnectAttempt, DB_CONNECT_RETRY_MS, LOCAL_DB_DIR, LOCAL_DB_FILE, localDbLoaded, memory;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    _db = null;
    _lastDbConnectAttempt = 0;
    DB_CONNECT_RETRY_MS = 3e4;
    LOCAL_DB_DIR = path.join(process.cwd(), ".data");
    LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, "routing-pwa-db.json");
    localDbLoaded = false;
    memory = {
      users: [],
      routes: [],
      stops: [],
      routeSchedules: [],
      routeHistory: [],
      chatHistory: [],
      ids: {
        users: 1,
        routes: 1,
        stops: 1,
        routeSchedules: 1,
        routeHistory: 1,
        chatHistory: 1
      }
    };
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
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
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

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/oauth.ts
init_db();

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
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
init_env();
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    if (!ENV.oAuthServerUrl) {
      console.info("[OAuth] Disabled: OAUTH_SERVER_URL is not configured.");
      return;
    }
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
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
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
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
      console.warn("[Auth] Missing session cookie");
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
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
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
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
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
      const ownerEmail = ENV.ownerEmail.trim().toLowerCase();
      const email = session.email?.trim().toLowerCase() || null;
      const usersCount = await countUsers();
      await upsertUser({
        openId: session.openId,
        name: session.name || null,
        email,
        loginMethod: "password",
        role: usersCount === 0 || email && ownerEmail === email ? "admin" : "user",
        lastSignedIn: signedInAt
      });
      user = await getUserByOpenId(session.openId);
    }
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
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
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
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
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
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
var NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var cache = /* @__PURE__ */ new Map();
function getNominatimUserAgent() {
  return process.env.NOMINATIM_USER_AGENT || `routing-pwa/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "local-development"})`;
}
function getCached(cacheKey) {
  const cached = cache.get(cacheKey);
  if (!cached) {
    return void 0;
  }
  if (cached.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return void 0;
  }
  return cached.data;
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
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
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
      const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": getNominatimUserAgent()
        }
      });
      if (!response.ok) {
        const body = await response.text();
        res.status(response.status).json({
          error: "Nao foi possivel consultar o servico de enderecos.",
          details: body.slice(0, 200)
        });
        return;
      }
      const data = await response.json();
      cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      res.json(data);
    } catch (error) {
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
    if (!ctx.user || ctx.user.role !== "admin") {
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
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
var scrypt = promisify(scryptCallback);
var KEY_LENGTH = 64;
var HASH_PREFIX = "scrypt";
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function buildPasswordOpenId(email) {
  const digest = createHash("sha256").update(normalizeEmail(email)).digest("hex");
  return `pwd_${digest.slice(0, 60)}`;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
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

// server/optimization.ts
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
function optimizeRouteNearestNeighbor(locations, startIndex = 0, options = {}) {
  if (locations.length === 0) {
    if (options.startLocation && options.endLocation) {
      const distance = calculateDistance(options.startLocation, options.endLocation);
      return {
        sequence: [],
        totalDistance: Math.round(distance * 100) / 100,
        totalTime: estimateTravelTime(distance),
        waypoints: []
      };
    }
    return {
      sequence: [],
      totalDistance: 0,
      totalTime: 0,
      waypoints: []
    };
  }
  if (options.startLocation || options.endLocation) {
    const n2 = locations.length;
    const visited2 = new Array(n2).fill(false);
    const sequence2 = [];
    let totalDistance2 = 0;
    let totalTime2 = 0;
    let currentLocation = options.startLocation ?? locations[startIndex];
    if (!options.startLocation) {
      visited2[startIndex] = true;
      sequence2.push(startIndex);
    }
    while (sequence2.length < n2) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      for (let i = 0; i < n2; i++) {
        if (visited2[i]) continue;
        const distance = calculateDistance(currentLocation, locations[i]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
      if (nearestIndex === -1) {
        break;
      }
      visited2[nearestIndex] = true;
      sequence2.push(nearestIndex);
      totalDistance2 += nearestDistance;
      totalTime2 += estimateTravelTime(nearestDistance);
      currentLocation = locations[nearestIndex];
    }
    if (options.endLocation) {
      const distanceToEnd = calculateDistance(currentLocation, options.endLocation);
      totalDistance2 += distanceToEnd;
      totalTime2 += estimateTravelTime(distanceToEnd);
    }
    const waypoints2 = sequence2.map((idx, seq) => ({
      ...locations[idx],
      sequence: seq
    }));
    return {
      sequence: sequence2,
      totalDistance: Math.round(totalDistance2 * 100) / 100,
      totalTime: totalTime2,
      waypoints: waypoints2
    };
  }
  if (locations.length === 1) {
    return {
      sequence: [0],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [{ ...locations[0], sequence: 0 }]
    };
  }
  const n = locations.length;
  const visited = new Array(n).fill(false);
  const sequence = [];
  let currentIndex = startIndex;
  let totalDistance = 0;
  let totalTime = 0;
  visited[currentIndex] = true;
  sequence.push(currentIndex);
  for (let i = 1; i < n; i++) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        const distance = calculateDistance(locations[currentIndex], locations[j]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = j;
        }
      }
    }
    if (nearestIndex !== -1) {
      visited[nearestIndex] = true;
      sequence.push(nearestIndex);
      totalDistance += nearestDistance;
      totalTime += estimateTravelTime(nearestDistance);
      currentIndex = nearestIndex;
    }
  }
  const waypoints = sequence.map((idx, seq) => ({
    ...locations[idx],
    sequence: seq
  }));
  return {
    sequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime,
    waypoints
  };
}
function optimizeRoute(locations, mode = "balanced", startIndex = 0, options = {}) {
  return optimizeRouteNearestNeighbor(locations, startIndex, options);
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
    context += routes2.map((r) => `- ${r.name} (${r.mode}, ${r.totalDistance?.toFixed(2) || "N/A"} km)`).join("\n");
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
async function chatWithLLM(userId, userMessage, routeId, previousMessages = []) {
  try {
    const routeContext = await buildRouteContext(userId, routeId);
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
    throw new Error("Erro ao processar mensagem com IA");
  }
}
function formatChatHistory(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content
  }));
}

// server/routers.ts
function toOptionalLocation(address, latitudeValue, longitudeValue) {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return void 0;
  }
  return {
    address: typeof address === "string" ? address : void 0,
    latitude,
    longitude
  };
}
async function requireUserRoute(routeId, userId) {
  const route = await getRouteById(routeId, userId);
  if (!route) {
    throw new TRPCError3({
      code: "NOT_FOUND",
      message: "Rota nao encontrada."
    });
  }
  return route;
}
var credentialsSchema = z2.object({
  email: z2.string().email("Informe um e-mail valido."),
  password: z2.string().min(8, "A senha deve ter pelo menos 8 caracteres.")
});
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
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
    me: publicProcedure.query((opts) => sanitizeUser(opts.ctx.user)),
    login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const user = await getUserByEmail(email);
      const isValidPassword = await verifyPassword(
        input.password,
        user?.passwordHash
      );
      if (!user || !isValidPassword) {
        throw new TRPCError3({
          code: "UNAUTHORIZED",
          message: "E-mail ou senha invalidos."
        });
      }
      await upsertUser({
        openId: user.openId,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      await setPasswordSession(ctx, user.openId, user.name, user.email);
      return sanitizeUser(await getUserByOpenId(user.openId) ?? user);
    }),
    register: publicProcedure.input(credentialsSchema.extend({
      name: z2.string().min(2, "Informe seu nome.")
    })).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Ja existe uma conta com este e-mail."
        });
      }
      const usersCount = await countUsers();
      const ownerEmail = ENV.ownerEmail.trim().toLowerCase();
      const role = usersCount === 0 || ownerEmail && ownerEmail === email ? "admin" : "user";
      const passwordHash = await hashPassword(input.password);
      const openId = buildPasswordOpenId(email);
      const user = await createPasswordUser({
        openId,
        name: input.name.trim(),
        email,
        passwordHash,
        role
      });
      if (!user) {
        throw new TRPCError3({
          code: "INTERNAL_SERVER_ERROR",
          message: "Nao foi possivel criar a conta."
        });
      }
      await setPasswordSession(ctx, user.openId, user.name, user.email);
      return sanitizeUser(user);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  routes: router({
    list: protectedProcedure.query(
      ({ ctx }) => getUserRoutes(ctx.user.id)
    ),
    get: protectedProcedure.input(z2.object({ id: z2.number() })).query(
      ({ ctx, input }) => getRouteById(input.id, ctx.user.id)
    ),
    create: protectedProcedure.input(z2.object({
      name: z2.string().min(1),
      description: z2.string().optional(),
      mode: z2.enum(["shortest_distance", "shortest_time", "balanced"]),
      startLocation: z2.string().optional(),
      startLatitude: z2.number().optional(),
      startLongitude: z2.number().optional(),
      endLocation: z2.string().optional(),
      endLatitude: z2.number().optional(),
      endLongitude: z2.number().optional()
    })).mutation(
      ({ ctx, input }) => createRoute(ctx.user.id, input)
    ),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      name: z2.string().optional(),
      description: z2.string().optional(),
      mode: z2.enum(["shortest_distance", "shortest_time", "balanced"]).optional(),
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
      mode: z2.enum(["shortest_distance", "shortest_time", "balanced"]).optional()
    })).mutation(async ({ ctx, input }) => {
      const route = await getRouteById(input.id, ctx.user.id);
      if (!route) throw new Error("Route not found");
      const routeStops = await getRouteStops(input.id);
      if (routeStops.length === 0) throw new Error("Route has no stops");
      const locations = routeStops.map((stop) => ({
        latitude: parseFloat(String(stop.latitude || 0)),
        longitude: parseFloat(String(stop.longitude || 0)),
        address: stop.address,
        notes: stop.notes ?? void 0
      }));
      const validation = validateLocations(locations);
      if (!validation.valid) throw new Error(validation.error);
      const startLocation = toOptionalLocation(
        route.startLocation,
        route.startLatitude,
        route.startLongitude
      );
      const endLocation = toOptionalLocation(
        route.endLocation,
        route.endLatitude,
        route.endLongitude
      );
      const endpointValidation = validateLocations(
        [startLocation, endLocation].filter(Boolean)
      );
      if ((startLocation || endLocation) && !endpointValidation.valid) {
        throw new Error(endpointValidation.error);
      }
      const mode = input.mode || route.mode;
      const optimized = optimizeRoute(locations, mode, 0, {
        startLocation,
        endLocation
      });
      await updateRoute(input.id, ctx.user.id, {
        totalDistance: optimized.totalDistance,
        totalTime: optimized.totalTime,
        status: "optimized"
      });
      await deleteRouteStops(input.id);
      const updatedStops = optimized.waypoints.map((wp) => ({
        address: wp.address || "",
        latitude: wp.latitude,
        longitude: wp.longitude,
        sequence: wp.sequence,
        notes: wp.notes
      }));
      await createStops(input.id, updatedStops);
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
      stops: z2.array(z2.object({
        address: z2.string(),
        latitude: z2.number().optional(),
        longitude: z2.number().optional(),
        sequence: z2.number(),
        notes: z2.string().optional()
      }))
    })).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      return createStops(input.routeId, input.stops);
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

// server/_core/index.ts
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
function isLocalDevelopmentOrigin(origin) {
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
  app2.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "EconoRotas",
      environment: ENV.isProduction ? "production" : "development",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
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
  const path3 = currentUrl.searchParams.get("path")?.replace(/^\/+/, "") ?? "";
  const prefix = route === "manus-storage" ? "/manus-storage" : "/api";
  currentUrl.searchParams.delete("__route");
  currentUrl.searchParams.delete("path");
  const normalizedPath = path3 ? `${prefix}/${path3}` : prefix;
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
        app: "EconoRotas",
        error: message
      })
    );
  }
}
export {
  handler as default
};
