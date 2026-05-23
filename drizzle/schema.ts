import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, foreignKey } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Routes table - stores main route information
 */
export const routes = mysqlTable("routes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  mode: mysqlEnum("mode", ["shortest_distance", "shortest_time", "balanced"]).default("balanced").notNull(),
  totalDistance: decimal("totalDistance", { precision: 10, scale: 2 }),
  totalTime: int("totalTime"), // in minutes
  status: mysqlEnum("status", ["draft", "optimized", "completed", "cancelled"]).default("draft").notNull(),
  startLocation: varchar("startLocation", { length: 255 }),
  startLatitude: decimal("startLatitude", { precision: 10, scale: 8 }),
  startLongitude: decimal("startLongitude", { precision: 11, scale: 8 }),
  endLocation: varchar("endLocation", { length: 255 }),
  endLatitude: decimal("endLatitude", { precision: 10, scale: 8 }),
  endLongitude: decimal("endLongitude", { precision: 11, scale: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
}));

export type Route = typeof routes.$inferSelect;
export type InsertRoute = typeof routes.$inferInsert;

/**
 * Stops table - individual stops/waypoints within a route
 */
export const stops = mysqlTable("stops", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("routeId").notNull(),
  address: varchar("address", { length: 500 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  sequence: int("sequence").notNull(), // order in the optimized route
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
}));

export type Stop = typeof stops.$inferSelect;
export type InsertStop = typeof stops.$inferInsert;

/**
 * Route Schedules - for recurring routes with Heartbeat integration
 */
export const routeSchedules = mysqlTable("routeSchedules", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("routeId").notNull(),
  userId: int("userId").notNull(),
  recurrenceType: mysqlEnum("recurrenceType", ["once", "daily", "weekly"]).default("once").notNull(),
  scheduledDate: timestamp("scheduledDate").notNull(),
  scheduledTime: varchar("scheduledTime", { length: 8 }), // HH:MM format
  daysOfWeek: varchar("daysOfWeek", { length: 50 }), // JSON array: [0,1,2...] for Sun-Sat
  isActive: boolean("isActive").default(true).notNull(),
  lastExecuted: timestamp("lastExecuted"),
  nextExecution: timestamp("nextExecution"),
  heartbeatJobId: varchar("heartbeatJobId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
}));

export type RouteSchedule = typeof routeSchedules.$inferSelect;
export type InsertRouteSchedule = typeof routeSchedules.$inferInsert;

/**
 * Route History - tracks execution/completion of routes
 */
export const routeHistory = mysqlTable("routeHistory", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("routeId").notNull(),
  userId: int("userId").notNull(),
  executedDate: timestamp("executedDate").defaultNow().notNull(),
  actualDistance: decimal("actualDistance", { precision: 10, scale: 2 }),
  actualTime: int("actualTime"), // in minutes
  status: mysqlEnum("status", ["in_progress", "completed", "cancelled"]).default("in_progress").notNull(),
  notes: text("notes"),
  exportedAt: timestamp("exportedAt"),
  exportFormat: mysqlEnum("exportFormat", ["pdf", "csv"]),
  storageKey: varchar("storageKey", { length: 500 }), // S3 key for exported file
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
}));

export type RouteHistory = typeof routeHistory.$inferSelect;
export type InsertRouteHistory = typeof routeHistory.$inferInsert;

/**
 * Chat History - stores AI chat conversations about routes
 */
export const chatHistory = mysqlTable("chatHistory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  routeId: int("routeId"), // optional - chat can be about a specific route
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
}));

export type ChatMessage = typeof chatHistory.$inferSelect;
export type InsertChatMessage = typeof chatHistory.$inferInsert;

/**
 * Relations
 */
export const usersRelations = relations(users, ({ many }) => ({
  routes: many(routes),
  routeSchedules: many(routeSchedules),
  routeHistory: many(routeHistory),
  chatHistory: many(chatHistory),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
  user: one(users, { fields: [routes.userId], references: [users.id] }),
  stops: many(stops),
  schedules: many(routeSchedules),
  history: many(routeHistory),
  chats: many(chatHistory),
}));

export const stopsRelations = relations(stops, ({ one }) => ({
  route: one(routes, { fields: [stops.routeId], references: [routes.id] }),
}));

export const routeSchedulesRelations = relations(routeSchedules, ({ one }) => ({
  user: one(users, { fields: [routeSchedules.userId], references: [users.id] }),
  route: one(routes, { fields: [routeSchedules.routeId], references: [routes.id] }),
}));

export const routeHistoryRelations = relations(routeHistory, ({ one }) => ({
  user: one(users, { fields: [routeHistory.userId], references: [users.id] }),
  route: one(routes, { fields: [routeHistory.routeId], references: [routes.id] }),
}));

export const chatHistoryRelations = relations(chatHistory, ({ one }) => ({
  user: one(users, { fields: [chatHistory.userId], references: [users.id] }),
  route: one(routes, { fields: [chatHistory.routeId], references: [routes.id] }),
}));
