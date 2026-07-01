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
  userType: varchar("userType", { length: 64 }),
  marketplace: varchar("marketplace", { length: 64 }),
  averageStopsPerDay: int("averageStopsPerDay"),
  acceptedTermsAt: timestamp("acceptedTermsAt"),
  accountStatus: mysqlEnum("accountStatus", [
    "pending_review",
    "approved",
    "waitlist",
    "blocked",
    "suspended",
  ]).default("approved").notNull(),
  registrationIp: varchar("registrationIp", { length: 64 }),
  registrationUserAgent: varchar("registrationUserAgent", { length: 700 }),
  approvedAt: timestamp("approvedAt"),
  approvedBy: int("approvedBy"),
  waitlistedAt: timestamp("waitlistedAt"),
  reviewedBy: int("reviewedBy"),
  blockedAt: timestamp("blockedAt"),
  suspendedAt: timestamp("suspendedAt"),
  internalNotes: text("internalNotes"),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("users_createdAt_idx").on(table.createdAt),
  accountStatusIdx: index("users_accountStatus_idx").on(table.accountStatus),
  registrationIpCreatedAtIdx: index("users_registrationIp_createdAt_idx").on(table.registrationIp, table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const adminUserReviews = mysqlTable("admin_user_reviews", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  adminUserId: int("admin_user_id"),
  previousStatus: mysqlEnum("previous_status", [
    "pending_review",
    "approved",
    "waitlist",
    "blocked",
    "suspended",
  ]).notNull(),
  newStatus: mysqlEnum("new_status", [
    "pending_review",
    "approved",
    "waitlist",
    "blocked",
    "suspended",
  ]).notNull(),
  action: mysqlEnum("action", [
    "approved",
    "waitlist",
    "blocked",
    "suspended",
  ]).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  adminUserIdFk: foreignKey({ columns: [table.adminUserId], foreignColumns: [users.id] }).onDelete("set null"),
  userCreatedAtIdx: index("admin_user_reviews_user_created_at_idx").on(table.userId, table.createdAt),
  adminUserCreatedAtIdx: index("admin_user_reviews_admin_created_at_idx").on(table.adminUserId, table.createdAt),
}));

export type AdminUserReview = typeof adminUserReviews.$inferSelect;
export type InsertAdminUserReview = typeof adminUserReviews.$inferInsert;

export const emailLogs = mysqlTable("email_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  email: varchar("email", { length: 320 }).notNull(),
  templateName: varchar("template_name", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["sent", "skipped", "failed"]).default("skipped").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  userCreatedAtIdx: index("email_logs_user_created_at_idx").on(table.userId, table.createdAt),
  templateCreatedAtIdx: index("email_logs_template_created_at_idx").on(table.templateName, table.createdAt),
}));

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

export const betaAccessSettings = mysqlTable("beta_access_settings", {
  id: int("id").primaryKey(),
  maxApprovedUsers: int("max_approved_users").default(50).notNull(),
  allowNewRegistrations: boolean("allow_new_registrations").default(true).notNull(),
  automaticApproval: boolean("automatic_approval").default(false).notNull(),
  sendNewUsersToWaitlist: boolean("send_new_users_to_waitlist").default(false).notNull(),
  maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
  routesPerUserPerDay: int("routes_per_user_per_day").default(10).notNull(),
  stopsPerRouteLimit: int("stops_per_route_limit").default(200).notNull(),
  importsPerHourLimit: int("imports_per_hour_limit").default(5).notNull(),
  maxFileSizeMb: int("max_file_size_mb").default(5).notNull(),
  updatedBy: int("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  updatedByFk: foreignKey({ columns: [table.updatedBy], foreignColumns: [users.id] }).onDelete("set null"),
}));

export type BetaAccessSettings = typeof betaAccessSettings.$inferSelect;
export type InsertBetaAccessSettings = typeof betaAccessSettings.$inferInsert;

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
  createdAtIdx: index("routes_createdAt_idx").on(table.createdAt),
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
  sourceProvider: mysqlEnum("sourceProvider", [
    "manual",
    "shopee",
    "imile",
    "mercado_livre",
    "amazon",
    "correios",
    "generic",
  ]).default("generic").notNull(),
  originalStop: int("originalStop"),
  isUnsequencedStop: boolean("isUnsequencedStop").default(false).notNull(),
  metadata: json("metadata"),
  commercialDetectionStatus: mysqlEnum("commercialDetectionStatus", [
    "unknown",
    "suspected",
    "confirmed",
  ]).default("unknown").notNull(),
  commercialConfidence: int("commercialConfidence").default(0).notNull(),
  commercialPlaceName: varchar("commercialPlaceName", { length: 255 }),
  commercialCategory: varchar("commercialCategory", { length: 128 }),
  commercialOpeningHours: varchar("commercialOpeningHours", { length: 255 }),
  commercialSource: varchar("commercialSource", { length: 64 }),
  commercialLastCheckedAt: timestamp("commercialLastCheckedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
  createdAtIdx: index("stops_createdAt_idx").on(table.createdAt),
  commercialStatusIdx: index("stops_commercialDetectionStatus_idx").on(table.commercialDetectionStatus),
}));

export type Stop = typeof stops.$inferSelect;
export type InsertStop = typeof stops.$inferInsert;

export const locationCommercialCache = mysqlTable("location_commercial_cache", {
  id: int("id").autoincrement().primaryKey(),
  lat: decimal("lat", { precision: 10, scale: 8 }).notNull(),
  lng: decimal("lng", { precision: 11, scale: 8 }).notNull(),
  radius: int("radius").notNull(),
  response: json("response"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  lookupIdx: index("location_commercial_cache_lookup_idx").on(table.lat, table.lng, table.radius),
  createdAtIdx: index("location_commercial_cache_createdAt_idx").on(table.createdAt),
}));

export type LocationCommercialCache = typeof locationCommercialCache.$inferSelect;
export type InsertLocationCommercialCache = typeof locationCommercialCache.$inferInsert;

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
  createdAtUserIdIdx: index("operationalEvents_createdAt_userId_idx").on(table.createdAt, table.userId),
  severityCreatedAtIdx: index("operationalEvents_severity_createdAt_idx").on(table.severity, table.createdAt),
  typeCreatedAtIdx: index("operationalEvents_type_createdAt_idx").on(table.type, table.createdAt),
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
  osrmProvider: varchar("osrmProvider", { length: 64 }),
  osrmAvailability: mysqlEnum("osrmAvailability", ["unknown", "available", "degraded", "unavailable"]).default("unknown").notNull(),
  osrmLatencyMs: int("osrmLatencyMs").default(0).notNull(),
  osrmMatrixCount: int("osrmMatrixCount").default(0).notNull(),
  osrmMatrixSize: int("osrmMatrixSize").default(0).notNull(),
  osrmFailureReason: varchar("osrmFailureReason", { length: 255 }),
  matrixCacheHit: int("matrixCacheHit").default(0).notNull(),
  matrixCacheMiss: int("matrixCacheMiss").default(0).notNull(),
  matrixGenerationMs: int("matrixGenerationMs").default(0).notNull(),
  macroClusterCount: int("macroClusterCount").default(0).notNull(),
  microClusterCount: int("microClusterCount").default(0).notNull(),
  largestClusterSize: int("largestClusterSize").default(0).notNull(),
  issuesDetectedCount: int("issuesDetectedCount").default(0).notNull(),
  issuesCorrectedCount: int("issuesCorrectedCount").default(0).notNull(),
  issuesBlockedCount: int("issuesBlockedCount").default(0).notNull(),
  auditCycles: int("auditCycles").default(0).notNull(),
  issuesRemainingCount: int("issuesRemainingCount").default(0).notNull(),
  batchCorrectionCount: int("batchCorrectionCount").default(0).notNull(),
  auditStatus: mysqlEnum("auditStatus", ["approved", "attention", "critical"]).notNull(),
  auditQuality: mysqlEnum("auditQuality", ["excellent", "good", "attention", "poor", "blocked"]).notNull(),
  auditSource: varchar("auditSource", { length: 128 }),
  routeMode: mysqlEnum("routeMode", ["shortest_distance", "shortest_time", "balanced"]),
  localityMode: mysqlEnum("localityMode", ["balanced", "local", "strict"]),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  executionDurationMs: int("executionDurationMs"),
  executionStatus: mysqlEnum("executionStatus", ["pending", "started", "completed", "abandoned"]).default("pending").notNull(),
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
  executionStatusIdx: index("route_metrics_executionStatus_idx").on(table.executionStatus),
}));

export type RouteMetric = typeof routeMetrics.$inferSelect;
export type InsertRouteMetric = typeof routeMetrics.$inferInsert;

export const osrmMatrixCache = mysqlTable("osrm_matrix_cache", {
  id: int("id").autoincrement().primaryKey(),
  matrixHash: varchar("matrixHash", { length: 128 }).notNull(),
  clusterHash: varchar("clusterHash", { length: 128 }).notNull(),
  stopCount: int("stopCount").notNull(),
  durationMatrix: json("durationMatrix").notNull(),
  distanceMatrix: json("distanceMatrix").notNull(),
  profile: varchar("profile", { length: 32 }).default("driving").notNull(),
  provider: varchar("provider", { length: 64 }).default("osrm").notNull(),
  osrmBaseUrl: varchar("osrmBaseUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  hitCount: int("hitCount").default(0).notNull(),
}, (table) => ({
  matrixHashIdx: uniqueIndex("osrm_matrix_cache_matrixHash_idx").on(table.matrixHash),
  clusterHashIdx: index("osrm_matrix_cache_clusterHash_idx").on(table.clusterHash),
  stopCountIdx: index("osrm_matrix_cache_stopCount_idx").on(table.stopCount),
  lastUsedAtIdx: index("osrm_matrix_cache_lastUsedAt_idx").on(table.lastUsedAt),
  expiresAtIdx: index("osrm_matrix_cache_expiresAt_idx").on(table.expiresAt),
}));

export type OsrmMatrixCache = typeof osrmMatrixCache.$inferSelect;
export type InsertOsrmMatrixCache = typeof osrmMatrixCache.$inferInsert;

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
  queueWaitMs: int("queue_wait_ms"),
  executionMs: int("execution_ms"),
  workerMemoryMb: int("worker_memory_mb"),
  peakMemoryMb: int("peak_memory_mb"),
  workerId: varchar("worker_id", { length: 191 }),
  workerHostname: varchar("worker_hostname", { length: 191 }),
  workerStartedAt: timestamp("worker_started_at"),
  workerFinishedAt: timestamp("worker_finished_at"),
  attemptCount: int("attempt_count").default(0).notNull(),
  maxAttempts: int("max_attempts").default(3).notNull(),
  providerJobId: varchar("provider_job_id", { length: 191 }),
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  metadata: json("metadata"),
}, (table) => ({
  routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
  userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
  routeIdIdx: index("optimization_jobs_route_id_idx").on(table.routeId),
  statusIdx: index("optimization_jobs_status_idx").on(table.status),
  createdAtIdx: index("optimization_jobs_created_at_idx").on(table.createdAt),
  workerIdIdx: index("optimization_jobs_worker_id_idx").on(table.workerId),
}));

export type OptimizationJob = typeof optimizationJobs.$inferSelect;
export type InsertOptimizationJob = typeof optimizationJobs.$inferInsert;

export const performanceBenchmarks = mysqlTable("performance_benchmarks", {
  id: int("id").autoincrement().primaryKey(),
  scenario: varchar("scenario", { length: 64 }).notNull(),
  stopCount: int("stop_count").notNull(),
  runtimeMs: int("runtime_ms").default(0).notNull(),
  peakMemoryMb: int("peak_memory_mb").default(0).notNull(),
  queueWaitMs: int("queue_wait_ms").default(0).notNull(),
  osrmLatencyMs: int("osrm_latency_ms").default(0).notNull(),
  auditCycles: int("audit_cycles").default(0).notNull(),
  microClusterCount: int("micro_cluster_count").default(0).notNull(),
  osrmCalls: int("osrm_calls").default(0).notNull(),
  osrmFailures: int("osrm_failures").default(0).notNull(),
  matrixCacheHit: int("matrix_cache_hit").default(0).notNull(),
  matrixCacheMiss: int("matrix_cache_miss").default(0).notNull(),
  success: boolean("success").default(false).notNull(),
  criteriaMet: boolean("criteria_met").default(false).notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("performance_benchmarks_created_at_idx").on(table.createdAt),
  stopCountIdx: index("performance_benchmarks_stop_count_idx").on(table.stopCount),
  scenarioIdx: index("performance_benchmarks_scenario_idx").on(table.scenario),
}));

export type PerformanceBenchmark = typeof performanceBenchmarks.$inferSelect;
export type InsertPerformanceBenchmark = typeof performanceBenchmarks.$inferInsert;

/**
 * Admin dashboard metrics - latest materialized snapshot for fast admin panels.
 */
export const adminDashboardMetrics = mysqlTable("admin_dashboard_metrics", {
  id: int("id").autoincrement().primaryKey(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  usersTotal: int("usersTotal").default(0).notNull(),
  activeUsers7d: int("activeUsers7d").default(0).notNull(),
  routesTotal: int("routesTotal").default(0).notNull(),
  routesToday: int("routesToday").default(0).notNull(),
  jobsWaiting: int("jobsWaiting").default(0).notNull(),
  jobsRunning: int("jobsRunning").default(0).notNull(),
  jobsFailed: int("jobsFailed").default(0).notNull(),
  avgOptimizationRuntime: int("avgOptimizationRuntime").default(0).notNull(),
  avgGeocodingConfidence: int("avgGeocodingConfidence").default(0).notNull(),
  events24h: int("events24h").default(0).notNull(),
  errors24h: int("errors24h").default(0).notNull(),
  warnings24h: int("warnings24h").default(0).notNull(),
  payload: json("payload"),
}, (table) => ({
  generatedAtIdx: index("admin_dashboard_metrics_generatedAt_idx").on(table.generatedAt),
}));

export type AdminDashboardMetric = typeof adminDashboardMetrics.$inferSelect;
export type InsertAdminDashboardMetric = typeof adminDashboardMetrics.$inferInsert;

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
  accessReviews: many(adminUserReviews, { relationName: "reviewedUser" }),
  adminAccessReviews: many(adminUserReviews, { relationName: "reviewingAdmin" }),
  emailLogs: many(emailLogs),
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

export const adminUserReviewsRelations = relations(adminUserReviews, ({ one }) => ({
  user: one(users, {
    fields: [adminUserReviews.userId],
    references: [users.id],
    relationName: "reviewedUser",
  }),
  adminUser: one(users, {
    fields: [adminUserReviews.adminUserId],
    references: [users.id],
    relationName: "reviewingAdmin",
  }),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  user: one(users, { fields: [emailLogs.userId], references: [users.id] }),
}));

export const betaAccessSettingsRelations = relations(betaAccessSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [betaAccessSettings.updatedBy],
    references: [users.id],
  }),
}));
