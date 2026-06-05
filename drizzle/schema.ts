import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, foreignKey, uniqueIndex, index } from "drizzle-orm/mysql-core";
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
  geocodingConfidenceScore: int("geocodingConfidenceScore").default(0).notNull(),
  geocodingMethod: mysqlEnum("geocodingMethod", [
    "exact_address",
    "street_match",
    "neighborhood_match",
    "city_match",
    "approximate_route_cluster",
    "manual_coordinate",
  ]).default("city_match").notNull(),
  geocodingSuspect: boolean("geocodingSuspect").default(true).notNull(),
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
 * User integrations - encrypted external service credentials per user.
 */
export const userIntegrations = mysqlTable("userIntegrations", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  userProviderUnique: uniqueIndex("userIntegrations_user_provider_unique").on(table.userId, table.provider),
}));

export type UserIntegration = typeof userIntegrations.$inferSelect;
export type InsertUserIntegration = typeof userIntegrations.$inferInsert;

/**
 * Operational events - central audit and anomaly stream for support/admin.
 */
export const operationalEvents = mysqlTable("operationalEvents", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
  createdAtIdx: index("operationalEvents_createdAt_idx").on(table.createdAt),
  severityIdx: index("operationalEvents_severity_idx").on(table.severity),
  typeIdx: index("operationalEvents_type_idx").on(table.type),
}));

export type OperationalEvent = typeof operationalEvents.$inferSelect;
export type InsertOperationalEvent = typeof operationalEvents.$inferInsert;

/**
 * Route metrics - immutable optimization measurements used by admin analytics.
 * One row is stored for each completed optimization attempt or auditor block.
 */
export const routeMetrics = mysqlTable("route_metrics", {
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
  averageGeocodingConfidence: int("averageGeocodingConfidence").default(0).notNull(),
  minGeocodingConfidence: int("minGeocodingConfidence").default(0).notNull(),
  suspiciousGeocodingCount: int("suspiciousGeocodingCount").default(0).notNull(),
  dbFetchMs: int("dbFetchMs").default(0).notNull(),
  clusteringMs: int("clusteringMs").default(0).notNull(),
  osrmMs: int("osrmMs").default(0).notNull(),
  optimizerMs: int("optimizerMs").default(0).notNull(),
  auditMs: int("auditMs").default(0).notNull(),
  correctionMs: int("correctionMs").default(0).notNull(),
  dbSaveMs: int("dbSaveMs").default(0).notNull(),
  totalRuntimeMs: int("totalRuntimeMs").default(0).notNull(),
  osrmCallCount: int("osrmCallCount").default(0).notNull(),
  osrmFailureCount: int("osrmFailureCount").default(0).notNull(),
  osrmTotalMs: int("osrmTotalMs").default(0).notNull(),
  osrmAverageMs: int("osrmAverageMs").default(0).notNull(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
  createdAtIdx: index("route_metrics_createdAt_idx").on(table.createdAt),
  routeIdIdx: index("route_metrics_routeId_idx").on(table.routeId),
  auditStatusIdx: index("route_metrics_auditStatus_idx").on(table.auditStatus),
  osrmFallbackIdx: index("route_metrics_osrmFallback_idx").on(table.osrmFallback),
}));

export type RouteMetric = typeof routeMetrics.$inferSelect;
export type InsertRouteMetric = typeof routeMetrics.$inferInsert;

/**
 * Optimization jobs - async processing control for large routes.
 */
export const optimizationJobs = mysqlTable("optimization_jobs", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("route_id").notNull(),
  userId: int("user_id"),
  status: mysqlEnum("status", [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
  ]).default("queued").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  runtimeMs: int("runtime_ms"),
  errorMessage: text("error_message"),
  metadata: json("metadata"),
}, (table) => ({
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  routeIdIdx: index("optimization_jobs_route_id_idx").on(table.routeId),
  statusIdx: index("optimization_jobs_status_idx").on(table.status),
  createdAtIdx: index("optimization_jobs_created_at_idx").on(table.createdAt),
}));

export type OptimizationJob = typeof optimizationJobs.$inferSelect;
export type InsertOptimizationJob = typeof optimizationJobs.$inferInsert;

/**
 * Geocode cache - shared address lookup memory for PWA, Android and site.
 * Keeps corrected/known lookup results in the managed database so repeated
 * addresses do not depend only on the external geocoder.
 */
export const geocodeCache = mysqlTable("geocode_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 191 }).notNull(),
  query: varchar("query", { length: 700 }).notNull(),
  provider: varchar("provider", { length: 64 }).default("nominatim").notNull(),
  resultCount: int("resultCount").default(0).notNull(),
  results: json("results").notNull(),
  hitCount: int("hitCount").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  cacheKeyUnique: uniqueIndex("geocode_cache_cacheKey_unique").on(table.cacheKey),
  expiresAtIdx: index("geocode_cache_expiresAt_idx").on(table.expiresAt),
}));

export type GeocodeCache = typeof geocodeCache.$inferSelect;
export type InsertGeocodeCache = typeof geocodeCache.$inferInsert;

/**
 * Address corrections - approved manual fixes for operational geocoding memory.
 */
export const addressCorrections = mysqlTable("address_corrections", {
  id: int("id").autoincrement().primaryKey(),
  addressHash: varchar("address_hash", { length: 64 }).notNull(),
  originalAddress: varchar("original_address", { length: 500 }).notNull(),
  correctedAddress: varchar("corrected_address", { length: 500 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  userId: int("user_id"),
  routeId: int("route_id"),
  stopId: int("stop_id"),
  city: varchar("city", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
  stopIdFk: foreignKey({ columns: [table.stopId], foreignColumns: [stops.id] }).onDelete("set null"),
  addressHashIdx: index("address_corrections_address_hash_idx").on(table.addressHash),
  createdAtIdx: index("address_corrections_created_at_idx").on(table.createdAt),
  userIdIdx: index("address_corrections_user_id_idx").on(table.userId),
}));

export type AddressCorrection = typeof addressCorrections.$inferSelect;
export type InsertAddressCorrection = typeof addressCorrections.$inferInsert;

/**
 * Relations
 */
export const usersRelations = relations(users, ({ many }) => ({
  routes: many(routes),
  routeSchedules: many(routeSchedules),
  routeHistory: many(routeHistory),
  chatHistory: many(chatHistory),
  userIntegrations: many(userIntegrations),
  operationalEvents: many(operationalEvents),
  routeMetrics: many(routeMetrics),
  addressCorrections: many(addressCorrections),
  optimizationJobs: many(optimizationJobs),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
  user: one(users, { fields: [routes.userId], references: [users.id] }),
  stops: many(stops),
  schedules: many(routeSchedules),
  history: many(routeHistory),
  chats: many(chatHistory),
  operationalEvents: many(operationalEvents),
  routeMetrics: many(routeMetrics),
  addressCorrections: many(addressCorrections),
  optimizationJobs: many(optimizationJobs),
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

export const userIntegrationsRelations = relations(userIntegrations, ({ one }) => ({
  user: one(users, { fields: [userIntegrations.userId], references: [users.id] }),
}));

export const operationalEventsRelations = relations(operationalEvents, ({ one }) => ({
  user: one(users, { fields: [operationalEvents.userId], references: [users.id] }),
  route: one(routes, { fields: [operationalEvents.routeId], references: [routes.id] }),
}));

export const routeMetricsRelations = relations(routeMetrics, ({ one }) => ({
  user: one(users, { fields: [routeMetrics.userId], references: [users.id] }),
  route: one(routes, { fields: [routeMetrics.routeId], references: [routes.id] }),
}));

export const addressCorrectionsRelations = relations(addressCorrections, ({ one }) => ({
  user: one(users, { fields: [addressCorrections.userId], references: [users.id] }),
  route: one(routes, { fields: [addressCorrections.routeId], references: [routes.id] }),
  stop: one(stops, { fields: [addressCorrections.stopId], references: [stops.id] }),
}));

export const optimizationJobsRelations = relations(optimizationJobs, ({ one }) => ({
  user: one(users, { fields: [optimizationJobs.userId], references: [users.id] }),
  route: one(routes, { fields: [optimizationJobs.routeId], references: [routes.id] }),
}));
