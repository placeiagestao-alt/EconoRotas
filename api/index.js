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
var users, routes, stops, routeSchedules, routeHistory, chatHistory, userIntegrations, operationalEvents, routeMetrics, osrmMatrixCache, optimizationJobs, performanceBenchmarks, adminDashboardMetrics, geocodeCache, addressCorrections, usersRelations, routesRelations, stopsRelations, routeSchedulesRelations, routeHistoryRelations, chatHistoryRelations, userIntegrationsRelations, operationalEventsRelations, routeMetricsRelations, addressCorrectionsRelations, optimizationJobsRelations;
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
    }, (table) => ({
      createdAtIdx: index("users_createdAt_idx").on(table.createdAt)
    }));
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
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
      createdAtIdx: index("routes_createdAt_idx").on(table.createdAt)
    }));
    stops = mysqlTable("stops", {
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
        "manual_coordinate"
      ]).default("city_match").notNull(),
      geocodingSuspect: boolean("geocodingSuspect").default(true).notNull(),
      sequence: int("sequence").notNull(),
      // order in the optimized route
      sourceProvider: mysqlEnum("sourceProvider", [
        "manual",
        "shopee",
        "imile",
        "mercado_livre",
        "amazon",
        "correios",
        "generic"
      ]).default("generic").notNull(),
      originalStop: int("originalStop"),
      isUnsequencedStop: boolean("isUnsequencedStop").default(false).notNull(),
      metadata: json("metadata"),
      notes: text("notes"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
      createdAtIdx: index("stops_createdAt_idx").on(table.createdAt)
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
      typeIdx: index("operationalEvents_type_idx").on(table.type),
      createdAtUserIdIdx: index("operationalEvents_createdAt_userId_idx").on(table.createdAt, table.userId),
      severityCreatedAtIdx: index("operationalEvents_severity_createdAt_idx").on(table.severity, table.createdAt),
      typeCreatedAtIdx: index("operationalEvents_type_createdAt_idx").on(table.type, table.createdAt)
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
      createdAtIdx: index("route_metrics_createdAt_idx").on(table.createdAt),
      routeIdIdx: index("route_metrics_routeId_idx").on(table.routeId),
      auditStatusIdx: index("route_metrics_auditStatus_idx").on(table.auditStatus),
      osrmFallbackIdx: index("route_metrics_osrmFallback_idx").on(table.osrmFallback),
      executionStatusIdx: index("route_metrics_executionStatus_idx").on(table.executionStatus)
    }));
    osrmMatrixCache = mysqlTable("osrm_matrix_cache", {
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
      hitCount: int("hitCount").default(0).notNull()
    }, (table) => ({
      matrixHashIdx: uniqueIndex("osrm_matrix_cache_matrixHash_idx").on(table.matrixHash),
      clusterHashIdx: index("osrm_matrix_cache_clusterHash_idx").on(table.clusterHash),
      stopCountIdx: index("osrm_matrix_cache_stopCount_idx").on(table.stopCount),
      lastUsedAtIdx: index("osrm_matrix_cache_lastUsedAt_idx").on(table.lastUsedAt),
      expiresAtIdx: index("osrm_matrix_cache_expiresAt_idx").on(table.expiresAt)
    }));
    optimizationJobs = mysqlTable("optimization_jobs", {
      id: int("id").autoincrement().primaryKey(),
      routeId: int("route_id").notNull(),
      userId: int("user_id"),
      status: mysqlEnum("status", [
        "queued",
        "running",
        "completed",
        "failed",
        "cancelled"
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
      metadata: json("metadata")
    }, (table) => ({
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("cascade"),
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
      routeIdIdx: index("optimization_jobs_route_id_idx").on(table.routeId),
      statusIdx: index("optimization_jobs_status_idx").on(table.status),
      createdAtIdx: index("optimization_jobs_created_at_idx").on(table.createdAt),
      workerIdIdx: index("optimization_jobs_worker_id_idx").on(table.workerId)
    }));
    performanceBenchmarks = mysqlTable("performance_benchmarks", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      createdAtIdx: index("performance_benchmarks_created_at_idx").on(table.createdAt),
      stopCountIdx: index("performance_benchmarks_stop_count_idx").on(table.stopCount),
      scenarioIdx: index("performance_benchmarks_scenario_idx").on(table.scenario)
    }));
    adminDashboardMetrics = mysqlTable("admin_dashboard_metrics", {
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
      payload: json("payload")
    }, (table) => ({
      generatedAtIdx: index("admin_dashboard_metrics_generatedAt_idx").on(table.generatedAt)
    }));
    geocodeCache = mysqlTable("geocode_cache", {
      id: int("id").autoincrement().primaryKey(),
      cacheKey: varchar("cacheKey", { length: 191 }).notNull(),
      query: varchar("query", { length: 700 }).notNull(),
      provider: varchar("provider", { length: 64 }).default("nominatim").notNull(),
      resultCount: int("resultCount").default(0).notNull(),
      results: json("results").notNull(),
      hitCount: int("hitCount").default(0).notNull(),
      expiresAt: timestamp("expiresAt").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (table) => ({
      cacheKeyUnique: uniqueIndex("geocode_cache_cacheKey_unique").on(table.cacheKey),
      expiresAtIdx: index("geocode_cache_expiresAt_idx").on(table.expiresAt)
    }));
    addressCorrections = mysqlTable("address_corrections", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      userIdFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] }).onDelete("set null"),
      routeIdFk: foreignKey({ columns: [table.routeId], foreignColumns: [routes.id] }).onDelete("set null"),
      stopIdFk: foreignKey({ columns: [table.stopId], foreignColumns: [stops.id] }).onDelete("set null"),
      addressHashIdx: index("address_corrections_address_hash_idx").on(table.addressHash),
      createdAtIdx: index("address_corrections_created_at_idx").on(table.createdAt),
      userIdIdx: index("address_corrections_user_id_idx").on(table.userId)
    }));
    usersRelations = relations(users, ({ many }) => ({
      routes: many(routes),
      routeSchedules: many(routeSchedules),
      routeHistory: many(routeHistory),
      chatHistory: many(chatHistory),
      userIntegrations: many(userIntegrations),
      operationalEvents: many(operationalEvents),
      routeMetrics: many(routeMetrics),
      addressCorrections: many(addressCorrections),
      optimizationJobs: many(optimizationJobs)
    }));
    routesRelations = relations(routes, ({ one, many }) => ({
      user: one(users, { fields: [routes.userId], references: [users.id] }),
      stops: many(stops),
      schedules: many(routeSchedules),
      history: many(routeHistory),
      chats: many(chatHistory),
      operationalEvents: many(operationalEvents),
      routeMetrics: many(routeMetrics),
      addressCorrections: many(addressCorrections),
      optimizationJobs: many(optimizationJobs)
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
    addressCorrectionsRelations = relations(addressCorrections, ({ one }) => ({
      user: one(users, { fields: [addressCorrections.userId], references: [users.id] }),
      route: one(routes, { fields: [addressCorrections.routeId], references: [routes.id] }),
      stop: one(stops, { fields: [addressCorrections.stopId], references: [stops.id] })
    }));
    optimizationJobsRelations = relations(optimizationJobs, ({ one }) => ({
      user: one(users, { fields: [optimizationJobs.userId], references: [users.id] }),
      route: one(routes, { fields: [optimizationJobs.routeId], references: [routes.id] })
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
function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
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
      osrmHealthTimeoutMs: Number(process.env.OSRM_HEALTH_TIMEOUT_MS || 3e3),
      osrmRequired: process.env.OSRM_REQUIRED === "true",
      osrmRequiredMinStops: readPositiveInt(process.env.OSRM_REQUIRED_MIN_STOPS, 101),
      maxSyncStops: readPositiveInt(process.env.MAX_SYNC_STOPS, 250),
      maxRouteStops: Math.min(readPositiveInt(process.env.MAX_ROUTE_STOPS, 150), 150),
      maxGeographicFallbackStops: readPositiveInt(
        process.env.MAX_GEOGRAPHIC_FALLBACK_STOPS,
        100
      ),
      bullmqRedisUrl: process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_URL ?? "",
      backupLastCompletedAt: process.env.BACKUP_LAST_COMPLETED_AT ?? "",
      backupStatus: process.env.BACKUP_STATUS ?? "",
      restoreTestLastPassedAt: process.env.RESTORE_TEST_LAST_PASSED_AT ?? "",
      restoreTestPassed: process.env.RESTORE_TEST_PASSED === "true",
      integrationCredentialsSecret: process.env.INTEGRATION_CREDENTIALS_SECRET ?? process.env.JWT_SECRET ?? ""
    };
  }
});

// shared/geocodingConfidence.ts
function clampScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function normalizeGeocodingMethod(method) {
  return GEOCODING_METHODS.includes(method) ? method : "city_match";
}
function defaultConfidenceForMethod(method) {
  switch (normalizeGeocodingMethod(method)) {
    case "manual_coordinate":
      return 100;
    case "exact_address":
      return 95;
    case "street_match":
      return 72;
    case "neighborhood_match":
      return 55;
    case "city_match":
      return 35;
    case "approximate_route_cluster":
      return 25;
    default:
      return 0;
  }
}
function calculateGeocodingConfidence(input) {
  if (input.score != null && Number.isFinite(Number(input.score))) {
    const score2 = clampScore(Number(input.score));
    const method2 = normalizeGeocodingMethod(input.method);
    return {
      score: score2,
      method: method2,
      suspect: score2 < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD
    };
  }
  let method = normalizeGeocodingMethod(input.method);
  if (input.isManual) method = "manual_coordinate";
  else if (input.isSaved || input.hasHouseNumber) method = "exact_address";
  else if (input.hasRoad) method = "street_match";
  else if (input.hasDistrict) method = "neighborhood_match";
  else if (input.hasCity) method = "city_match";
  else if (input.isApproximate) method = "approximate_route_cluster";
  const score = defaultConfidenceForMethod(method);
  return {
    score,
    method,
    suspect: score < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD
  };
}
function summarizeGeocodingConfidence(stops2) {
  const scores = stops2.map((stop) => Number(stop.geocodingConfidenceScore)).filter((score) => Number.isFinite(score));
  const methodCounts = stops2.reduce((acc, stop) => {
    const method = normalizeGeocodingMethod(stop.geocodingMethod);
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});
  const suspectCount = stops2.filter((stop) => {
    const score = Number(stop.geocodingConfidenceScore);
    if (Number.isFinite(score)) {
      return score < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD;
    }
    return Boolean(stop.geocodingSuspect);
  }).length;
  return {
    averageScore: scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : 0,
    minScore: scores.length ? Math.min(...scores) : 0,
    suspectCount,
    methodCounts
  };
}
var GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD, GEOCODING_METHODS;
var init_geocodingConfidence = __esm({
  "shared/geocodingConfidence.ts"() {
    "use strict";
    GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD = 60;
    GEOCODING_METHODS = [
      "exact_address",
      "street_match",
      "neighborhood_match",
      "city_match",
      "approximate_route_cluster",
      "manual_coordinate"
    ];
  }
});

// shared/stopMetadata.ts
function cleanMetadataValue(value) {
  if (value === null || value === void 0) return void 0;
  const text2 = String(value).trim();
  return text2 ? text2 : void 0;
}
function normalizeStopSourceProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return STOP_SOURCE_PROVIDERS.includes(normalized) ? normalized : "generic";
}
function normalizeStopMetadata(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const metadata = {};
  const stringKeys = [
    "packageNumber",
    "trackingNumber",
    "recipientName",
    "recipientPhone",
    "externalStatus",
    "externalDistanceText",
    "sourceRouteId",
    "importedFrom"
  ];
  stringKeys.forEach((key) => {
    const text2 = cleanMetadataValue(input[key]);
    if (text2) metadata[key] = text2;
  });
  const groupedDeliveryCount = Number(input.groupedDeliveryCount);
  if (Number.isFinite(groupedDeliveryCount) && groupedDeliveryCount > 0) {
    metadata.groupedDeliveryCount = Math.round(groupedDeliveryCount);
  }
  return metadata;
}
var STOP_SOURCE_PROVIDERS;
var init_stopMetadata = __esm({
  "shared/stopMetadata.ts"() {
    "use strict";
    STOP_SOURCE_PROVIDERS = [
      "manual",
      "shopee",
      "imile",
      "mercado_livre",
      "amazon",
      "correios",
      "generic"
    ];
  }
});

// server/db.ts
import { eq, and, desc, asc, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
  memory.optimizationJobs = Array.isArray(data.optimizationJobs) ? data.optimizationJobs : [];
  memory.performanceBenchmarks = Array.isArray(data.performanceBenchmarks) ? data.performanceBenchmarks : [];
  memory.geocodeCache = Array.isArray(data.geocodeCache) ? data.geocodeCache : [];
  memory.addressCorrections = Array.isArray(data.addressCorrections) ? data.addressCorrections : [];
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
    addressCorrections: Number(data.ids?.addressCorrections) || 1
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
function parseGeocodeResults(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
async function getGeocodeCache(cacheKey) {
  const now = /* @__PURE__ */ new Date();
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cached2 = memory.geocodeCache.find(
        (item) => item.cacheKey === cacheKey && new Date(item.expiresAt) > now
      );
      if (!cached2) return null;
      cached2.hitCount = Number(cached2.hitCount || 0) + 1;
      await persistFallbackDb();
      return {
        cacheKey: cached2.cacheKey,
        query: cached2.query,
        provider: cached2.provider,
        resultCount: Number(cached2.resultCount || 0),
        results: parseGeocodeResults(cached2.results),
        expiresAt: cached2.expiresAt
      };
    }
    return null;
  }
  const rows = await db.select().from(geocodeCache).where(and(eq(geocodeCache.cacheKey, cacheKey), gte(geocodeCache.expiresAt, now))).limit(1);
  const cached = rows[0];
  if (!cached) return null;
  await db.update(geocodeCache).set({ hitCount: sql`${geocodeCache.hitCount} + 1` }).where(eq(geocodeCache.id, cached.id)).catch((error) => {
    console.warn("[Geocoding] Failed to increment cache hit count:", error);
  });
  return {
    cacheKey: cached.cacheKey,
    query: cached.query,
    provider: cached.provider,
    resultCount: Number(cached.resultCount || 0),
    results: parseGeocodeResults(cached.results),
    expiresAt: cached.expiresAt
  };
}
async function setGeocodeCache(data) {
  const results = Array.isArray(data.results) ? data.results : [];
  const payload = {
    cacheKey: data.cacheKey.slice(0, 191),
    query: data.query.slice(0, 700),
    provider: (data.provider || "nominatim").slice(0, 64),
    resultCount: results.length,
    results,
    expiresAt: data.expiresAt
  };
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const existingIndex = memory.geocodeCache.findIndex(
        (item) => item.cacheKey === payload.cacheKey
      );
      const next = {
        id: existingIndex >= 0 ? memory.geocodeCache[existingIndex].id : memory.ids.geocodeCache++,
        ...payload,
        hitCount: existingIndex >= 0 ? Number(memory.geocodeCache[existingIndex].hitCount || 0) : 0,
        createdAt: existingIndex >= 0 ? memory.geocodeCache[existingIndex].createdAt : /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
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
  await db.insert(geocodeCache).values(payload).onDuplicateKeyUpdate({
    set: {
      query: payload.query,
      provider: payload.provider,
      resultCount: payload.resultCount,
      results: payload.results,
      expiresAt: payload.expiresAt,
      updatedAt: sql`CURRENT_TIMESTAMP`
    }
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
      const createdStops = stopsData.map((stop) => {
        const confidence = calculateGeocodingConfidence({
          score: stop.geocodingConfidenceScore,
          method: stop.geocodingMethod,
          isManual: stop.geocodingConfidenceScore == null && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)) && !(Number(stop.latitude) === 0 && Number(stop.longitude) === 0)
        });
        const metadata = normalizeStopMetadata(stop.metadata);
        return {
          id: memory.ids.stops++,
          routeId,
          address: stop.address,
          latitude: stop.latitude !== void 0 ? String(stop.latitude) : null,
          longitude: stop.longitude !== void 0 ? String(stop.longitude) : null,
          geocodingConfidenceScore: confidence.score,
          geocodingMethod: confidence.method,
          geocodingSuspect: stop.geocodingSuspect ?? confidence.suspect,
          sequence: stop.sequence,
          notes: stop.notes ?? null,
          sourceProvider: normalizeStopSourceProvider(stop.sourceProvider),
          originalStop: stop.originalStop ?? null,
          isUnsequencedStop: Boolean(stop.isUnsequencedStop),
          metadata: Object.keys(metadata).length ? metadata : null,
          createdAt: now
        };
      });
      memory.stops.push(...createdStops);
      await persistFallbackDb();
      return getRouteStops(routeId);
    }
    requireConfiguredDatabase();
  }
  const values = stopsData.map((s) => {
    const confidence = calculateGeocodingConfidence({
      score: s.geocodingConfidenceScore,
      method: s.geocodingMethod,
      isManual: s.geocodingConfidenceScore == null && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)) && !(Number(s.latitude) === 0 && Number(s.longitude) === 0)
    });
    const metadata = normalizeStopMetadata(s.metadata);
    return {
      routeId,
      address: s.address,
      latitude: s.latitude !== void 0 ? String(s.latitude) : null,
      longitude: s.longitude !== void 0 ? String(s.longitude) : null,
      geocodingConfidenceScore: confidence.score,
      geocodingMethod: confidence.method,
      geocodingSuspect: s.geocodingSuspect ?? confidence.suspect,
      sequence: s.sequence,
      notes: s.notes,
      sourceProvider: normalizeStopSourceProvider(s.sourceProvider),
      originalStop: s.originalStop ?? null,
      isUnsequencedStop: Boolean(s.isUnsequencedStop),
      metadata: Object.keys(metadata).length ? metadata : null
    };
  });
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
      const normalizedMetadata2 = data.metadata !== void 0 ? normalizeStopMetadata(data.metadata) : void 0;
      Object.assign(stop, {
        ...data,
        sourceProvider: data.sourceProvider !== void 0 ? normalizeStopSourceProvider(data.sourceProvider) : stop.sourceProvider,
        originalStop: data.originalStop !== void 0 ? data.originalStop : stop.originalStop,
        isUnsequencedStop: data.isUnsequencedStop !== void 0 ? Boolean(data.isUnsequencedStop) : stop.isUnsequencedStop,
        metadata: normalizedMetadata2 !== void 0 ? Object.keys(normalizedMetadata2).length ? normalizedMetadata2 : null : stop.metadata,
        latitude: data.latitude !== void 0 ? data.latitude === null ? null : String(data.latitude) : stop.latitude,
        longitude: data.longitude !== void 0 ? data.longitude === null ? null : String(data.longitude) : stop.longitude
      });
      await persistFallbackDb();
      return stop;
    }
    requireConfiguredDatabase();
  }
  const normalizedMetadata = data.metadata !== void 0 ? normalizeStopMetadata(data.metadata) : void 0;
  await db.update(stops).set({
    ...data,
    sourceProvider: data.sourceProvider !== void 0 ? normalizeStopSourceProvider(data.sourceProvider) : void 0,
    metadata: normalizedMetadata !== void 0 ? Object.keys(normalizedMetadata).length ? normalizedMetadata : null : void 0,
    isUnsequencedStop: data.isUnsequencedStop !== void 0 ? Boolean(data.isUnsequencedStop) : void 0,
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
      const created2 = {
        id: memory.ids.operationalEvents++,
        ...event,
        createdAt: /* @__PURE__ */ new Date()
      };
      memory.operationalEvents.push(created2);
      await updateRouteExecutionMetricFromEvent(created2);
      await persistFallbackDb();
      return created2;
    }
    requireConfiguredDatabase();
  }
  const inserted = await db.insert(operationalEvents).values(event).$returningId();
  const insertedId = inserted[0]?.id;
  if (insertedId) {
    const result2 = await db.select().from(operationalEvents).where(eq(operationalEvents.id, insertedId)).limit(1);
    const created2 = result2[0] ?? null;
    if (created2) await updateRouteExecutionMetricFromEvent(created2);
    return created2;
  }
  const result = await db.select().from(operationalEvents).where(
    and(
      data.userId == null ? sql`${operationalEvents.userId} IS NULL` : eq(operationalEvents.userId, data.userId),
      eq(operationalEvents.type, event.type),
      eq(operationalEvents.source, event.source),
      eq(operationalEvents.title, event.title)
    )
  ).orderBy(desc(operationalEvents.id)).limit(1);
  const created = result[0] ?? null;
  if (created) await updateRouteExecutionMetricFromEvent(created);
  return created;
}
function normalizeExecutionEventType(type) {
  if (type === "route_execution_started") return "route_started";
  if (type === "route_execution_completed") return "route_completed";
  return type;
}
function routeExecutionStatusForEvent(type) {
  const normalized = normalizeExecutionEventType(type);
  if (normalized === "route_started" || normalized === "route_paused" || normalized === "route_resumed") {
    return "started";
  }
  if (normalized === "route_completed") return "completed";
  if (normalized === "route_abandoned") return "abandoned";
  return null;
}
async function updateRouteExecutionMetricFromEvent(event) {
  const routeId = Number(event.routeId);
  if (!Number.isFinite(routeId) || routeId <= 0) return;
  const status = routeExecutionStatusForEvent(event.type);
  if (!status) return;
  const eventDate = event.createdAt ? new Date(event.createdAt) : /* @__PURE__ */ new Date();
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const candidates = memory.routeMetrics.filter((metric2) => Number(metric2.routeId) === routeId).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
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
        metric.executionDurationMs = Number.isFinite(startedAt) ? Math.max(0, eventDate.getTime() - startedAt) : null;
      } else if (status === "abandoned") {
        metric.executionStatus = "abandoned";
      }
      return;
    }
    return;
  }
  const latestRows = await db.select({
    id: routeMetrics.id,
    startedAt: routeMetrics.startedAt
  }).from(routeMetrics).where(eq(routeMetrics.routeId, routeId)).orderBy(desc(routeMetrics.createdAt), desc(routeMetrics.id)).limit(1);
  const latest = latestRows[0];
  if (!latest) return;
  if (status === "started") {
    await db.update(routeMetrics).set({
      startedAt: latest.startedAt ?? eventDate,
      executionStatus: "started"
    }).where(eq(routeMetrics.id, latest.id));
    return;
  }
  if (status === "completed") {
    const startedAt = latest.startedAt ? new Date(latest.startedAt).getTime() : NaN;
    await db.update(routeMetrics).set({
      startedAt: latest.startedAt ?? eventDate,
      completedAt: eventDate,
      executionDurationMs: Number.isFinite(startedAt) ? Math.max(0, eventDate.getTime() - startedAt) : 0,
      executionStatus: "completed"
    }).where(eq(routeMetrics.id, latest.id));
    return;
  }
  if (status === "abandoned") {
    await db.update(routeMetrics).set({
      executionStatus: "abandoned"
    }).where(eq(routeMetrics.id, latest.id));
  }
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
function hashAddress(value) {
  return createHash("sha256").update(value.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
}
function extractCityFromAddress(address) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const stateLike = parts.findIndex((part) => /\bSP\b|\bSao Paulo\b/i.test(part));
    if (stateLike > 0) return parts[stateLike - 1].slice(0, 128);
    return parts[Math.max(0, parts.length - 2)].slice(0, 128);
  }
  return null;
}
async function createAddressCorrection(data) {
  const originalAddress = data.originalAddress.replace(/\s+/g, " ").trim();
  const correctedAddress = data.correctedAddress.replace(/\s+/g, " ").trim();
  if (!originalAddress || !correctedAddress) {
    return null;
  }
  const payload = {
    addressHash: hashAddress(originalAddress),
    originalAddress: originalAddress.slice(0, 500),
    correctedAddress: correctedAddress.slice(0, 500),
    latitude: data.latitude == null || !Number.isFinite(Number(data.latitude)) ? null : String(data.latitude),
    longitude: data.longitude == null || !Number.isFinite(Number(data.longitude)) ? null : String(data.longitude),
    userId: data.userId ?? null,
    routeId: data.routeId ?? null,
    stopId: data.stopId ?? null,
    city: extractCityFromAddress(correctedAddress)
  };
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.addressCorrections++,
        ...payload,
        latitude: payload.latitude == null ? null : Number(payload.latitude),
        longitude: payload.longitude == null ? null : Number(payload.longitude),
        createdAt: /* @__PURE__ */ new Date()
      };
      memory.addressCorrections.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }
  const inserted = await db.insert(addressCorrections).values(payload).$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;
  const result = await db.select().from(addressCorrections).where(eq(addressCorrections.id, insertedId)).limit(1);
  return result[0] ?? null;
}
async function createOptimizationJob(data) {
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
    metadata: data.metadata ?? null
  };
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const created = {
        id: memory.ids.optimizationJobs++,
        ...payload,
        createdAt: /* @__PURE__ */ new Date(),
        startedAt: payload.status === "running" ? /* @__PURE__ */ new Date() : null,
        finishedAt: payload.status === "completed" || payload.status === "failed" || payload.status === "cancelled" ? /* @__PURE__ */ new Date() : null
      };
      memory.optimizationJobs.push(created);
      await persistFallbackDb();
      return created;
    }
    requireConfiguredDatabase();
  }
  const inserted = await db.insert(optimizationJobs).values(payload).$returningId();
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;
  const result = await db.select().from(optimizationJobs).where(eq(optimizationJobs.id, insertedId)).limit(1);
  return result[0] ?? null;
}
async function updateOptimizationJob(id, patch) {
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
  await db.update(optimizationJobs).set(patch).where(eq(optimizationJobs.id, id));
  const result = await db.select().from(optimizationJobs).where(eq(optimizationJobs.id, id)).limit(1);
  return result[0] ?? null;
}
async function getQueueIntegrityDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1e3);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      const events2 = memory.operationalEvents.filter(
        (event) => QUEUE_INTEGRITY_EVENT_TYPES.includes(String(event.type)) && new Date(event.createdAt).getTime() >= cutoff
      );
      const failedJobs2 = memory.optimizationJobs.filter(
        (job) => job.status === "failed" && new Date(job.createdAt).getTime() >= cutoff
      );
      const runningJobs2 = memory.optimizationJobs.filter(
        (job) => job.status === "running"
      );
      return buildQueueIntegrityDashboard(events2, failedJobs2, runningJobs2, safeDays);
    }
    requireConfiguredDatabase();
  }
  const [events] = await _pool.query(
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
  const [failedJobs] = await _pool.query(
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
  const [runtimeRows] = await _pool.query(
    `
      SELECT AVG(NULLIF(COALESCE(runtime_ms, execution_ms, 0), 0)) AS averageRuntimeMs
      FROM optimization_jobs
      WHERE status = 'completed'
        AND created_at >= ?
    `,
    [cutoffDate]
  );
  const averageRuntimeMs = Math.max(6e4, Number(runtimeRows[0]?.averageRuntimeMs || 0));
  const [runningJobs] = await _pool.query(
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
function countEventsByType(events, type) {
  return events.filter((event) => event.type === type).length;
}
function buildLongRunningJobAlerts(runningJobs, averageRuntimeMs) {
  const warningThresholdMs = averageRuntimeMs * 2;
  const criticalThresholdMs = averageRuntimeMs * 5;
  return runningJobs.map((job) => {
    const runningMs = Number(job.runningMs || 0) || Math.max(
      0,
      Date.now() - new Date(job.startedAt || job.started_at || job.createdAt || Date.now()).getTime()
    );
    const severity = runningMs > criticalThresholdMs ? "critical" : runningMs > warningThresholdMs ? "warning" : null;
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
      severity
    };
  }).filter(Boolean);
}
async function hasRecentQueueIntegrityEvent(type, title, minutes = 30) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = Date.now() - minutes * 6e4;
      return memory.operationalEvents.some(
        (event) => event.type === type && event.title === title && new Date(event.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }
  const [rows] = await _pool.query(
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
function parseOptionalDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateAgeHours(date) {
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 36e5 * 10) / 10);
}
async function hasRecentDisasterReadinessEvent(type, title, minutes = 360) {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = Date.now() - minutes * 6e4;
      return memory.operationalEvents.some(
        (event) => event.type === type && event.title === title && new Date(event.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }
  const [rows] = await _pool.query(
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
async function persistDisasterReadinessAlerts(alerts) {
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
      metadata: alert.metadata ?? null
    });
  }
}
async function getLatestDisasterEvents() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return DISASTER_EVENT_TYPES.map(
        (type) => sortByDateDesc(
          memory.operationalEvents.filter((event) => event.type === type),
          "createdAt"
        )[0] ?? null
      ).filter(Boolean);
    }
    requireConfiguredDatabase();
  }
  const [rows] = await _pool.query(
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
function latestEventByType(events, type) {
  return events.find((event) => event?.type === type) ?? null;
}
async function getCriticalTableReadiness() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      return DISASTER_CRITICAL_TABLES.map((item) => {
        const records = item.memoryKey ? Number(memory[item.memoryKey]?.length ?? 0) : 0;
        return {
          table: item.table,
          records,
          status: "ok"
        };
      });
    }
    requireConfiguredDatabase();
  }
  const counts = await Promise.all(
    DISASTER_CRITICAL_TABLES.map(async (item) => {
      try {
        const [rows] = await _pool.query(
          `SELECT COUNT(*) AS records FROM \`${item.table}\``
        );
        return {
          table: item.table,
          records: Number(rows[0]?.records ?? 0),
          status: "ok"
        };
      } catch (error) {
        return {
          table: item.table,
          records: 0,
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );
  return counts;
}
async function getDisasterReadinessDashboard() {
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
  const backupStatus = (ENV.backupStatus || (backupFailedEvent ? "failed" : "unknown")).trim().toLowerCase();
  const envRestoreAt = parseOptionalDate(ENV.restoreTestLastPassedAt);
  const eventRestoreAt = parseOptionalDate(restorePassedEvent?.createdAt);
  const restoreTestAt = envRestoreAt ?? eventRestoreAt;
  const restoreTestPassed = ENV.restoreTestPassed || Boolean(restoreTestAt && (!restoreFailedEvent || restoreTestAt >= new Date(restoreFailedEvent.createdAt)));
  const criticalTables = await getCriticalTableReadiness();
  const tableErrors = criticalTables.filter((table) => table.status !== "ok");
  const alerts = [];
  if (!lastBackupAt) {
    alerts.push({
      type: "backup_missing",
      severity: "fatal",
      severityLabel: "critical",
      title: "Backup sem evidencia registrada",
      message: "Nenhuma evidencia de backup foi encontrada em variaveis ou eventos operacionais.",
      metadata: { rpoTargetHours, backupAgeHours: null }
    });
  } else if ((backupAgeHours ?? 0) > 72) {
    alerts.push({
      type: "backup_missing",
      severity: "fatal",
      severityLabel: "critical",
      title: "Backup acima de 72 horas",
      message: `Ultimo backup tem ${backupAgeHours}h. Meta RPO: ${rpoTargetHours}h.`,
      metadata: { rpoTargetHours, backupAgeHours, thresholdHours: 72 }
    });
  } else if ((backupAgeHours ?? 0) > 24) {
    alerts.push({
      type: "backup_missing",
      severity: "warning",
      severityLabel: "warning",
      title: "Backup acima de 24 horas",
      message: `Ultimo backup tem ${backupAgeHours}h. Meta RPO: ${rpoTargetHours}h.`,
      metadata: { rpoTargetHours, backupAgeHours, thresholdHours: 24 }
    });
  }
  if (backupStatus === "failed") {
    alerts.push({
      type: "backup_failed",
      severity: "fatal",
      severityLabel: "critical",
      title: "Falha de backup registrada",
      message: "A ultima evidencia de backup indica falha.",
      metadata: { backupStatus, backupFailedAt: backupFailedEvent?.createdAt ?? null }
    });
  }
  if (!restoreTestPassed) {
    alerts.push({
      type: "restore_test_failed",
      severity: "warning",
      severityLabel: "warning",
      title: "Restore test nao aprovado",
      message: "Nenhuma evidencia de teste de restore aprovado foi encontrada.",
      metadata: { rtoTargetHours, restoreTestAt: restoreTestAt?.toISOString() ?? null }
    });
  }
  for (const table of tableErrors) {
    alerts.push({
      type: "restore_test_failed",
      severity: "fatal",
      severityLabel: "critical",
      title: `Tabela critica inacessivel: ${table.table}`,
      message: table.error ?? "Tabela critica nao respondeu a consulta de prontidao.",
      metadata: { table: table.table, status: table.status }
    });
  }
  await persistDisasterReadinessAlerts(alerts);
  const status = alerts.some((alert) => alert.severity === "fatal") ? "critical" : alerts.length > 0 ? "warning" : "healthy";
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
      restoreFailedEventId: restoreFailedEvent?.id ?? null
    },
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function persistLongRunningJobAlerts(alerts) {
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
      message: `Job executando ha ${Math.round(alert.runningMs / 1e3)}s, acima de ${alert.thresholdMultiplier}x o runtime medio.`,
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
        stalledCount: 1
      }
    });
  }
}
function buildQueueIntegrityDashboard(events, failedJobs, runningJobs, days, averageRuntimeMs = 6e4, runningAlerts = buildLongRunningJobAlerts(runningJobs, averageRuntimeMs)) {
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
    status: duplicateJobs === 0 && failedRecoveries === 0 && stalledCount === 0 && runningAlerts.length === 0 ? "healthy" : "attention",
    target: {
      duplicateJobs: 0,
      failedRecoveries: 0,
      stalledJobs: 0,
      recoveryAfterFailure: "100%"
    },
    recentEvents: events.slice(0, 20)
  };
}
async function getOptimizationWorkerJobStats(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1e3);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const rows2 = memory.optimizationJobs.filter(
        (job) => job.workerId && new Date(job.createdAt).getTime() >= cutoffDate.getTime()
      );
      const byWorker = /* @__PURE__ */ new Map();
      for (const job of rows2) {
        const workerId = String(job.workerId);
        const current = byWorker.get(workerId) ?? {
          workerId,
          workerHostname: job.workerHostname ?? null,
          jobsProcessed: 0,
          jobsFailed: 0,
          runtimeTotal: 0,
          runtimeCount: 0
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
        workerAverageRuntime: worker.runtimeCount ? Math.round(worker.runtimeTotal / worker.runtimeCount) : 0
      }));
    }
    requireConfiguredDatabase();
  }
  const [rows] = await _pool.query(
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
    workerAverageRuntime: Number(row.workerAverageRuntime || 0)
  }));
}
async function getOptimizationJobsDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1e3);
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
    return db.select().from(optimizationJobs).where(gte(optimizationJobs.createdAt, cutoffDate)).orderBy(desc(optimizationJobs.createdAt)).limit(2e3);
  })();
  const byStatus = rows.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const runtimeValues = rows.map((job) => Number(job.runtimeMs || 0)).filter((value) => value > 0);
  const queueWaitValues = rows.map((job) => {
    const explicit = Number(job.queueWaitMs || 0);
    if (explicit > 0) return explicit;
    const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
    const createdAt = job.createdAt ? new Date(job.createdAt).getTime() : 0;
    return startedAt > createdAt ? startedAt - createdAt : 0;
  }).filter((value) => value > 0);
  const attempted = rows.filter(
    (job) => ["completed", "failed", "cancelled"].includes(String(job.status))
  ).length;
  const completed = byStatus.completed || 0;
  const failed = byStatus.failed || 0;
  const retrying = rows.filter(
    (job) => Number(job.attemptCount || 0) > 1 && String(job.status) !== "completed"
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
      maxMs: Math.max(0, ...queueWaitValues)
    },
    runtime: {
      averageMs: roundMetric(metricAverage(runtimeValues)),
      p50Ms: roundMetric(metricPercentile(runtimeValues, 50)),
      p95Ms: roundMetric(metricPercentile(runtimeValues, 95)),
      p99Ms: roundMetric(metricPercentile(runtimeValues, 99)),
      maxMs: Math.max(0, ...runtimeValues)
    },
    recent: rows.slice(0, 20)
  };
}
function normalizeMetricNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function metricAverage(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}
function metricPercentile(values, percentile) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index2 = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile / 100 * sorted.length) - 1)
  );
  return sorted[index2] ?? 0;
}
function metricPercent(part, total) {
  return total > 0 ? part / total * 100 : 0;
}
function roundMetric(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function buildPerformanceBenchmarkDashboard(rows, days, tableAvailable = true) {
  const scenarioTargets = [250, 500, 1e3, 2e3].map((stopCount) => {
    const values = rows.filter((row) => Number(row.stopCount ?? row.stop_count) === stopCount);
    const runtimes = values.map((row) => Number(row.runtimeMs ?? row.runtime_ms ?? 0));
    const latest = values.slice().sort(
      (a, b) => new Date(b.createdAt ?? b.created_at ?? 0).getTime() - new Date(a.createdAt ?? a.created_at ?? 0).getTime()
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
      status: !latest ? "missing" : latestCriteriaMet && latestRuntimeMs > 0 && latestRuntimeMs < targetMs ? "ready" : "no-go",
      latestAt: latest?.createdAt ?? latest?.created_at ?? null
    };
  });
  const totalRuns = rows.length;
  const successfulRuns = rows.filter((row) => Boolean(row.success)).length;
  const criteriaMetRuns = rows.filter(
    (row) => Boolean(row.criteriaMet ?? row.criteria_met)
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
    status: !tableAvailable ? "unavailable" : scenarioTargets.every((target) => target.status === "ready") ? "ready" : scenarioTargets.some((target) => target.status === "no-go") ? "no-go" : "partial",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getPerformanceBenchmarkDashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1e3);
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
    const rows = await db.select().from(performanceBenchmarks).where(gte(performanceBenchmarks.createdAt, cutoffDate)).orderBy(desc(performanceBenchmarks.createdAt)).limit(500);
    return buildPerformanceBenchmarkDashboard(rows, safeDays);
  } catch (error) {
    return {
      ...buildPerformanceBenchmarkDashboard([], safeDays, false),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function buildGoLive500Dashboard(args) {
  const maxRouteStops = args.maxRouteStops || ENV.maxRouteStops || 500;
  const routeStopCounts = args.routeStopCounts.map((value) => Number(value || 0)).filter((value) => value >= 0);
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
  const runtimeValues = routeMetricsRows.map(
    (row) => Number(
      row.totalRuntimeMs ?? row.total_runtime_ms ?? row.optimizationRuntimeMs ?? row.optimization_runtime_ms ?? 0
    )
  ).filter((value) => Number.isFinite(value) && value > 0);
  const benchmark500 = args.performanceBenchmarks?.targets?.find(
    (target) => Number(target.stopCount) === 500
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
  const issues = [];
  if (routesAboveLimit > 0) {
    issues.push({
      severity: "warning",
      message: `${routesAboveLimit} rota(s) historica(s) acima do limite comercial de ${maxRouteStops} paradas. Novas rotas acima do limite ja sao bloqueadas.`
    });
  }
  if (benchmark500Status === "missing") {
    issues.push({
      severity: "warning",
      message: "Benchmark oficial de 500 paradas ainda nao foi executado."
    });
  } else if (benchmark500Status !== "ready") {
    issues.push({
      severity: "critical",
      message: "Benchmark oficial de 500 paradas nao atingiu a meta de 30 segundos."
    });
  }
  if (runtimeP95Ms > 6e4) {
    issues.push({
      severity: "warning",
      message: "P95 operacional ate 500 paradas acima de 60 segundos."
    });
  }
  if (osrmFailureRate > 25) {
    issues.push({
      severity: "warning",
      message: `Falha OSRM em ${osrmFailureRate}% das chamadas nas rotas ate 500 paradas.`
    });
  }
  const verdict = issues.some((issue) => issue.severity === "critical") ? "NO_GO" : issues.length > 0 ? "ATTENTION" : "READY";
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
        maxRouteStops > 0 ? largestRouteStops / maxRouteStops * 100 : 0
      )
    },
    runtime: {
      sampleCount: runtimeValues.length,
      averageMs: Math.round(metricAverage(runtimeValues)),
      p50Ms: Math.round(metricPercentile(runtimeValues, 50)),
      p95Ms: runtimeP95Ms,
      p99Ms: Math.round(metricPercentile(runtimeValues, 99))
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
      osrmFailureRate
    },
    benchmark500: benchmark500 ? {
      status: benchmark500Status,
      targetMs: benchmark500.targetMs,
      latestRuntimeMs: benchmark500.latestRuntimeMs,
      latestPeakMemoryMb: benchmark500.latestPeakMemoryMb,
      latestOsrmLatencyMs: benchmark500.latestOsrmLatencyMs,
      runs: benchmark500.runs,
      latestAt: benchmark500.latestAt
    } : {
      status: "missing",
      targetMs: 3e4,
      latestRuntimeMs: 0,
      latestPeakMemoryMb: 0,
      latestOsrmLatencyMs: 0,
      runs: 0,
      latestAt: null
    },
    verdict,
    issues,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getGoLive500Dashboard(days = 30) {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoffDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1e3);
  const performanceBenchmarks2 = await getPerformanceBenchmarkDashboard(safeDays);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const stopCountsByRoute = /* @__PURE__ */ new Map();
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
        performanceBenchmarks: performanceBenchmarks2
      });
    }
    requireConfiguredDatabase();
  }
  const [routeRows] = await _pool.query(`
    SELECT r.id, COUNT(s.id) AS stopCount
    FROM routes r
    LEFT JOIN stops s ON s.routeId = r.id
    GROUP BY r.id
  `);
  const [metricRows] = await _pool.query(
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
    performanceBenchmarks: performanceBenchmarks2
  });
}
function parseMetricMetadata(metadata) {
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
function estimateCorrectedKmSaved(metric) {
  if (Number(metric.issuesCorrectedCount || 0) <= 0) return 0;
  const metadata = parseMetricMetadata(metric.metadata);
  const candidates = [
    metadata.firstBlockingIssue,
    metadata.blockingIssue,
    ...Array.isArray(metadata.finalIssues) ? metadata.finalIssues : []
  ].filter((issue) => issue && typeof issue === "object");
  const bestSaving = candidates.reduce((best, issue) => {
    const distanceKm = Number(issue.distanceKm);
    const nearestDistanceKm = Number(issue.nearestDistanceKm);
    if (Number.isFinite(distanceKm) && Number.isFinite(nearestDistanceKm) && distanceKm > nearestDistanceKm) {
      return Math.max(best, distanceKm - nearestDistanceKm);
    }
    return best;
  }, 0);
  return bestSaving;
}
function getMetricRouteMetadata(metric) {
  const metadata = parseMetricMetadata(metric.metadata);
  return metadata.routeMetadata && typeof metadata.routeMetadata === "object" ? metadata.routeMetadata : {};
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
    executionDurationMs: data.executionDurationMs == null ? null : Math.round(normalizeMetricNumber(data.executionDurationMs)),
    executionStatus: data.executionStatus ?? "pending",
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
async function getOsrmMatrixCache(matrixHash) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(osrmMatrixCache).where(eq(osrmMatrixCache.matrixHash, matrixHash)).limit(1);
  const cached = rows[0];
  if (!cached) return null;
  await db.update(osrmMatrixCache).set({
    lastUsedAt: /* @__PURE__ */ new Date(),
    hitCount: sql`${osrmMatrixCache.hitCount} + 1`
  }).where(eq(osrmMatrixCache.id, cached.id));
  return cached;
}
async function upsertOsrmMatrixCache(data) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(osrmMatrixCache).values({
    matrixHash: data.matrixHash,
    clusterHash: data.clusterHash,
    stopCount: Math.round(normalizeMetricNumber(data.stopCount)),
    durationMatrix: data.durationMatrix,
    distanceMatrix: data.distanceMatrix,
    profile: data.profile ?? "driving",
    provider: data.provider ?? "osrm",
    osrmBaseUrl: data.osrmBaseUrl ?? null,
    expiresAt: data.expiresAt ?? null,
    lastUsedAt: /* @__PURE__ */ new Date()
  }).onDuplicateKeyUpdate({
    set: {
      lastUsedAt: /* @__PURE__ */ new Date(),
      durationMatrix: data.durationMatrix,
      distanceMatrix: data.distanceMatrix,
      stopCount: Math.round(normalizeMetricNumber(data.stopCount)),
      osrmBaseUrl: data.osrmBaseUrl ?? null
    }
  });
  const rows = await db.select().from(osrmMatrixCache).where(eq(osrmMatrixCache.matrixHash, data.matrixHash)).limit(1);
  return rows[0] ?? null;
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
  const suspiciousGeocoding = metrics.reduce(
    (totalCount, metric) => totalCount + Number(metric.suspiciousGeocodingCount || 0),
    0
  );
  const geocodingAverageScores = metrics.map((metric) => Number(metric.averageGeocodingConfidence || 0)).filter((score) => Number.isFinite(score) && score > 0);
  const geocodingMinScores = metrics.map((metric) => Number(metric.minGeocodingConfidence || 0)).filter((score) => Number.isFinite(score) && score > 0);
  const geocodingScoreDistribution = {
    excellent: geocodingAverageScores.filter((score) => score >= 90).length,
    good: geocodingAverageScores.filter((score) => score >= 75 && score < 90).length,
    attention: geocodingAverageScores.filter(
      (score) => score >= 60 && score < 75
    ).length,
    suspicious: geocodingAverageScores.filter((score) => score < 60).length,
    notClassified: Math.max(0, total - geocodingAverageScores.length)
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
    (metric) => Number(metric.regionRevisitedCount || 0) > 0 || Number(metric.prematureRegionExitCount || 0) > 0
  ).length;
  const estimatedKmSaved = metrics.reduce(
    (totalSaved, metric) => totalSaved + estimateCorrectedKmSaved(metric),
    0
  );
  const estimatedMinutesSaved = estimatedKmSaved * 2.5;
  const estimatedFuelLitersSaved = estimatedKmSaved / 10;
  const estimatedCo2KgAvoided = estimatedFuelLitersSaved * 2.31;
  const partitionedMetrics = metrics.filter(
    (metric) => Boolean(getMetricRouteMetadata(metric).partitioned)
  );
  const partitionCounts = partitionedMetrics.map(
    (metric) => Number(getMetricRouteMetadata(metric).partitionCount || 0)
  );
  const largestPartitionSizes = partitionedMetrics.map(
    (metric) => Number(getMetricRouteMetadata(metric).largestPartitionSize || 0)
  );
  const routeModes = ["shortest_distance", "shortest_time", "balanced"];
  const stageNames = [
    "dbFetchMs",
    "clusteringMs",
    "osrmMs",
    "optimizerMs",
    "auditMs",
    "correctionMs",
    "dbSaveMs",
    "totalRuntimeMs"
  ];
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
          maxMs: Math.max(0, ...values)
        }
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
  const executionStarted = metrics.filter(
    (metric) => ["started", "completed", "abandoned"].includes(String(metric.executionStatus || ""))
  ).length;
  const executionCompleted = metrics.filter(
    (metric) => metric.executionStatus === "completed"
  ).length;
  const executionAbandoned = metrics.filter(
    (metric) => metric.executionStatus === "abandoned"
  ).length;
  const executionDurations = metrics.map((metric) => Number(metric.executionDurationMs || 0)).filter((value) => Number.isFinite(value) && value > 0);
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
      osrmFallbackRate: roundMetric(metricPercent(modeFallback, modeTotal)),
      averageGeocodingConfidence: roundMetric(
        metricAverage(
          modeMetrics.map(
            (metric) => Number(metric.averageGeocodingConfidence || 0)
          )
        )
      )
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
      scoreDistribution: geocodingScoreDistribution
    },
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
      p99ExecutionDurationMs: roundMetric(metricPercentile(executionDurations, 99))
    },
    issues: {
      regionRevisited: revisits,
      prematureRegionExit: prematureExits,
      nearbyStopSkipped: nearbySkips,
      routeCrossing: crossings,
      detected: detectedIssues,
      corrected: correctedIssues,
      blocked: blockedIssues,
      remaining: issuesRemaining
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
      issuesRemaining
    },
    commercialImpact: {
      estimatedKmSaved: roundMetric(estimatedKmSaved, 1),
      estimatedMinutesSaved: Math.round(estimatedMinutesSaved),
      estimatedFuelLitersSaved: roundMetric(estimatedFuelLitersSaved, 1),
      estimatedCo2KgAvoided: roundMetric(estimatedCo2KgAvoided, 1)
    },
    partitioning: {
      partitionedRouteCount: partitionedMetrics.length,
      partitionedRouteRate: roundMetric(metricPercent(partitionedMetrics.length, total)),
      averagePartitionCount: roundMetric(metricAverage(partitionCounts)),
      maxPartitionCount: Math.max(0, ...partitionCounts),
      largestPartitionSize: Math.max(0, ...largestPartitionSizes)
    },
    performance: {
      stages: performanceStages,
      osrm: {
        callCount: osrmCallCount,
        failureCount: osrmFailureCount,
        failureRate: roundMetric(metricPercent(osrmFailureCount, osrmCallCount)),
        totalMs: Math.round(osrmTotalMs),
        averageMs: Math.round(osrmCallCount > 0 ? osrmTotalMs / osrmCallCount : 0)
      }
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
function buildExecutionReportPeriod(metrics, blockedEvents, days) {
  const optimized = metrics.length;
  const started = metrics.filter(
    (metric) => ["started", "completed", "abandoned"].includes(String(metric.executionStatus || ""))
  ).length;
  const completed = metrics.filter((metric) => metric.executionStatus === "completed").length;
  const abandoned = metrics.filter((metric) => metric.executionStatus === "abandoned").length;
  const pending = Math.max(0, optimized - started);
  const durations = metrics.map((metric) => Number(metric.executionDurationMs || 0)).filter((value) => Number.isFinite(value) && value > 0);
  const blockedByReason = blockedEvents.reduce((acc, event) => {
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
    executionAbandonmentCount: abandoned
  };
}
async function getExecutionBlockedEvents(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const cutoff = cutoffDate.getTime();
      return memory.operationalEvents.filter(
        (event) => event.type === "route_start_blocked" && new Date(event.createdAt).getTime() >= cutoff
      );
    }
    requireConfiguredDatabase();
  }
  const [rows] = await _pool.query(
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
async function getOperationExecutionReport() {
  const metrics30 = await getRouteMetricsRows(30);
  const blocked30 = await getExecutionBlockedEvents(30);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
  const metrics7 = metrics30.filter(
    (metric) => new Date(metric.createdAt).getTime() >= sevenDaysAgo
  );
  const blocked7 = blocked30.filter(
    (event) => new Date(event.createdAt).getTime() >= sevenDaysAgo
  );
  const last7Days = buildExecutionReportPeriod(metrics7, blocked7, 7);
  const last30Days = buildExecutionReportPeriod(metrics30, blocked30, 30);
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    last7Days,
    last30Days,
    comparison: {
      startRate: roundMetric(last7Days.startRate - last30Days.startRate),
      completionRate: roundMetric(last7Days.completionRate - last30Days.completionRate),
      abandonmentRate: roundMetric(last7Days.abandonmentRate - last30Days.abandonmentRate),
      optimizedRoutes: last7Days.optimizedRoutes - last30Days.optimizedRoutes,
      startedRoutes: last7Days.startedRoutes - last30Days.startedRoutes,
      completedRoutes: last7Days.completedRoutes - last30Days.completedRoutes,
      abandonedRoutes: last7Days.abandonedRoutes - last30Days.abandonedRoutes
    }
  };
}
async function getRouteMetricsRows(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
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
  return db.select().from(routeMetrics).where(gte(routeMetrics.createdAt, cutoffDate)).orderBy(desc(routeMetrics.createdAt));
}
async function getOperationalEventsRows(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
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
  const limit = 2e3;
  const [rows] = await _pool.query(
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
async function getStopGeocodingRows(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
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
  return db.select({
    id: stops.id,
    geocodingConfidenceScore: stops.geocodingConfidenceScore,
    geocodingMethod: stops.geocodingMethod,
    geocodingSuspect: stops.geocodingSuspect,
    createdAt: stops.createdAt
  }).from(stops).where(gte(stops.createdAt, cutoffDate));
}
async function getAddressCorrectionRows(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
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
  return db.select().from(addressCorrections).where(gte(addressCorrections.createdAt, cutoffDate)).orderBy(desc(addressCorrections.createdAt));
}
function buildConfidenceBuckets(scores) {
  return {
    score_0_20: scores.filter((score) => score >= 0 && score <= 20).length,
    score_21_40: scores.filter((score) => score >= 21 && score <= 40).length,
    score_41_60: scores.filter((score) => score >= 41 && score <= 60).length,
    score_61_80: scores.filter((score) => score >= 61 && score <= 80).length,
    score_81_100: scores.filter((score) => score >= 81 && score <= 100).length
  };
}
function getProviderFromMethod(method) {
  if (method === "manual_coordinate") return "manual";
  return "nominatim";
}
function incrementKey(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}
function buildProviderDistribution(events, stopRows) {
  const providers = {};
  for (const stop of stopRows) {
    const provider = getProviderFromMethod(String(stop.geocodingMethod || ""));
    incrementKey(providers, provider);
  }
  for (const event of events) {
    const metadata = parseOperationalMetadata(event.metadata);
    const provider = String(metadata.provider_used || metadata.providerUsed || "");
    if (!provider) continue;
    const amount = Number(metadata.geocoding_cache_hit_local || 0) || Number(metadata.geocoding_cache_hit_backend || 0) || Number(metadata.geocoding_cache_miss || 0) || 1;
    incrementKey(providers, provider, amount);
  }
  const total = Object.values(providers).reduce((sum, value) => sum + value, 0);
  return Object.entries(providers).sort((a, b) => b[1] - a[1]).map(([provider, count]) => ({
    provider,
    count,
    rate: roundMetric(metricPercent(count, total))
  }));
}
function buildManualCorrectionsSummary(corrections) {
  const addressCounts = /* @__PURE__ */ new Map();
  const cityCounts = /* @__PURE__ */ new Map();
  for (const correction of corrections) {
    const address = String(correction.originalAddress || "").slice(0, 160);
    const city = correction.city || extractCityFromAddress(String(correction.correctedAddress || ""));
    if (address) addressCounts.set(address, (addressCounts.get(address) || 0) + 1);
    if (city) cityCounts.set(String(city), (cityCounts.get(String(city)) || 0) + 1);
  }
  const top = (entries) => entries.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
  return {
    count: corrections.length,
    topAddresses: top(Array.from(addressCounts.entries())),
    topCities: top(Array.from(cityCounts.entries()))
  };
}
function buildGeocodingWindowSummary(args) {
  const routeMetricsSummary = buildRouteMetricsSummary(args.metrics, args.days);
  const stopScores = args.stops.map((stop) => Number(stop.geocodingConfidenceScore)).filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
  const cache2 = buildGeocodingCacheDashboard(args.events);
  const manualCorrections = buildManualCorrectionsSummary(args.corrections);
  const fiscalLowConfidenceBlocks = args.events.filter((event) => {
    const metadata = parseOperationalMetadata(event.metadata);
    return event.type === "geocoding_low_confidence" || String(metadata.blockingIssueType || metadata.issueType || "") === "low_geocoding_confidence";
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
    cache: cache2,
    providers: buildProviderDistribution(args.events, args.stops),
    manualCorrections,
    fallbackRate: routeMetricsSummary.osrmFallbackRate,
    routeMetrics: routeMetricsSummary
  };
}
function buildImpactComparison(last7Days, last30Days) {
  const compare = (current, baseline) => baseline > 0 ? roundMetric((current - baseline) / baseline * 100) : 0;
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
    cacheHitRate: compare(last7Days.cache.hitRate, last30Days.cache.hitRate)
  };
}
async function getGeocodingImpactDashboard() {
  const [
    metrics7,
    metrics30,
    events7,
    events30,
    stops7,
    stops30,
    corrections7,
    corrections30
  ] = await Promise.all([
    getRouteMetricsRows(7),
    getRouteMetricsRows(30),
    getOperationalEventsRows(7),
    getOperationalEventsRows(30),
    getStopGeocodingRows(7),
    getStopGeocodingRows(30),
    getAddressCorrectionRows(7),
    getAddressCorrectionRows(30)
  ]);
  const last7Days = buildGeocodingWindowSummary({
    days: 7,
    metrics: metrics7,
    events: events7,
    stops: stops7,
    corrections: corrections7
  });
  const last30Days = buildGeocodingWindowSummary({
    days: 30,
    metrics: metrics30,
    events: events30,
    stops: stops30,
    corrections: corrections30
  });
  return {
    last7Days,
    last30Days,
    comparison: buildImpactComparison(last7Days, last30Days)
  };
}
async function getGeocodingExecutiveReport() {
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
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
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
function buildGeocodingCacheDashboard(events) {
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
    localReuseRateFromClient: roundMetric(metricPercent(localHits, localTotal))
  };
}
async function buildAdminOperationalDashboardLive() {
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
      const geocodingCache2 = buildGeocodingCacheDashboard(events.slice(0, 500));
      const geocodingImpact2 = await getGeocodingImpactDashboard();
      const geocodingExecutiveReport2 = await getGeocodingExecutiveReport();
      const optimizationJobsSummary2 = await getOptimizationJobsDashboard(30);
      const operationExecutionReport2 = await getOperationExecutionReport();
      const performanceBenchmarks3 = await getPerformanceBenchmarkDashboard(30);
      const goLive5002 = await getGoLive500Dashboard(30);
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
        optimizationJobs: optimizationJobsSummary2,
        operationExecutionReport: operationExecutionReport2,
        performanceBenchmarks: performanceBenchmarks3,
        goLive500: goLive5002,
        geocodingCache: geocodingCache2,
        geocodingImpact: geocodingImpact2,
        geocodingExecutiveReport: geocodingExecutiveReport2,
        recentUsers: recentUsers2,
        recentRoutes: recentRoutes2,
        recentEvents: []
      };
    }
    requireConfiguredDatabase();
  }
  const [[statsRow], routeMetricsSummary, geocodingImpact, geocodingExecutiveReport, optimizationJobsSummary, operationExecutionReport, performanceBenchmarks2, goLive500] = await Promise.all([
    _pool.query(`
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
    getGoLive500Dashboard(30)
  ]);
  const routeQuality = buildRouteQualityDashboardFromMetrics(
    routeMetricsSummary,
    buildRouteQualityDashboard([])
  );
  const geocodingCache = geocodingImpact.last30Days.cache;
  const [recentUsers, recentRoutes] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn
    }).from(users).orderBy(desc(users.createdAt)).limit(8),
    db.select({
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
    }).from(routes).leftJoin(users, eq(routes.userId, users.id)).orderBy(desc(routes.createdAt)).limit(8)
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
      routeWarnings24h: Number(statsRow?.routeWarnings24h || 0)
    },
    routeQuality,
    routeMetrics: routeMetricsSummary,
    optimizationJobs: optimizationJobsSummary,
    operationExecutionReport,
    performanceBenchmarks: performanceBenchmarks2,
    goLive500,
    geocodingCache,
    geocodingImpact,
    geocodingExecutiveReport,
    recentUsers,
    recentRoutes,
    recentEvents: []
  };
}
function parseDashboardPayload(payload) {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? payload : null;
}
async function refreshAdminDashboardMetrics() {
  const dashboard = await buildAdminOperationalDashboardLive();
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) return dashboard;
    requireConfiguredDatabase();
  }
  await db.insert(adminDashboardMetrics).values({
    generatedAt: /* @__PURE__ */ new Date(),
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
    payload: dashboard
  });
  return {
    ...dashboard,
    materialized: {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      refreshed: true,
      stale: false
    }
  };
}
async function getAdminOperationalDashboard() {
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) return buildAdminOperationalDashboardLive();
    requireConfiguredDatabase();
  }
  try {
    const latest = await db.select().from(adminDashboardMetrics).orderBy(desc(adminDashboardMetrics.generatedAt)).limit(1);
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
          stale: ageMs > 5 * 60 * 1e3,
          ageMs
        }
      };
    }
  } catch (error) {
    console.warn("[Admin] Failed to load materialized dashboard:", error);
  }
  return refreshAdminDashboardMetrics();
}
async function getAdminDashboardEvents(page = 1, limit = 30) {
  const safeLimit = Math.min(Math.max(Math.round(limit), 1), 100);
  const safePage = Math.max(Math.round(page), 1);
  const offset = (safePage - 1) * safeLimit;
  const db = await getDb();
  if (!db) {
    if (await shouldUseMemoryDb()) {
      const rows2 = sortByDateDesc(memory.operationalEvents, "createdAt");
      return {
        page: safePage,
        limit: safeLimit,
        events: rows2.slice(offset, offset + safeLimit),
        hasMore: rows2.length > offset + safeLimit
      };
    }
    requireConfiguredDatabase();
  }
  const [rows] = await _pool.query(
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
    hasMore: rows.length > safeLimit
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
var _db, _pool, _lastDbConnectAttempt, _lastDbConnectionError, DB_CONNECT_RETRY_MS, LOCAL_DB_DIR, LOCAL_DB_FILE, FALLBACK_DB_KEY, FALLBACK_KV_PREFIX, localDbLoaded, remoteDbLoaded, remoteDbLoadPromise, lastRemoteFallbackError, memory, REQUIRED_SCHEMA_COLUMNS, QUEUE_INTEGRITY_EVENT_TYPES, DISASTER_CRITICAL_TABLES, DISASTER_EVENT_TYPES, PERFORMANCE_BENCHMARK_TARGETS;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    init_geocodingConfidence();
    init_stopMetadata();
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
      optimizationJobs: [],
      performanceBenchmarks: [],
      geocodeCache: [],
      addressCorrections: [],
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
        addressCorrections: 1
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
      ["stops", "geocodingConfidenceScore"],
      ["stops", "geocodingMethod"],
      ["stops", "geocodingSuspect"],
      ["stops", "sourceProvider"],
      ["stops", "originalStop"],
      ["stops", "isUnsequencedStop"],
      ["stops", "metadata"],
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
      ["address_corrections", "user_id"]
    ];
    QUEUE_INTEGRITY_EVENT_TYPES = [
      "duplicate_job_detected",
      "worker_crash_recovered",
      "job_recovered_after_crash",
      "optimization_job_stalled",
      "redis_reconnect_detected",
      "optimization_job_failed"
    ];
    DISASTER_CRITICAL_TABLES = [
      { table: "routes", memoryKey: "routes" },
      { table: "stops", memoryKey: "stops" },
      { table: "route_metrics", memoryKey: "routeMetrics" },
      { table: "optimization_jobs", memoryKey: "optimizationJobs" },
      { table: "operationalEvents", memoryKey: "operationalEvents" },
      { table: "address_corrections", memoryKey: "addressCorrections" },
      { table: "osrm_matrix_cache", memoryKey: null },
      { table: "admin_dashboard_metrics", memoryKey: null }
    ];
    DISASTER_EVENT_TYPES = [
      "backup_completed",
      "backup_missing",
      "backup_failed",
      "restore_test_passed",
      "restore_test_failed"
    ];
    PERFORMANCE_BENCHMARK_TARGETS = {
      250: 15e3,
      500: 3e4,
      1e3: 6e4,
      2e3: 18e4
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
import { createHash as createHash2 } from "node:crypto";

// shared/addressCache.ts
function normalizeAddressText(value) {
  return value.replace(/\bR\.\s+/gi, "Rua ").replace(/\bAv\.\s+/gi, "Avenida ").replace(/\bPres\.\s+Prudente\b/gi, "Presidente Prudente").replace(/\bPte\.\s+Prudente\b/gi, "Presidente Prudente").replace(/\s+/g, " ").trim();
}
function normalizeAddressForCache(value) {
  return normalizeAddressText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bbrasil\b/g, " ").replace(/\bsao paulo\b/g, " sp ").replace(
    /\b(?:apto?|apartamento|ap|bloco|torre|casa|fundos|sala|loja|quadra|lote|andar|condominio)\b.*$/i,
    " "
  ).replace(/\bcep\b/g, " ").replace(/\b\d{5}-?\d{3}\b/g, " ").replace(/[^a-z0-9]+/g, "").trim();
}
function stripAddressComplementForCache(value) {
  const normalized = normalizeAddressText(value);
  return normalized.replace(
    /\s*,?\s*\b(?:apto?|apartamento|ap|bloco|torre|casa|fundos|sala|loja|quadra|lote|andar|condominio|condomínio)\b.*$/i,
    ""
  ).trim() || normalized;
}
function moveLeadingHouseNumberForCache(value) {
  const parts = normalizeAddressText(value).split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;
  if (!/^\d+[a-zA-Z]?$/.test(parts[0]) || !/[a-zA-ZÀ-ÿ]/.test(parts[1])) {
    return value;
  }
  return [parts[1], parts[0], ...parts.slice(2)].join(", ");
}
function getEquivalentAddressCacheKeys(value) {
  const normalized = normalizeAddressText(value);
  const withoutComplement = stripAddressComplementForCache(normalized);
  const candidates = [
    normalized,
    withoutComplement,
    normalized.replace(/,\s*brasil$/i, ""),
    withoutComplement.replace(/,\s*brasil$/i, ""),
    moveLeadingHouseNumberForCache(normalized),
    moveLeadingHouseNumberForCache(withoutComplement)
  ];
  return Array.from(
    new Set(
      candidates.map(normalizeAddressForCache).filter((key) => key.length >= 4)
    )
  );
}

// server/_core/geocodingProxy.ts
var NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var databaseCacheTtlDays = Number(process.env.GEOCODING_DATABASE_CACHE_TTL_DAYS);
var DATABASE_CACHE_TTL_MS = Math.max(
  CACHE_TTL_MS,
  (Number.isFinite(databaseCacheTtlDays) && databaseCacheTtlDays > 0 ? databaseCacheTtlDays : 30) * 24 * 60 * 60 * 1e3
);
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
function normalizeSearchQuery(query) {
  return query.replace(/\s+/g, " ").trim();
}
function getSearchCacheKey(query, limit) {
  const normalized = normalizeAddressForCache(query) || query.toLowerCase();
  return `${normalized}|${limit}`;
}
function getRememberCacheKeys(address, limit) {
  const keys = getEquivalentAddressCacheKeys(address);
  return (keys.length > 0 ? keys : [normalizeAddressForCache(address)]).map(
    (key) => `${key}|${limit}`
  );
}
function readPositiveHeaderNumber(req, name) {
  const raw = req.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const number = Math.trunc(Number(value || 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
}
async function recordClientCacheMetrics(req) {
  const hits = readPositiveHeaderNumber(
    req,
    "X-EconoRotas-Geocoding-Local-Hits"
  );
  const misses = readPositiveHeaderNumber(
    req,
    "X-EconoRotas-Geocoding-Local-Misses"
  );
  if (hits <= 0 && misses <= 0) return;
  await createOperationalEvent({
    type: "geocoding_cache_client_metrics",
    severity: "info",
    source: "geocoding.cache",
    title: "Metricas de cache local de enderecos",
    message: `${hits} hit(s) local(is), ${misses} miss(es) local(is).`,
    metadata: {
      geocoding_cache_hit_local: hits,
      geocoding_cache_miss_local: misses
    }
  }).catch((error) => {
    console.warn("[Geocoding] Failed to record local cache metrics:", error);
  });
  if (hits > 0) {
    await recordGeocodingEvent({
      type: "geocoding_cache_hit",
      title: "Cache local reaproveitado",
      message: `${hits} endereco(s) reaproveitado(s) no dispositivo.`,
      metadata: {
        provider_used: "cache_local",
        geocoding_cache_hit_local: hits
      }
    });
  }
  if (misses > 0) {
    await recordGeocodingEvent({
      type: "geocoding_cache_miss",
      title: "Cache local sem correspondencia",
      message: `${misses} endereco(s) precisaram consultar o backend.`,
      metadata: {
        provider_used: "cache_local",
        geocoding_cache_miss_local: misses
      }
    });
  }
}
async function recordGeocodingEvent(data) {
  await createOperationalEvent({
    type: data.type,
    severity: data.severity ?? "info",
    source: "geocoding.proxy",
    title: data.title,
    message: data.message,
    metadata: data.metadata
  }).catch((error) => {
    console.warn("[Geocoding] Failed to record geocoding event:", error);
  });
}
function isCoordinateInBrazil(latitude, longitude) {
  return latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -34;
}
function getNominatimUserAgent() {
  return process.env.NOMINATIM_USER_AGENT || `routing-pwa/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "local-development"})`;
}
function getPersistentCacheKey(cacheKey) {
  return `geocoding:${Buffer.from(cacheKey).toString("base64url")}`;
}
function getDatabaseCacheKey(cacheKey) {
  return createHash2("sha256").update(cacheKey).digest("hex");
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
  const databaseCached = await getGeocodeCache(getDatabaseCacheKey(cacheKey)).catch(
    (error) => {
      console.warn("[Geocoding] Failed to read database cache:", error);
      return null;
    }
  );
  if (databaseCached) {
    setMemoryCache(cacheKey, databaseCached.results);
    return databaseCached.results;
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
  await setGeocodeCache({
    cacheKey: getDatabaseCacheKey(cacheKey),
    query: cacheKey,
    provider: "nominatim",
    results: Array.isArray(data) ? data : [],
    expiresAt: new Date(Date.now() + DATABASE_CACHE_TTL_MS)
  }).catch((error) => {
    console.warn("[Geocoding] Failed to persist database cache:", error);
  });
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
async function requireAuthenticatedGeocodeUser(req) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}
function buildConfirmedAddressResult(data) {
  return {
    place_id: `confirmed:${createHash2("sha1").update(`${data.address}|${data.latitude}|${data.longitude}`).digest("hex")}`,
    licence: "EconoRota user-confirmed address memory",
    osm_type: "user_confirmed",
    osm_id: 0,
    lat: String(data.latitude),
    lon: String(data.longitude),
    category: "place",
    type: "user_confirmed",
    importance: 1,
    addresstype: "address",
    display_name: data.address,
    address: {
      road: data.address,
      country: "Brasil",
      country_code: "br"
    },
    econorotas: {
      source: "user_confirmed",
      userId: data.userId
    }
  };
}
function registerGeocodingProxy(app2) {
  app2.get("/api/geocode/search", async (req, res) => {
    const q = normalizeSearchQuery(String(req.query.q || ""));
    const limit = Math.min(Number(req.query.limit || 6) || 6, 10);
    if (q.length < 4) {
      res.json([]);
      return;
    }
    await recordClientCacheMetrics(req);
    const cacheKey = getSearchCacheKey(q, limit);
    const cached = await getCached(cacheKey);
    if (cached) {
      await recordGeocodingEvent({
        type: "geocoding_cache_hit",
        title: "Cache global de endereco reaproveitado",
        message: "Consulta atendida pelo cache compartilhado do backend.",
        metadata: {
          provider_used: "cache_backend",
          geocoding_cache_hit_backend: 1,
          queryLength: q.length,
          resultCount: Array.isArray(cached) ? cached.length : 0
        }
      });
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
      await recordGeocodingEvent({
        type: "geocoding_cache_miss",
        title: "Consulta externa de geocoding",
        message: "Endereco consultado no provedor externo apos miss de cache.",
        metadata: {
          provider_used: "nominatim",
          geocoding_cache_miss: 1,
          queryLength: q.length,
          resultCount: Array.isArray(data) ? data.length : 0
        }
      });
      res.setHeader("X-EconoRotas-Geocoding-Cache", "miss");
      res.json(data);
    } catch (error) {
      const status = error.status;
      await recordGeocodingEvent({
        type: "geocoding_provider_fallback",
        severity: "warning",
        title: "Falha no provedor de geocoding",
        message: "Nominatim falhou e a consulta nao teve provedor alternativo configurado.",
        metadata: {
          provider_used: "nominatim",
          fallbackProvider: null,
          status: status ?? null,
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown"
        }
      });
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
  app2.post("/api/geocode/remember", async (req, res) => {
    const user = await requireAuthenticatedGeocodeUser(req);
    if (!user) {
      res.status(401).json({ error: "Entre para salvar a coordenada confirmada." });
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
    const address = normalizeSearchQuery(String(req.body?.address || ""));
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (address.length < 6 || address.length > 500) {
      res.status(400).json({ error: "Endereco invalido para memoria central." });
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isCoordinateInBrazil(latitude, longitude)) {
      res.status(400).json({ error: "Coordenada invalida para memoria central." });
      return;
    }
    const result = buildConfirmedAddressResult({
      address,
      latitude,
      longitude,
      userId: user.id
    });
    await Promise.all(
      [1, 6].flatMap(
        (limit) => getRememberCacheKeys(address, limit).map(
          (cacheKey) => setCached(cacheKey, [result])
        )
      )
    );
    res.json({
      ok: true,
      source: "user_confirmed"
    });
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
import { randomBytes as randomBytes2, scrypt as scryptCallback, timingSafeEqual, createHash as createHash3 } from "node:crypto";
import { promisify } from "node:util";
var scrypt = promisify(scryptCallback);
var KEY_LENGTH = 64;
var HASH_PREFIX = "scrypt";
function normalizeEmail2(email) {
  return email.trim().toLowerCase();
}
function buildPasswordOpenId(email) {
  const digest = createHash3("sha256").update(normalizeEmail2(email)).digest("hex");
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
function chunkStops(cluster, maxPartitionSize, nextClusterId) {
  if (cluster.stops.length <= maxPartitionSize) {
    return [{
      ...cluster,
      sourceClusterId: cluster.clusterId
    }];
  }
  const targetPartitionCount = Math.ceil(cluster.stops.length / maxPartitionSize);
  const gridSize = Math.max(2, Math.ceil(Math.sqrt(targetPartitionCount)));
  const latitudes = cluster.stops.map((stop) => stop.latitude);
  const longitudes = cluster.stops.map((stop) => stop.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(1e-6, maxLatitude - minLatitude);
  const longitudeSpan = Math.max(1e-6, maxLongitude - minLongitude);
  const gridGroups = /* @__PURE__ */ new Map();
  for (const stop of cluster.stops) {
    const row = Math.min(
      gridSize - 1,
      Math.floor((stop.latitude - minLatitude) / latitudeSpan * gridSize)
    );
    const column = Math.min(
      gridSize - 1,
      Math.floor((stop.longitude - minLongitude) / longitudeSpan * gridSize)
    );
    const key = `${row}:${column}`;
    const group = gridGroups.get(key) ?? [];
    group.push(stop);
    gridGroups.set(key, group);
  }
  const orderedStops = Array.from(gridGroups.entries()).sort(([keyA], [keyB]) => {
    const [rowA, columnA] = keyA.split(":").map(Number);
    const [rowB, columnB] = keyB.split(":").map(Number);
    if (rowA !== rowB) return rowA - rowB;
    return columnA - columnB;
  }).flatMap(
    ([, stops2]) => [...stops2].sort((a, b) => {
      if (a.latitude !== b.latitude) return a.latitude - b.latitude;
      if (a.longitude !== b.longitude) return a.longitude - b.longitude;
      return a.originalIndex - b.originalIndex;
    })
  );
  const chunks = [];
  for (let index2 = 0; index2 < orderedStops.length; index2 += maxPartitionSize) {
    const stopsChunk = orderedStops.slice(index2, index2 + maxPartitionSize);
    chunks.push({
      clusterId: nextClusterId(),
      sourceClusterId: cluster.clusterId,
      centroid: centroidForIndexes(stopsChunk, stopsChunk.map((_, chunkIndex) => chunkIndex)),
      stops: stopsChunk
    });
  }
  return chunks;
}
function shouldMicrocluster(cluster, totalStopCount, maxPartitionSize) {
  if (cluster.stops.length <= maxPartitionSize) return false;
  if (totalStopCount >= 501) return true;
  if (totalStopCount >= 201) return true;
  if (totalStopCount >= 101) {
    const radius = Math.max(
      0,
      ...cluster.stops.map((stop) => calculateDistance(cluster.centroid, stop))
    );
    return cluster.stops.length > 100 || radius > 1.5;
  }
  return false;
}
function partitionStopsForOptimization(stops2, options = {}) {
  if (stops2.length === 0) return [];
  const defaultPartitionSize = stops2.length >= 501 ? 60 : 70;
  const maxPartitionSize = Math.max(10, options.maxPartitionSize ?? defaultPartitionSize);
  const clusters = clusterStops(stops2, options);
  let generatedClusterId = clusters.length + 1;
  const nextClusterId = () => generatedClusterId++;
  const partitions = clusters.flatMap(
    (cluster) => options.forceMicrocluster || shouldMicrocluster(cluster, stops2.length, maxPartitionSize) ? chunkStops(cluster, maxPartitionSize, nextClusterId) : [{
      ...cluster,
      sourceClusterId: cluster.clusterId
    }]
  );
  return partitions.sort((a, b) => {
    const minA = Math.min(...a.stops.map((stop) => stop.originalIndex));
    const minB = Math.min(...b.stops.map((stop) => stop.originalIndex));
    return minA - minB;
  });
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
function chooseNextGeographicPartition(partitions, currentLocation) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  partitions.forEach((partition, index2) => {
    const distance = calculateDistance(currentLocation, partition.centroid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index2;
    }
  });
  return bestIndex;
}
function optimizePartitionedOpenRoute(locations, mode = "balanced", options = {}) {
  const partitions = partitionStopsForOptimization(locations, {
    ...options,
    maxPartitionSize: options.maxPartitionSize ?? 70
  });
  if (partitions.length <= 1) return null;
  const remaining = [...partitions];
  const largestPartitionSize = Math.max(
    0,
    ...partitions.map((partition) => partition.stops.length)
  );
  const finalSequence = [];
  const finalWaypoints = [];
  let totalDistance = 0;
  let totalTime = 0;
  let currentLocation = options.startLocation ?? remaining[0].centroid;
  while (remaining.length > 0) {
    const partitionIndex = chooseNextGeographicPartition(remaining, currentLocation);
    const [partition] = remaining.splice(partitionIndex, 1);
    const isLastPartition = remaining.length === 0;
    const partitionLocations = partition.stops.map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
      notes: stop.notes,
      geocodingConfidenceScore: stop.geocodingConfidenceScore,
      geocodingMethod: stop.geocodingMethod,
      geocodingSuspect: stop.geocodingSuspect
    }));
    const optimizedPartition = optimizeOpenRoute(partitionLocations, mode, 0, {
      ...options,
      startLocation: currentLocation,
      endLocation: isLastPartition ? options.endLocation : void 0,
      partitionLargeRoutes: false
    });
    totalDistance += optimizedPartition.totalDistance;
    totalTime += optimizedPartition.totalTime;
    for (const localIndex of optimizedPartition.sequence) {
      const originalStop = partition.stops[localIndex];
      if (!originalStop) return null;
      finalSequence.push(originalStop.originalIndex);
      finalWaypoints.push({
        latitude: originalStop.latitude,
        longitude: originalStop.longitude,
        address: originalStop.address,
        notes: originalStop.notes,
        geocodingConfidenceScore: originalStop.geocodingConfidenceScore,
        geocodingMethod: originalStop.geocodingMethod,
        geocodingSuspect: originalStop.geocodingSuspect,
        sequence: finalWaypoints.length
      });
    }
    const lastWaypoint = finalWaypoints[finalWaypoints.length - 1];
    if (lastWaypoint) currentLocation = lastWaypoint;
  }
  return {
    sequence: finalSequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime: Math.round(totalTime),
    waypoints: finalWaypoints,
    metadata: {
      partitioned: true,
      partitionCount: partitions.length,
      maxPartitionSize: options.maxPartitionSize ?? 70,
      largestPartitionSize
    }
  };
}
function optimizeOpenRoute(locations, mode = "balanced", startIndex = 0, options = {}) {
  if (locations.length === 0) {
    return buildOptimizedRoute(locations, [], options);
  }
  if (options.partitionLargeRoutes !== false && locations.length > 120) {
    const partitioned = optimizePartitionedOpenRoute(locations, mode, options);
    if (partitioned) return partitioned;
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
init_db();
import { createHash as createHash4 } from "node:crypto";
var ROAD_MATRIX_PARTITION_SIZE = 70;
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
function hashText(value) {
  return createHash4("sha256").update(value).digest("hex");
}
function coordinateKey(node) {
  return [
    node.role,
    node.deliveryIndex ?? "",
    Number(node.location.latitude).toFixed(6),
    Number(node.location.longitude).toFixed(6)
  ].join(":");
}
function buildMatrixHashes(nodes) {
  const orderedCoordinates = nodes.map(coordinateKey).join("|");
  const unorderedCoordinates = nodes.map(
    (node) => [
      node.role,
      Number(node.location.latitude).toFixed(6),
      Number(node.location.longitude).toFixed(6)
    ].join(":")
  ).sort().join("|");
  const providerKey = ENV.osrmBaseUrl.replace(/\/+$/, "");
  return {
    matrixHash: hashText(["driving", providerKey, orderedCoordinates].join("|")),
    clusterHash: hashText(["driving", unorderedCoordinates].join("|"))
  };
}
function isMatrixValue(value, expectedSize) {
  return Array.isArray(value) && value.length === expectedSize && value.every(
    (row) => Array.isArray(row) && row.length === expectedSize && row.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}
function buildOsrmHealthUrl() {
  const baseUrl = ENV.osrmBaseUrl.replace(/\/+$/, "");
  const coordinates = "-51.407,-22.121;-51.406,-22.122";
  return `${baseUrl}/route/v1/driving/${coordinates}?overview=false&alternatives=false&steps=false`;
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
  const startedAt = Date.now();
  const provider = ENV.osrmBaseUrl.replace(/\/+$/, "");
  const record = (success, failureReason = null, cacheHit = false) => {
    const durationMs = Date.now() - startedAt;
    if (!cacheHit) {
      options.telemetry?.recordOsrmCall?.(durationMs, success);
    }
    options.telemetry?.recordOsrmMatrix?.({
      nodeCount: nodes.length,
      durationMs,
      cacheHit,
      success,
      failureReason,
      provider
    });
  };
  const { matrixHash, clusterHash } = buildMatrixHashes(nodes);
  const shouldUseMatrixCache = process.env.VITEST !== "true";
  const cached = shouldUseMatrixCache ? await getOsrmMatrixCache(matrixHash).catch(() => null) : null;
  if (cached && isMatrixValue(cached.distanceMatrix, nodes.length) && isMatrixValue(cached.durationMatrix, nodes.length)) {
    record(true, null, true);
    return {
      matrix: {
        nodes,
        distancesKm: cached.distanceMatrix,
        durationsMinutes: cached.durationMatrix
      },
      startNodeIndex,
      endNodeIndex
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENV.osrmRequestTimeoutMs);
  try {
    const response = await fetch(buildOsrmTableUrl(nodes), {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      record(false, `http_${response.status}`);
      return null;
    }
    const data = await response.json();
    if (data.code !== "Ok") {
      record(false, `osrm_${data.code || "not_ok"}`);
      return null;
    }
    const distancesKm = normalizeMatrix(data.distances, 1e3);
    const durationsMinutes = normalizeMatrix(data.durations, 60);
    if (!distancesKm || !durationsMinutes) {
      record(false, "invalid_matrix");
      return null;
    }
    if (shouldUseMatrixCache) {
      await upsertOsrmMatrixCache({
        matrixHash,
        clusterHash,
        stopCount: nodes.length,
        durationMatrix: durationsMinutes,
        distanceMatrix: distancesKm,
        provider: "osrm",
        osrmBaseUrl: provider
      }).catch(() => null);
    }
    record(true);
    return {
      matrix: { nodes, distancesKm, durationsMinutes },
      startNodeIndex,
      endNodeIndex
    };
  } catch (error) {
    record(false, error instanceof Error ? error.name || error.message : "fetch_error");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function getOsrmHealth() {
  const baseUrl = ENV.osrmBaseUrl.trim().replace(/\/+$/, "");
  const configured = Boolean(baseUrl);
  const baseHealth = {
    enabled: ENV.osrmEnabled,
    required: ENV.osrmRequired,
    configured,
    reachable: false,
    baseUrl: configured ? baseUrl : null,
    timeoutMs: ENV.osrmHealthTimeoutMs,
    error: null
  };
  if (!ENV.osrmEnabled) {
    return {
      ...baseHealth,
      error: ENV.osrmRequired ? "OSRM_REQUIRED=true, mas OSRM_ENABLED=false." : null
    };
  }
  if (!configured) {
    return {
      ...baseHealth,
      error: "OSRM_BASE_URL nao configurado."
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENV.osrmHealthTimeoutMs);
  try {
    const response = await fetch(buildOsrmHealthUrl(), {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      return {
        ...baseHealth,
        error: `OSRM respondeu HTTP ${response.status}.`
      };
    }
    const data = await response.json();
    if (data.code !== "Ok") {
      return {
        ...baseHealth,
        error: `OSRM respondeu code=${data.code ?? "indefinido"}.`
      };
    }
    return {
      ...baseHealth,
      reachable: true
    };
  } catch (error) {
    return {
      ...baseHealth,
      error: error instanceof Error ? error.message : "Falha ao consultar OSRM."
    };
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
function chooseNextPartition(partitions, currentLocation) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  partitions.forEach((partition, index2) => {
    const distance = calculateDistance(currentLocation, partition.centroid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index2;
    }
  });
  return bestIndex;
}
async function optimizePartitionedRouteWithRoadMetrics(locations, mode, options = {}) {
  const partitions = partitionStopsForOptimization(locations, {
    ...options,
    maxPartitionSize: options.maxPartitionSize ?? ROAD_MATRIX_PARTITION_SIZE
  });
  if (partitions.length <= 1) return null;
  const remaining = [...partitions];
  const largestPartitionSize = Math.max(
    0,
    ...partitions.map((partition) => partition.stops.length)
  );
  const finalSequence = [];
  const finalWaypoints = [];
  let totalDistance = 0;
  let totalTime = 0;
  let currentLocation = options.startLocation ?? remaining[0].centroid;
  while (remaining.length > 0) {
    const partitionIndex = chooseNextPartition(remaining, currentLocation);
    const [partition] = remaining.splice(partitionIndex, 1);
    const isLastPartition = remaining.length === 0;
    const partitionLocations = partition.stops.map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
      notes: stop.notes
    }));
    const optimizedPartition = await optimizeRouteWithRoadMetrics(
      partitionLocations,
      mode,
      0,
      {
        ...options,
        startLocation: currentLocation,
        endLocation: isLastPartition ? options.endLocation : void 0,
        partitionLargeRoutes: false
      }
    );
    if (!optimizedPartition) return null;
    totalDistance += optimizedPartition.totalDistance;
    totalTime += optimizedPartition.totalTime;
    for (const localIndex of optimizedPartition.sequence) {
      const originalStop = partition.stops[localIndex];
      if (!originalStop) return null;
      finalSequence.push(originalStop.originalIndex);
      finalWaypoints.push({
        latitude: originalStop.latitude,
        longitude: originalStop.longitude,
        address: originalStop.address,
        notes: originalStop.notes,
        sequence: finalWaypoints.length
      });
    }
    const lastWaypoint = finalWaypoints[finalWaypoints.length - 1];
    if (lastWaypoint) currentLocation = lastWaypoint;
  }
  return {
    sequence: finalSequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime: Math.round(totalTime),
    waypoints: finalWaypoints,
    metadata: {
      partitioned: true,
      partitionCount: partitions.length,
      maxPartitionSize: options.maxPartitionSize ?? ROAD_MATRIX_PARTITION_SIZE,
      largestPartitionSize
    }
  };
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
  const partitions = options.partitionLargeRoutes !== false && locations.length > 100 ? partitionStopsForOptimization(locations, {
    ...options,
    maxPartitionSize: options.maxPartitionSize ?? ROAD_MATRIX_PARTITION_SIZE
  }) : [];
  if (options.partitionLargeRoutes !== false && locations.length > 100 && partitions.length > 1) {
    return optimizePartitionedRouteWithRoadMetrics(locations, mode, options);
  }
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
init_geocodingConfidence();
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
  route_crossing: 0,
  high_road_detour: 10,
  duplicate_coordinates: 30,
  generic_address: 5,
  low_geocoding_confidence: 15,
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
function coordinateKey2(stop) {
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
  return "poor";
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
        severity: "high",
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
    } else {
      const confidenceScore = Number(stop.geocodingConfidenceScore);
      if (Number.isFinite(confidenceScore) && confidenceScore > 0 && confidenceScore < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD) {
        issues.push({
          type: "low_geocoding_confidence",
          severity: "high",
          title: "Coordenada com baixa confianca",
          message: `A parada ${stop.sequence + 1} tem confianca ${confidenceScore}/100. Confirme a sugestao ou digite coordenadas manualmente antes de otimizar.`,
          stopSequence: stop.sequence
        });
      }
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
        severity: "high",
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
    const key = coordinateKey2(stop);
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
      severity: "low",
      title: "Cruzamento visual no trajeto",
      message: `O trecho entre as paradas ${crossing.fromSequence + 1} e ${crossing.toSequence + 1} cruza o trecho entre as paradas ${crossing.crossingFromSequence + 1} e ${crossing.crossingToSequence + 1}. Isso e informativo e nao bloqueia a rota quando nao ha revisita, salto ou parada proxima pulada.`,
      fromSequence: crossing.fromSequence,
      toSequence: crossing.toSequence,
      nearestSequence: crossing.crossingFromSequence,
      crossingToSequence: crossing.crossingToSequence
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
init_geocodingConfidence();
init_stopMetadata();

// server/optimizationQueue.ts
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
init_env();
init_db();
var OPTIMIZATION_QUEUE_NAME = "econorota-optimization";
var RETRY_BACKOFF_MS = [6e4, 3e5, 9e5];
var WORKER_HEARTBEATS_KEY = `${OPTIMIZATION_QUEUE_NAME}:worker-heartbeats`;
var WORKER_HEARTBEAT_TTL_MS = 9e4;
var MIN_WORKER_COUNT = 2;
var WORKER_UNDER_REPLICATED_ALERT_INTERVAL_MS = 30 * 6e4;
var REDIS_RECONNECT_ALERT_INTERVAL_MS = 6e4;
var lastUnderReplicatedWorkerAlertAt = 0;
var lastRedisReconnectEventAt = 0;
var queue = null;
var heartbeatRedis = null;
var heartbeatRedisListenersAttached = false;
function getConnectionOptions() {
  if (!ENV.bullmqRedisUrl) return null;
  const parsed = new URL(ENV.bullmqRedisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : void 0,
    password: parsed.password ? decodeURIComponent(parsed.password) : void 0,
    tls: parsed.protocol === "rediss:" ? {} : void 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
}
function getHeartbeatRedis() {
  const connection = getConnectionOptions();
  if (!connection) return null;
  if (!heartbeatRedis) {
    heartbeatRedis = new IORedis(connection);
  }
  if (!heartbeatRedisListenersAttached) {
    heartbeatRedisListenersAttached = true;
    heartbeatRedis.on("reconnecting", () => {
      recordRedisReconnectDetected().catch((error) => {
        console.warn("[OptimizationQueue] Failed to record Redis reconnect:", error);
      });
    });
  }
  return heartbeatRedis;
}
function isOptimizationQueueConfigured() {
  return Boolean(ENV.bullmqRedisUrl);
}
function getOptimizationQueue() {
  const connection = getConnectionOptions();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue(OPTIMIZATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "fixed", delay: RETRY_BACKOFF_MS[0] },
        removeOnComplete: 500,
        removeOnFail: 1e3
      }
    });
  }
  return queue;
}
async function getOptimizationQueueHealth() {
  if (!isOptimizationQueueConfigured()) {
    return {
      configured: false,
      reachable: false,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts: null,
      error: null
    };
  }
  try {
    const optimizationQueue = getOptimizationQueue();
    if (!optimizationQueue) {
      return {
        configured: true,
        reachable: false,
        queueName: OPTIMIZATION_QUEUE_NAME,
        counts: null,
        error: "Fila nao inicializada."
      };
    }
    await optimizationQueue.waitUntilReady();
    const counts = await optimizationQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );
    const workers = await optimizationQueue.getWorkers().catch(() => []);
    const workerHeartbeats = await getRecentWorkerHeartbeats().catch(() => []);
    const workerHeartbeatCount = workerHeartbeats.length;
    const workerCount = Math.max(workers.length, workerHeartbeatCount);
    await recordWorkerUnderReplicatedAlert(workerCount).catch(() => void 0);
    return {
      configured: true,
      reachable: true,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts,
      workerCount,
      workerHeartbeatCount,
      minimumWorkerCount: MIN_WORKER_COUNT,
      alert: workerCount < MIN_WORKER_COUNT ? {
        severity: "warning",
        type: "worker_under_replicated",
        message: `Fila com ${workerCount} worker(s) online. Meta minima: ${MIN_WORKER_COUNT}.`
      } : null,
      error: null
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      queueName: OPTIMIZATION_QUEUE_NAME,
      counts: null,
      error: error instanceof Error ? error.message : "Falha ao consultar fila."
    };
  }
}
function parseWorkerHeartbeat(member, score) {
  const lastHeartbeat = new Date(score).toISOString();
  try {
    const parsed = JSON.parse(member);
    if (typeof parsed.workerId !== "string" || !parsed.workerId) return null;
    return {
      workerId: parsed.workerId,
      hostname: typeof parsed.hostname === "string" ? parsed.hostname : null,
      status: "online",
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
      lastHeartbeat
    };
  } catch {
    if (!member) return null;
    return {
      workerId: member,
      hostname: null,
      status: "online",
      startedAt: null,
      lastHeartbeat
    };
  }
}
async function getRecentWorkerHeartbeats() {
  const redis = getHeartbeatRedis();
  if (!redis) return [];
  const now = Date.now();
  await redis.zremrangebyscore(WORKER_HEARTBEATS_KEY, 0, now - WORKER_HEARTBEAT_TTL_MS);
  const membersWithScores = await redis.zrange(
    WORKER_HEARTBEATS_KEY,
    0,
    -1,
    "WITHSCORES"
  );
  const heartbeats = [];
  for (let index2 = 0; index2 < membersWithScores.length; index2 += 2) {
    const heartbeat = parseWorkerHeartbeat(
      membersWithScores[index2],
      Number(membersWithScores[index2 + 1])
    );
    if (heartbeat) heartbeats.push(heartbeat);
  }
  return heartbeats.sort((a, b) => a.workerId.localeCompare(b.workerId));
}
async function recordWorkerUnderReplicatedAlert(workerCount) {
  if (workerCount >= MIN_WORKER_COUNT) return;
  const now = Date.now();
  if (now - lastUnderReplicatedWorkerAlertAt < WORKER_UNDER_REPLICATED_ALERT_INTERVAL_MS) {
    return;
  }
  lastUnderReplicatedWorkerAlertAt = now;
  await createOperationalEvent({
    userId: null,
    routeId: null,
    stopId: null,
    type: "worker_under_replicated",
    severity: "warning",
    source: "optimization.queue.health",
    title: "Workers abaixo da meta",
    message: `Fila com ${workerCount} worker(s) online. Meta minima: ${MIN_WORKER_COUNT}.`,
    runtime: null,
    url: null,
    userAgent: null,
    appVersion: null,
    metadata: {
      workerCount,
      minimumWorkerCount: MIN_WORKER_COUNT
    }
  });
}
async function recordRedisReconnectDetected() {
  const now = Date.now();
  if (now - lastRedisReconnectEventAt < REDIS_RECONNECT_ALERT_INTERVAL_MS) {
    return;
  }
  lastRedisReconnectEventAt = now;
  await createOperationalEvent({
    userId: null,
    routeId: null,
    stopId: null,
    type: "redis_reconnect_detected",
    severity: "warning",
    source: "optimization.queue.redis",
    title: "Redis reconectando",
    message: "Conexao Redis da fila entrou em ciclo de reconexao.",
    runtime: null,
    url: null,
    userAgent: null,
    appVersion: null,
    metadata: {
      redisReconnectCount: 1,
      queueName: OPTIMIZATION_QUEUE_NAME
    }
  });
}
async function getOptimizationWorkersDashboard() {
  const heartbeats = await getRecentWorkerHeartbeats().catch(() => []);
  const stats = await getOptimizationWorkerJobStats(30).catch(() => []);
  const statsByWorker = new Map(stats.map((item) => [item.workerId, item]));
  const workers = heartbeats.map((worker) => {
    const workerStats = statsByWorker.get(worker.workerId);
    return {
      ...worker,
      jobsProcessed: workerStats?.jobsProcessed ?? 0,
      jobsFailed: workerStats?.jobsFailed ?? 0,
      workerAverageRuntime: workerStats?.workerAverageRuntime ?? 0
    };
  });
  const totalJobsProcessed = workers.reduce(
    (total, worker) => total + worker.jobsProcessed,
    0
  );
  const totalJobsFailed = workers.reduce((total, worker) => total + worker.jobsFailed, 0);
  const runtimeValues = workers.map((worker) => worker.workerAverageRuntime).filter((value) => value > 0);
  return {
    minimumWorkerCount: MIN_WORKER_COUNT,
    workerCount: workers.length,
    status: workers.length >= MIN_WORKER_COUNT ? "healthy" : "warning",
    alert: workers.length < MIN_WORKER_COUNT ? {
      severity: "warning",
      type: "worker_under_replicated",
      message: `Fila com ${workers.length} worker(s) online. Meta minima: ${MIN_WORKER_COUNT}.`
    } : null,
    workerJobsProcessed: totalJobsProcessed,
    workerJobsFailed: totalJobsFailed,
    workerAverageRuntime: runtimeValues.length ? Math.round(
      runtimeValues.reduce((total, value) => total + value, 0) / runtimeValues.length
    ) : 0,
    workers
  };
}
async function enqueueOptimizationJob(payload) {
  const optimizationQueue = getOptimizationQueue();
  if (!optimizationQueue) return null;
  return optimizationQueue.add("optimize-route", payload, {
    jobId: `route-${payload.routeId}-job-${payload.optimizationJobId}`,
    attempts: 3,
    backoff: { type: "fixed", delay: RETRY_BACKOFF_MS[0] }
  });
}

// server/multiVehicleReadiness.ts
init_env();
init_db();
async function safeRead(reader, fallback, timeoutMs = 12e3) {
  try {
    return await Promise.race([
      reader(),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error(`Timeout apos ${timeoutMs}ms.`)), timeoutMs)
      )
    ]);
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function isEnterpriseOsrm(baseUrl) {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && url.hostname === "osrm.econorotas.com";
  } catch {
    return false;
  }
}
function benchmarkItem(performanceBenchmarks2, stopCount) {
  const target = performanceBenchmarks2?.targets?.find(
    (item) => Number(item.stopCount) === stopCount
  );
  const blockers = [];
  if (!target) {
    blockers.push(`Sem benchmark persistido para ${stopCount} paradas.`);
  } else {
    if (target.status !== "ready") {
      blockers.push(
        `Benchmark ${stopCount} paradas nao atingiu a meta comprovada.`
      );
    }
    if (Number(target.latestRuntimeMs || 0) <= 0) {
      blockers.push(`Benchmark ${stopCount} paradas sem runtime valido.`);
    }
  }
  return {
    status: blockers.length ? "NO-GO" : "READY",
    evidence: {
      stopCount,
      targetMs: target?.targetMs ?? null,
      latestRuntimeMs: target?.latestRuntimeMs ?? null,
      latestQueueWaitMs: target?.latestQueueWaitMs ?? null,
      latestPeakMemoryMb: target?.latestPeakMemoryMb ?? null,
      latestOsrmLatencyMs: target?.latestOsrmLatencyMs ?? null,
      latestMicroClusterCount: target?.latestMicroClusterCount ?? null,
      latestCriteriaMet: target?.latestCriteriaMet ?? false,
      latestAt: target?.latestAt ?? null,
      runs: target?.runs ?? 0,
      status: target?.status ?? "missing"
    },
    blockers
  };
}
function readinessStatus(items) {
  if (items.some((item) => item.status === "NO-GO")) return "NO-GO";
  if (items.some((item) => item.status === "PARTIAL")) return "PARTIAL";
  return "READY";
}
async function getMultiVehicleReadinessDashboard() {
  const [osrm, queue2, workers, queueIntegrity, disasterRecovery, performanceBenchmarks2] = await Promise.all([
    safeRead(() => getOsrmHealth(), {
      enabled: ENV.osrmEnabled,
      required: ENV.osrmRequired,
      configured: Boolean(ENV.osrmBaseUrl),
      reachable: false,
      baseUrl: ENV.osrmBaseUrl || null,
      timeoutMs: ENV.osrmHealthTimeoutMs,
      error: "Falha ao consultar OSRM."
    }),
    safeRead(() => getOptimizationQueueHealth(), {
      configured: false,
      reachable: false,
      queueName: "econorota-optimization",
      counts: null,
      error: "Falha ao consultar fila."
    }),
    safeRead(() => getOptimizationWorkersDashboard(), {
      minimumWorkerCount: 2,
      workerCount: 0,
      status: "warning",
      alert: null,
      workerJobsProcessed: 0,
      workerJobsFailed: 0,
      workerAverageRuntime: 0,
      workers: []
    }),
    safeRead(() => getQueueIntegrityDashboard(), {
      status: "attention",
      duplicateJobs: 0,
      failedRecoveries: 0,
      stalledJobs: 0
    }),
    safeRead(() => getDisasterReadinessDashboard(), {
      status: "critical",
      lastBackupAt: null,
      backupAgeHours: null,
      backupStatus: "unknown",
      restoreTestAt: null,
      restoreTestPassed: false,
      rpoTargetHours: 24,
      rtoTargetHours: 4,
      alerts: []
    }),
    safeRead(() => getPerformanceBenchmarkDashboard(), {
      status: "unavailable",
      targets: [],
      totalRuns: 0
    })
  ]);
  const osrmBlockers = [];
  const enterprise = isEnterpriseOsrm(osrm.baseUrl);
  if (!osrm.enabled) osrmBlockers.push("OSRM desativado.");
  if (!osrm.configured) osrmBlockers.push("OSRM_BASE_URL nao configurado.");
  if (!osrm.reachable) osrmBlockers.push("OSRM nao respondeu ao health.");
  if (!enterprise) {
    osrmBlockers.push("OSRM_BASE_URL ainda nao aponta para https://osrm.econorotas.com.");
  }
  if (!osrm.required) {
    osrmBlockers.push("OSRM_REQUIRED ainda nao esta ativo.");
  }
  const osrmEnterprise = {
    status: osrmBlockers.length === 0 ? "READY" : osrm.reachable && osrm.enabled ? "PARTIAL" : "NO-GO",
    evidence: {
      enabled: osrm.enabled,
      required: osrm.required,
      configured: osrm.configured,
      reachable: osrm.reachable,
      baseUrl: osrm.baseUrl,
      timeoutMs: osrm.timeoutMs,
      requiredMinStops: ENV.osrmRequiredMinStops,
      enterprise,
      error: osrm.error
    },
    blockers: osrmBlockers
  };
  const workerBlockers = [];
  if (!queue2.configured) workerBlockers.push("Redis/BullMQ nao configurado.");
  if (!queue2.reachable) workerBlockers.push("Fila BullMQ nao esta acessivel.");
  if (Number(workers.workerCount || 0) < Number(workers.minimumWorkerCount || 2)) {
    workerBlockers.push(
      `Apenas ${workers.workerCount || 0} worker(s) online; minimo exigido: ${workers.minimumWorkerCount || 2}.`
    );
  }
  if (queueIntegrity.status !== "healthy") {
    workerBlockers.push("Integridade da fila nao esta saudavel.");
  }
  const workerRedundancy = {
    status: workerBlockers.length === 0 ? "READY" : queue2.reachable ? "PARTIAL" : "NO-GO",
    evidence: {
      queueConfigured: queue2.configured,
      queueReachable: queue2.reachable,
      workerCount: workers.workerCount,
      minimumWorkerCount: workers.minimumWorkerCount,
      workerHeartbeatCount: queue2.workerHeartbeatCount ?? null,
      queueIntegrityStatus: queueIntegrity.status,
      duplicateJobs: queueIntegrity.duplicateJobs,
      failedRecoveries: queueIntegrity.failedRecoveries,
      stalledJobs: queueIntegrity.stalledJobs,
      workers: workers.workers
    },
    blockers: workerBlockers
  };
  const disasterBlockers = [];
  if (disasterRecovery.status !== "healthy") {
    disasterBlockers.push("Disaster Recovery nao esta healthy.");
  }
  if (!disasterRecovery.lastBackupAt) {
    disasterBlockers.push("Sem evidencia de backup real.");
  }
  if (!disasterRecovery.restoreTestPassed) {
    disasterBlockers.push("Sem evidencia de restore real aprovado.");
  }
  const disasterRecoveryItem = {
    status: disasterBlockers.length === 0 ? "READY" : "NO-GO",
    evidence: {
      status: disasterRecovery.status,
      lastBackupAt: disasterRecovery.lastBackupAt,
      backupAgeHours: disasterRecovery.backupAgeHours,
      backupStatus: disasterRecovery.backupStatus,
      restoreTestAt: disasterRecovery.restoreTestAt,
      restoreTestPassed: disasterRecovery.restoreTestPassed,
      rpoTargetHours: disasterRecovery.rpoTargetHours,
      rtoTargetHours: disasterRecovery.rtoTargetHours,
      alertCount: disasterRecovery.alerts?.length ?? 0
    },
    blockers: disasterBlockers
  };
  const benchmark250 = benchmarkItem(performanceBenchmarks2, 250);
  const benchmark500 = benchmarkItem(performanceBenchmarks2, 500);
  const benchmark1000 = benchmarkItem(performanceBenchmarks2, 1e3);
  const benchmark2000 = benchmarkItem(performanceBenchmarks2, 2e3);
  const items = {
    osrmEnterprise,
    workerRedundancy,
    disasterRecovery: disasterRecoveryItem,
    benchmark250,
    benchmark500,
    benchmark1000,
    benchmark2000
  };
  const itemList = Object.values(items);
  const multiVehicle = {
    status: readinessStatus(itemList),
    evidence: {
      requiredReadyItems: Object.keys(items),
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    blockers: itemList.flatMap((item) => item.blockers)
  };
  return {
    status: multiVehicle.status,
    items,
    multiVehicle,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/routers.ts
var IMILE_PROVIDER = "imile_rider_delivery";
var BLOCKING_AUDIT_ISSUE_TYPES = /* @__PURE__ */ new Set([
  "missing_coordinates",
  "invalid_coordinates"
]);
var MAX_NEARBY_FIXES = 100;
var MAX_REVISIT_FIXES = 50;
var MAX_PREMATURE_EXIT_FIXES = 50;
var MAX_BATCH_AUDIT_REPAIR_PASSES = 3;
var OSRM_CIRCUIT_MIN_CALLS = 20;
var OSRM_CIRCUIT_FAILURE_RATE = 0.8;
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
function routeToAuditableStops(route) {
  return route.waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
    sequence: waypoint.sequence,
    geocodingConfidenceScore: waypoint.geocodingConfidenceScore,
    geocodingMethod: waypoint.geocodingMethod,
    geocodingSuspect: waypoint.geocodingSuspect
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
    sequence: Number(stop.sequence),
    geocodingConfidenceScore: Number(stop.geocodingConfidenceScore ?? 0),
    geocodingMethod: stop.geocodingMethod ?? void 0,
    geocodingSuspect: Boolean(stop.geocodingSuspect)
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
  return null;
}
function isSequenceCoherenceIssue(issue) {
  return issue.type === "nearby_stop_skipped" || issue.type === "region_revisited" || issue.type === "premature_region_exit" || issue.type === "route_crossing";
}
function countAuditIssues(audit, type) {
  return audit.issues.filter((issue) => issue.type === type).length;
}
function countCorrectedIssues(correctionAttempts) {
  return correctionAttempts.reduce((total, attempt) => {
    const batchApplied = attempt.batch ? attempt.batch.appliedIssueCounts.nearby + attempt.batch.appliedIssueCounts.revisit + attempt.batch.appliedIssueCounts.prematureExit : 0;
    return total + Math.max(1, batchApplied);
  }, 0);
}
function countBatchCorrectionAttempts(correctionAttempts) {
  return correctionAttempts.filter((attempt) => attempt.batch).length;
}
function countRemainingCoherenceIssues(audit) {
  return audit.issues.filter((issue) => {
    if (issue.type === "nearby_stop_skipped") {
      return issue.severity === "critical" || issue.severity === "high";
    }
    return issue.type === "region_revisited" || issue.type === "premature_region_exit";
  }).length;
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
function routeWaypointsToLocations(waypoints) {
  return waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    address: waypoint.address,
    notes: waypoint.notes,
    sourceProvider: waypoint.sourceProvider,
    originalStop: waypoint.originalStop,
    isUnsequencedStop: waypoint.isUnsequencedStop,
    metadata: waypoint.metadata,
    geocodingConfidenceScore: waypoint.geocodingConfidenceScore,
    geocodingMethod: waypoint.geocodingMethod,
    geocodingSuspect: waypoint.geocodingSuspect
  }));
}
function correctionLimitForIssueType(type) {
  switch (type) {
    case "nearby_stop_skipped":
      return MAX_NEARBY_FIXES;
    case "region_revisited":
      return MAX_REVISIT_FIXES;
    case "premature_region_exit":
      return MAX_PREMATURE_EXIT_FIXES;
    default:
      return 0;
  }
}
function isCoherenceFixIssueType(type) {
  return type === "nearby_stop_skipped" || type === "region_revisited" || type === "premature_region_exit";
}
function countSequenceCoherenceIssuesByType(audit) {
  return audit.issues.reduce(
    (counts, issue) => {
      if (issue.type === "nearby_stop_skipped") counts.nearby += 1;
      if (issue.type === "region_revisited") counts.revisit += 1;
      if (issue.type === "premature_region_exit") counts.prematureExit += 1;
      return counts;
    },
    { nearby: 0, revisit: 0, prematureExit: 0 }
  );
}
function isLimitCappedCoherenceIssue(issue) {
  return isCoherenceFixIssueType(issue.type);
}
function shouldProceedAfterCorrectionLimits(audit, reason, limitsReached, options = {}) {
  if (!reason || !isLimitCappedCoherenceIssue(reason.issue)) return false;
  if (!limitsReached.has(reason.issue.type) && !options.allowLargeRouteAttention) {
    return false;
  }
  const remainingBlockingIssues = audit.issues.filter((issue) => {
    if (issue.type === "nearby_stop_skipped") {
      return issue.severity === "critical" || issue.severity === "high";
    }
    return issue.type === "region_revisited" || issue.type === "premature_region_exit";
  });
  return remainingBlockingIssues.every(
    (issue) => limitsReached.has(issue.type) || options.allowLargeRouteAttention && isCoherenceFixIssueType(issue.type)
  );
}
function moveWaypointsBeforeSequence(waypoints, movedSequences, beforeSequence) {
  const movedSet = new Set(movedSequences);
  if (movedSet.size === 0 || movedSet.has(beforeSequence)) return false;
  const insertionReferenceIndex = waypoints.findIndex(
    (waypoint) => waypoint.sequence === beforeSequence
  );
  if (insertionReferenceIndex < 0) return false;
  const movedWaypoints = waypoints.filter((waypoint) => movedSet.has(waypoint.sequence));
  if (movedWaypoints.length === 0) return false;
  const remainingWaypoints = waypoints.filter(
    (waypoint) => !movedSet.has(waypoint.sequence)
  );
  const insertionIndex = remainingWaypoints.findIndex(
    (waypoint) => waypoint.sequence === beforeSequence
  );
  if (insertionIndex < 0) return false;
  if (movedWaypoints.every((waypoint) => {
    const currentIndex = waypoints.findIndex(
      (candidate) => candidate.sequence === waypoint.sequence
    );
    return currentIndex >= 0 && currentIndex < insertionReferenceIndex;
  })) {
    return false;
  }
  remainingWaypoints.splice(insertionIndex, 0, ...movedWaypoints);
  waypoints.splice(0, waypoints.length, ...remainingWaypoints);
  return true;
}
function buildBatchAuditRepairPlan(audit) {
  const selectedIssues = [];
  const counts = {
    nearby_stop_skipped: 0,
    region_revisited: 0,
    premature_region_exit: 0
  };
  const cappedTypes = /* @__PURE__ */ new Set();
  for (const issue of audit.issues) {
    if (!isCoherenceFixIssueType(issue.type)) continue;
    const limit = correctionLimitForIssueType(issue.type);
    const currentCount = counts[issue.type] ?? 0;
    if (currentCount >= limit) {
      cappedTypes.add(issue.type);
      continue;
    }
    counts[issue.type] = currentCount + 1;
    selectedIssues.push(issue);
  }
  return {
    selectedIssues,
    cappedTypes,
    availableIssueCounts: countSequenceCoherenceIssuesByType(audit),
    appliedIssueCounts: {
      nearby: counts.nearby_stop_skipped,
      revisit: counts.region_revisited,
      prematureExit: counts.premature_region_exit
    }
  };
}
function applyAuditPlan(route, audit) {
  const waypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));
  const plan = buildBatchAuditRepairPlan(audit);
  let changed = false;
  const prematureExitIssues = plan.selectedIssues.filter(
    (issue) => issue.type === "premature_region_exit" && issue.pendingSequences?.length
  );
  for (const issue of prematureExitIssues) {
    if (issue.toSequence === void 0 || !issue.pendingSequences?.length) continue;
    changed = moveWaypointsBeforeSequence(waypoints, issue.pendingSequences, issue.toSequence) || changed;
  }
  const nearbyOrRevisitIssues = plan.selectedIssues.filter(
    (issue) => (issue.type === "nearby_stop_skipped" || issue.type === "region_revisited") && issue.nearestSequence !== void 0 && issue.toSequence !== void 0
  );
  const movedNearestSequences = /* @__PURE__ */ new Set();
  for (const issue of nearbyOrRevisitIssues) {
    if (issue.nearestSequence === void 0 || issue.toSequence === void 0) continue;
    if (movedNearestSequences.has(issue.nearestSequence)) continue;
    changed = moveWaypointsBeforeSequence(waypoints, [issue.nearestSequence], issue.toSequence) || changed;
    movedNearestSequences.add(issue.nearestSequence);
  }
  return {
    repairedLocations: changed ? routeWaypointsToLocations(waypoints) : null,
    plan: {
      ...plan,
      nearbyFixes: plan.selectedIssues.filter(
        (issue) => issue.type === "nearby_stop_skipped"
      ),
      revisitFixes: plan.selectedIssues.filter(
        (issue) => issue.type === "region_revisited"
      ),
      prematureExitFixes: plan.selectedIssues.filter(
        (issue) => issue.type === "premature_region_exit"
      ),
      crossingAlerts: audit.issues.filter((issue) => issue.type === "route_crossing")
    }
  };
}
function removeRouteCrossings(route) {
  const waypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));
  let changed = false;
  const maxPasses = Math.max(20, Math.min(2e3, waypoints.length * 8));
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const [crossing] = detectRouteCrossings(waypoints);
    if (!crossing) {
      return changed ? routeWaypointsToLocations(waypoints) : null;
    }
    const firstSegmentEndIndex = waypoints.findIndex(
      (waypoint) => waypoint.sequence === crossing.toSequence
    );
    const secondSegmentStartIndex = waypoints.findIndex(
      (waypoint) => waypoint.sequence === crossing.crossingFromSequence
    );
    if (firstSegmentEndIndex < 0 || secondSegmentStartIndex < 0 || secondSegmentStartIndex <= firstSegmentEndIndex) {
      break;
    }
    const reversedMiddle = waypoints.slice(firstSegmentEndIndex, secondSegmentStartIndex + 1).reverse();
    waypoints.splice(
      firstSegmentEndIndex,
      secondSegmentStartIndex - firstSegmentEndIndex + 1,
      ...reversedMiddle
    );
    changed = true;
  }
  return changed ? routeWaypointsToLocations(waypoints) : null;
}
function reorderRouteByAuditIssue(route, issue) {
  if (!isSequenceCoherenceIssue(issue) || issue.nearestSequence === void 0 || issue.toSequence === void 0) {
    return null;
  }
  const waypoints = route.waypoints.map((waypoint) => ({ ...waypoint }));
  if (issue.type === "route_crossing") {
    return removeRouteCrossings(route);
  }
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
async function assertRouteStopsReadyForOptimization(routeStops, context) {
  const audit = auditRouteSequence(routeStopsToAuditableStops(routeStops));
  const blockingIssues = getBlockingAuditIssues(audit);
  if (blockingIssues.length === 0) return;
  const firstIssue = blockingIssues[0];
  for (const issue of audit.issues) {
    if (issue.type !== "low_geocoding_confidence") continue;
    const issueMetadata = issue;
    await createOperationalEvent({
      userId: context.userId,
      routeId: context.routeId,
      stopId: Number(issueMetadata.stopId) || null,
      type: "geocoding_low_confidence",
      severity: "warning",
      source: "routes.optimize",
      title: "Endereco com baixa confianca",
      message: issue.message,
      metadata: {
        issueType: issue.type,
        confidenceScore: issueMetadata.confidenceScore ?? null,
        sequence: issue.stopSequence ?? null
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record low confidence event:", error);
    });
  }
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
  const runtimeBreakdown = {
    dbFetchMs: 0,
    clusteringMs: 0,
    osrmMs: 0,
    optimizerMs: 0,
    auditMs: 0,
    correctionMs: 0,
    dbSaveMs: 0,
    totalRuntimeMs: 0,
    osrmCallCount: 0,
    osrmFailureCount: 0,
    osrmTotalMs: 0,
    osrmAverageMs: 0,
    osrmProvider: null,
    osrmAvailability: "unknown",
    osrmLatencyMs: 0,
    osrmMatrixCount: 0,
    osrmMatrixSize: 0,
    osrmFailureReason: null,
    matrixCacheHit: 0,
    matrixCacheMiss: 0,
    matrixGenerationMs: 0,
    macroClusterCount: 0,
    microClusterCount: 0,
    largestClusterSize: 0
  };
  const telemetry = {
    recordOsrmCall(durationMs, success) {
      const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
      runtimeBreakdown.osrmCallCount += 1;
      runtimeBreakdown.osrmTotalMs += safeDuration;
      runtimeBreakdown.osrmMs += safeDuration;
      if (!success) runtimeBreakdown.osrmFailureCount += 1;
      runtimeBreakdown.osrmAverageMs = Math.round(
        runtimeBreakdown.osrmTotalMs / Math.max(1, runtimeBreakdown.osrmCallCount)
      );
      runtimeBreakdown.osrmLatencyMs = runtimeBreakdown.osrmAverageMs;
      runtimeBreakdown.osrmAvailability = runtimeBreakdown.osrmFailureCount === 0 ? "available" : runtimeBreakdown.osrmFailureCount >= runtimeBreakdown.osrmCallCount ? "unavailable" : "degraded";
    },
    recordOsrmMatrix(args) {
      const safeDuration = Number.isFinite(args.durationMs) ? Math.max(0, args.durationMs) : 0;
      runtimeBreakdown.osrmProvider = args.provider ?? runtimeBreakdown.osrmProvider;
      runtimeBreakdown.osrmMatrixCount += 1;
      runtimeBreakdown.osrmMatrixSize += Math.max(0, args.nodeCount) ** 2;
      runtimeBreakdown.matrixGenerationMs += safeDuration;
      if (args.cacheHit) {
        runtimeBreakdown.matrixCacheHit += 1;
      } else {
        runtimeBreakdown.matrixCacheMiss += 1;
      }
      if (!args.success && args.failureReason) {
        runtimeBreakdown.osrmFailureReason = args.failureReason;
      }
    }
  };
  let osrmCircuitEventRecorded = false;
  const dbFetchStartedAt = Date.now();
  const route = await requireUserRoute(routeId, userId);
  const excludedStopIds = new Set(options?.excludeStopIds ?? []);
  const routeStops = (await getRouteStops(routeId)).filter(
    (stop) => !excludedStopIds.has(Number(stop.id))
  );
  runtimeBreakdown.dbFetchMs = Date.now() - dbFetchStartedAt;
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
  if (!options?.allowLargeSync && routeStops.length > ENV.maxSyncStops) {
    const job = await createOptimizationJob({
      routeId,
      userId,
      status: "queued",
      metadata: {
        stopCount: routeStops.length,
        maxSyncStops: ENV.maxSyncStops,
        routeMode: requestedMode || route.mode,
        localityMode: options?.localityMode ?? null,
        respectInputSequence: Boolean(options?.respectInputSequence),
        excludeStopIds: options?.excludeStopIds ?? [],
        requiresExternalWorker: true
      }
    });
    let queueProviderJobId = null;
    let queueError = null;
    if (job?.id && isOptimizationQueueConfigured()) {
      try {
        const providerJob = await enqueueOptimizationJob({
          optimizationJobId: Number(job.id),
          routeId,
          userId,
          mode: requestedMode || route.mode,
          localityMode: options?.localityMode,
          respectInputSequence: Boolean(options?.respectInputSequence),
          excludeStopIds: options?.excludeStopIds ?? []
        });
        queueProviderJobId = providerJob?.id ? String(providerJob.id) : null;
        if (queueProviderJobId && job?.id) {
          await updateOptimizationJob(Number(job.id), {
            providerJobId: queueProviderJobId,
            maxAttempts: 3
          }).catch(() => void 0);
        }
      } catch (error) {
        queueError = error instanceof Error ? error.message : "Falha ao publicar na fila.";
        if (job?.id) {
          await updateOptimizationJob(Number(job.id), {
            status: "failed",
            finishedAt: /* @__PURE__ */ new Date(),
            errorMessage: queueError
          }).catch(() => void 0);
        }
      }
    }
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "optimization_job_created",
      severity: isOptimizationQueueConfigured() && !queueError ? "info" : "warning",
      source: "optimization.queue",
      title: "Job de otimizacao criado",
      message: isOptimizationQueueConfigured() && !queueError ? "Rota grande criada na fila de otimizacao." : "Rota grande registrada, mas a fila ainda nao esta operacional.",
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        optimizationJobId: job?.id ?? null,
        providerJobId: queueProviderJobId,
        queueConfigured: isOptimizationQueueConfigured(),
        queueError,
        stopCount: routeStops.length,
        maxSyncStops: ENV.maxSyncStops
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record optimization job event:", error);
    });
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_requires_queue",
      severity: "warning",
      source: "routes.optimize",
      title: "Rota grande exige fila",
      message: `A rota tem ${routeStops.length} paradas e excede o limite sincrono de ${ENV.maxSyncStops}.`,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        jobId: job?.id ?? null,
        queueProviderJobId,
        queueConfigured: isOptimizationQueueConfigured(),
        queueError,
        stopCount: routeStops.length,
        maxSyncStops: ENV.maxSyncStops
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record queue requirement event:", error);
    });
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: isOptimizationQueueConfigured() ? "Rota grande enviada para fila de otimizacao." : "Rota grande exige fila de otimizacao. Configure Redis/BullMQ e worker para processar rotas acima do limite sincrono."
    });
  }
  await assertRouteStopsReadyForOptimization(routeStops, { userId, routeId });
  const locations = routeStops.map((stop) => ({
    latitude: parseFloat(String(stop.latitude ?? 0)),
    longitude: parseFloat(String(stop.longitude ?? 0)),
    address: stop.address,
    notes: stop.notes ?? void 0,
    sourceProvider: normalizeStopSourceProvider(stop.sourceProvider),
    originalStop: stop.originalStop ?? null,
    isUnsequencedStop: Boolean(stop.isUnsequencedStop),
    metadata: normalizeStopMetadata(stop.metadata),
    geocodingConfidenceScore: Number(stop.geocodingConfidenceScore ?? 0),
    geocodingMethod: stop.geocodingMethod ?? void 0,
    geocodingSuspect: Boolean(stop.geocodingSuspect)
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
  const macroClusters = clusterStops(locations, {
    localityMode: options?.localityMode
  });
  const microClusters = partitionStopsForOptimization(locations, {
    localityMode: options?.localityMode
  });
  runtimeBreakdown.macroClusterCount = macroClusters.length;
  runtimeBreakdown.microClusterCount = locations.length <= 100 ? macroClusters.length : microClusters.length;
  runtimeBreakdown.largestClusterSize = Math.max(
    0,
    ...macroClusters.map((cluster) => cluster.stops.length)
  );
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
  const clusteringStartedAt = Date.now();
  clusterStops(locations, { localityMode: options?.localityMode });
  runtimeBreakdown.clusteringMs = Date.now() - clusteringStartedAt;
  async function buildOptimizationAttempt(attempt) {
    const attemptLocations = attempt.orderedLocations ?? locations;
    const roadMetricOptions = {
      startLocation,
      endLocation,
      localityMode: attempt.localityMode,
      telemetry
    };
    let optimizedWithRoadMetrics = null;
    let auditSource2 = "geo-default";
    const optimizerStartedAt = Date.now();
    const osrmCircuitOpen = runtimeBreakdown.osrmCallCount >= OSRM_CIRCUIT_MIN_CALLS && runtimeBreakdown.osrmFailureCount / Math.max(1, runtimeBreakdown.osrmCallCount) >= OSRM_CIRCUIT_FAILURE_RATE;
    if (osrmCircuitOpen) {
      auditSource2 = "geo-osrm-circuit-open";
      if (!osrmCircuitEventRecorded) {
        osrmCircuitEventRecorded = true;
        await createOperationalEvent({
          userId,
          routeId,
          stopId: null,
          type: "route_osrm_circuit_opened",
          severity: "warning",
          source: options?.allowLargeSync ? "optimization.worker" : "routes.optimize",
          title: "OSRM pausado por falha alta",
          message: "O otimizador interrompeu novas chamadas OSRM nesta rota depois de detectar muitas falhas do provedor.",
          runtime: null,
          url: null,
          userAgent: null,
          appVersion: null,
          metadata: {
            stopCount: attemptLocations.length,
            osrmCallCount: runtimeBreakdown.osrmCallCount,
            osrmFailureCount: runtimeBreakdown.osrmFailureCount,
            failureRate: runtimeBreakdown.osrmFailureCount / Math.max(1, runtimeBreakdown.osrmCallCount),
            minCalls: OSRM_CIRCUIT_MIN_CALLS,
            threshold: OSRM_CIRCUIT_FAILURE_RATE,
            osrmBaseUrl: ENV.osrmBaseUrl
          }
        }).catch((error) => {
          console.warn("[Routes] Failed to record OSRM circuit event:", error);
        });
      }
    } else {
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
    }
    const shouldUseLargePartitionedFallback = !optimizedWithRoadMetrics && attemptLocations.length > ENV.maxGeographicFallbackStops && Boolean(options?.allowLargeSync);
    if (!optimizedWithRoadMetrics && attemptLocations.length > ENV.maxGeographicFallbackStops && !shouldUseLargePartitionedFallback) {
      await createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "geographic_fallback_blocked",
        severity: "error",
        source: "routes.optimize",
        title: "Fallback geografico bloqueado",
        message: `OSRM indisponivel para ${attemptLocations.length} paradas. Fallback geografico acima de ${ENV.maxGeographicFallbackStops} paradas foi bloqueado.`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl,
          auditSource: auditSource2
        }
      }).catch((error) => {
        console.warn("[Routes] Failed to record blocked geographic fallback:", error);
      });
      await createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "osrm_required_for_large_route",
        severity: "error",
        source: "routes.optimize",
        title: "OSRM necessario para rota grande",
        message: "Rotas grandes precisam de matriz por rua para evitar roteirizacao geografica lenta ou incoerente.",
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl
        }
      }).catch((error) => {
        console.warn("[Routes] Failed to record OSRM required event:", error);
      });
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: "OSRM indisponivel para rota grande. Fallback geografico bloqueado para evitar timeout e sequencia incoerente."
      });
    }
    if (shouldUseLargePartitionedFallback) {
      await createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "geographic_fallback_worker_global",
        severity: "warning",
        source: "optimization.worker",
        title: "Fallback geografico global no worker",
        message: `OSRM indisponivel para ${attemptLocations.length} paradas. Worker aplicou fallback global fora da requisicao HTTP.`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          stopCount: attemptLocations.length,
          maxGeographicFallbackStops: ENV.maxGeographicFallbackStops,
          osrmBaseUrl: ENV.osrmBaseUrl,
          auditSource: auditSource2,
          allowLargeSync: true
        }
      }).catch((error) => {
        console.warn("[Routes] Failed to record partitioned geographic fallback:", error);
      });
    }
    const optimized2 = optimizedWithRoadMetrics ?? (attempt.respectInputSequence ? buildSequentialRoute(attemptLocations, roadMetricOptions) : attempt.orderedLocations ? buildSequentialRoute(attemptLocations, roadMetricOptions) : optimizeRoute(attemptLocations, mode, 0, {
      ...roadMetricOptions,
      partitionLargeRoutes: shouldUseLargePartitionedFallback ? false : void 0
    }));
    runtimeBreakdown.optimizerMs += Date.now() - optimizerStartedAt;
    const auditStartedAt = Date.now();
    const audit2 = auditOptimizedRoute(optimized2, {
      startLocation,
      usedRoadMetrics: Boolean(optimizedWithRoadMetrics),
      respectInputSequence: Boolean(attempt.respectInputSequence)
    });
    runtimeBreakdown.auditMs += Date.now() - auditStartedAt;
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
  const correctionLimitsReached = /* @__PURE__ */ new Set();
  if (postOptimizationBlockingReason && isSequenceCoherenceIssue(postOptimizationBlockingReason.issue)) {
    const correctionStartedAt = Date.now();
    const seenSignatures = /* @__PURE__ */ new Set([routeWaypointSignature(optimizationAttempt.optimized)]);
    const maxRepairAttempts = MAX_BATCH_AUDIT_REPAIR_PASSES;
    for (let repairAttempt = 0; postOptimizationBlockingReason && isSequenceCoherenceIssue(postOptimizationBlockingReason.issue) && repairAttempt < maxRepairAttempts; repairAttempt += 1) {
      const batchRepair = applyAuditPlan(
        optimizationAttempt.optimized,
        optimizationAttempt.audit
      );
      await createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "audit_plan_generated",
        severity: "info",
        source: "routes.audit",
        title: "Plano global do fiscal gerado",
        message: `Plano com ${batchRepair.plan.selectedIssues.length} incoerencia(s) selecionada(s).`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          repairAttempt: repairAttempt + 1,
          availableIssueCounts: batchRepair.plan.availableIssueCounts,
          appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
          cappedTypes: Array.from(batchRepair.plan.cappedTypes),
          crossingAlerts: batchRepair.plan.crossingAlerts.length
        }
      }).catch((error) => {
        console.warn("[Routes] Failed to record audit plan event:", error);
      });
      for (const cappedType of Array.from(batchRepair.plan.cappedTypes)) {
        correctionLimitsReached.add(cappedType);
      }
      const repairedLocations = batchRepair.repairedLocations ?? reorderRouteByAuditIssue(
        optimizationAttempt.optimized,
        postOptimizationBlockingReason.issue
      );
      if (!repairedLocations) {
        await createOperationalEvent({
          userId,
          routeId,
          stopId: null,
          type: "audit_batch_failed",
          severity: "warning",
          source: "routes.audit",
          title: "Corre\xE7\xE3o em lote sem altera\xE7\xE3o",
          message: "O fiscal gerou plano global, mas n\xE3o encontrou altera\xE7\xE3o aplic\xE1vel na sequ\xEAncia.",
          runtime: null,
          url: null,
          userAgent: null,
          appVersion: null,
          metadata: {
            repairAttempt: repairAttempt + 1,
            blockingIssue: postOptimizationBlockingReason.issue,
            availableIssueCounts: batchRepair.plan.availableIssueCounts,
            appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
            cappedTypes: Array.from(batchRepair.plan.cappedTypes)
          }
        }).catch((error) => {
          console.warn("[Routes] Failed to record audit batch failure:", error);
        });
        break;
      }
      const repairedAttempt = await buildOptimizationAttempt({
        localityMode: "strict",
        respectInputSequence: false,
        auditSourceSuffix: `audit-global-plan-${repairAttempt + 1}`,
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
        issueCount: repairedAttempt.audit.issueCount,
        batch: {
          availableIssueCounts: batchRepair.plan.availableIssueCounts,
          appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
          cappedTypes: Array.from(batchRepair.plan.cappedTypes)
        }
      });
      await createOperationalEvent({
        userId,
        routeId,
        stopId: null,
        type: "audit_batch_applied",
        severity: "info",
        source: "routes.audit",
        title: "Corre\xE7\xE3o em lote aplicada",
        message: `Fiscal aplicou lote ${repairAttempt + 1} e reauditoria encontrou ${repairedAttempt.audit.issueCount} alerta(s).`,
        runtime: null,
        url: null,
        userAgent: null,
        appVersion: null,
        metadata: {
          repairAttempt: repairAttempt + 1,
          auditSource: repairedAttempt.auditSource,
          finalStatus: repairedAttempt.audit.status,
          finalScore: repairedAttempt.audit.score,
          finalIssueCount: repairedAttempt.audit.issueCount,
          remainingCoherenceIssues: countRemainingCoherenceIssues(repairedAttempt.audit),
          batch: {
            availableIssueCounts: batchRepair.plan.availableIssueCounts,
            appliedIssueCounts: batchRepair.plan.appliedIssueCounts,
            cappedTypes: Array.from(batchRepair.plan.cappedTypes)
          }
        }
      }).catch((error) => {
        console.warn("[Routes] Failed to record audit batch event:", error);
      });
      optimizationAttempt = repairedAttempt;
      postOptimizationBlockingReason = getPostOptimizationBlockingReason(
        optimizationAttempt.audit
      );
    }
    if (shouldProceedAfterCorrectionLimits(
      optimizationAttempt.audit,
      postOptimizationBlockingReason,
      correctionLimitsReached,
      {
        allowLargeRouteAttention: true
      }
    )) {
      postOptimizationBlockingReason = null;
    }
    runtimeBreakdown.correctionMs += Date.now() - correctionStartedAt;
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
        auditSource: optimizationAttempt.auditSource,
        routeMetadata: optimizationAttempt.optimized.metadata ?? null
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record route audit correction event:", error);
    });
  }
  if (correctionAttempts.length > 0 && !postOptimizationBlockingReason && countRemainingCoherenceIssues(optimizationAttempt.audit) > 0) {
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "audit_final_attention",
      severity: "warning",
      source: "routes.audit",
      title: "Fiscal finalizou com aten\xE7\xE3o",
      message: "A rota ficou execut\xE1vel, mas ainda possui alertas operacionais ap\xF3s corre\xE7\xE3o em lote.",
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        auditStatus: optimizationAttempt.audit.status,
        auditScore: optimizationAttempt.audit.score,
        finalIssueCount: optimizationAttempt.audit.issueCount,
        remainingCoherenceIssues: countRemainingCoherenceIssues(optimizationAttempt.audit),
        correctionAttempts
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record final attention event:", error);
    });
  }
  async function recordRouteMetricForAttempt(blockedReason) {
    const attemptAudit = optimizationAttempt.audit;
    const geocodingConfidence = summarizeGeocodingConfidence(routeStops);
    await createRouteMetric({
      userId,
      routeId,
      qualityScore: attemptAudit.score,
      optimizationRuntimeMs: Date.now() - optimizationStartedAt,
      dbFetchMs: runtimeBreakdown.dbFetchMs,
      clusteringMs: runtimeBreakdown.clusteringMs,
      osrmMs: runtimeBreakdown.osrmMs,
      optimizerMs: runtimeBreakdown.optimizerMs,
      auditMs: runtimeBreakdown.auditMs,
      correctionMs: runtimeBreakdown.correctionMs,
      dbSaveMs: runtimeBreakdown.dbSaveMs,
      totalRuntimeMs: Date.now() - optimizationStartedAt,
      osrmCallCount: runtimeBreakdown.osrmCallCount,
      osrmFailureCount: runtimeBreakdown.osrmFailureCount,
      osrmTotalMs: runtimeBreakdown.osrmTotalMs,
      osrmAverageMs: runtimeBreakdown.osrmAverageMs,
      osrmProvider: runtimeBreakdown.osrmProvider,
      osrmAvailability: runtimeBreakdown.osrmAvailability,
      osrmLatencyMs: runtimeBreakdown.osrmLatencyMs,
      osrmMatrixCount: runtimeBreakdown.osrmMatrixCount,
      osrmMatrixSize: runtimeBreakdown.osrmMatrixSize,
      osrmFailureReason: runtimeBreakdown.osrmFailureReason,
      matrixCacheHit: runtimeBreakdown.matrixCacheHit,
      matrixCacheMiss: runtimeBreakdown.matrixCacheMiss,
      matrixGenerationMs: runtimeBreakdown.matrixGenerationMs,
      macroClusterCount: runtimeBreakdown.macroClusterCount,
      microClusterCount: runtimeBreakdown.microClusterCount,
      largestClusterSize: runtimeBreakdown.largestClusterSize,
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
      averageGeocodingConfidence: geocodingConfidence.averageScore,
      minGeocodingConfidence: geocodingConfidence.minScore,
      suspiciousGeocodingCount: geocodingConfidence.suspectCount,
      issuesDetectedCount: attemptAudit.issueCount + correctionAttempts.length,
      issuesCorrectedCount: blockedReason ? 0 : countCorrectedIssues(correctionAttempts),
      issuesBlockedCount: blockedReason ? 1 : 0,
      auditCycles: 1 + correctionAttempts.length,
      issuesRemainingCount: countRemainingCoherenceIssues(attemptAudit),
      batchCorrectionCount: countBatchCorrectionAttempts(correctionAttempts),
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
        finalIssues: attemptAudit.issues.slice(0, 12),
        routeMetadata: optimizationAttempt.optimized.metadata ?? null,
        geocodingConfidence
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record route metric:", error);
    });
  }
  const { optimized, audit, auditSource } = optimizationAttempt;
  const osrmRequiredForRoute = ENV.osrmRequired && routeStops.length >= ENV.osrmRequiredMinStops;
  if (osrmRequiredForRoute && !optimizationAttempt.usedRoadMetrics) {
    const osrmBlockingReason = {
      issue: audit.issues.find((issue) => issue.type === "osrm_fallback") ?? null,
      message: "OSRM obrigatorio indisponivel. A rota foi salva com alerta usando a melhor estimativa disponivel."
    };
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_osrm_required_unavailable",
      severity: "warning",
      source: "routes.optimize",
      title: "OSRM obrigatorio indisponivel",
      message: osrmBlockingReason.message,
      runtime: null,
      url: null,
      userAgent: null,
      appVersion: null,
      metadata: {
        auditSource,
        status: audit.status,
        score: audit.score,
        issueCount: audit.issueCount,
        totalDistanceKm: audit.totalDistanceKm,
        osrmRequired: ENV.osrmRequired,
        osrmRequiredMinStops: ENV.osrmRequiredMinStops,
        osrmBaseUrl: ENV.osrmBaseUrl,
        blockingIssue: osrmBlockingReason.issue
      }
    }).catch((error) => {
      console.warn("[Routes] Failed to record required OSRM event:", error);
    });
  }
  if (postOptimizationBlockingReason) {
    await createOperationalEvent({
      userId,
      routeId,
      stopId: null,
      type: "route_audit_attention_optimization",
      severity: "warning",
      source: "routes.optimize",
      title: "Auditor manteve alerta na otimizacao",
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
      console.warn("[Routes] Failed to record route audit attention event:", error);
    });
    postOptimizationBlockingReason = null;
  }
  const dbSaveStartedAt = Date.now();
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
    geocodingConfidenceScore: wp.geocodingConfidenceScore,
    geocodingMethod: wp.geocodingMethod,
    geocodingSuspect: wp.geocodingSuspect,
    sequence: wp.sequence,
    notes: wp.notes,
    sourceProvider: normalizeStopSourceProvider(wp.sourceProvider),
    originalStop: wp.originalStop ?? null,
    isUnsequencedStop: Boolean(wp.isUnsequencedStop),
    metadata: normalizeStopMetadata(wp.metadata)
  }));
  await createStops(routeId, updatedStops);
  runtimeBreakdown.dbSaveMs += Date.now() - dbSaveStartedAt;
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
var geocodingMethodSchema = z2.enum([
  "exact_address",
  "street_match",
  "neighborhood_match",
  "city_match",
  "approximate_route_cluster",
  "manual_coordinate"
]);
var stopSourceProviderSchema = z2.enum(STOP_SOURCE_PROVIDERS);
var stopMetadataSchema = z2.record(z2.string(), z2.unknown()).nullable().optional();
var stopCreateSchema = z2.object({
  address: z2.string().min(1, "Informe o endere\xE7o da parada."),
  latitude: z2.number().optional(),
  longitude: z2.number().optional(),
  sequence: z2.number(),
  notes: z2.string().optional(),
  sourceProvider: stopSourceProviderSchema.optional(),
  originalStop: z2.number().nullable().optional(),
  isUnsequencedStop: z2.boolean().optional(),
  metadata: stopMetadataSchema,
  geocodingConfidenceScore: z2.number().min(0).max(100).optional(),
  geocodingMethod: geocodingMethodSchema.optional(),
  geocodingSuspect: z2.boolean().optional()
});
var stopUpdateSchema = z2.object({
  routeId: z2.number(),
  stopId: z2.number(),
  address: z2.string().min(1, "Informe o endere\xE7o da parada."),
  latitude: z2.number().nullable().optional(),
  longitude: z2.number().nullable().optional(),
  sequence: z2.number().optional(),
  notes: z2.string().nullable().optional(),
  sourceProvider: stopSourceProviderSchema.optional(),
  originalStop: z2.number().nullable().optional(),
  isUnsequencedStop: z2.boolean().nullable().optional(),
  metadata: stopMetadataSchema,
  geocodingConfidenceScore: z2.number().min(0).max(100).optional(),
  geocodingMethod: geocodingMethodSchema.optional(),
  geocodingSuspect: z2.boolean().optional()
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
function routeStopLimitMessage(stopCount) {
  return `Esta rota tem ${stopCount} paradas e excede o limite comercial atual de testes de ${ENV.maxRouteStops} paradas por rota. Volumes maiores ser\xE3o liberados gradualmente conforme a evolu\xE7\xE3o da infraestrutura. Divida a tabela em rotas menores.`;
}
async function assertRouteStopLimit(userId, stopCount, source, routeId) {
  if (stopCount <= ENV.maxRouteStops) return;
  await recordOperationalEvent(userId, {
    type: "route_stop_limit_exceeded",
    severity: "warning",
    source,
    title: `Limite de ${ENV.maxRouteStops} paradas excedido`,
    routeId,
    message: routeStopLimitMessage(stopCount),
    metadata: {
      stopCount,
      maxRouteStops: ENV.maxRouteStops
    }
  });
  throw new TRPCError3({
    code: "BAD_REQUEST",
    message: routeStopLimitMessage(stopCount)
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
    dashboard: adminProcedure.query(async () => {
      const dashboard = await getAdminOperationalDashboard();
      const optimizationQueue = await getOptimizationQueueHealth();
      const optimizationWorkers = await getOptimizationWorkersDashboard();
      const queueIntegrity = await getQueueIntegrityDashboard();
      const disasterReadiness = await getDisasterReadinessDashboard();
      const performanceBenchmarks2 = await getPerformanceBenchmarkDashboard();
      const multiVehicleReadiness = await getMultiVehicleReadinessDashboard();
      const goLive500 = await getGoLive500Dashboard();
      return {
        ...dashboard,
        optimizationQueue,
        optimizationWorkers,
        queueIntegrity,
        disasterReadiness,
        performanceBenchmarks: performanceBenchmarks2,
        multiVehicleReadiness,
        goLive500
      };
    }),
    refreshDashboard: adminProcedure.mutation(() => refreshAdminDashboardMetrics()),
    routeMetrics: adminProcedure.input(z2.object({
      days: z2.number().min(1).max(365).default(30)
    })).query(({ input }) => getRouteMetricsDashboard(input.days)),
    geocodingImpact: adminProcedure.query(() => getGeocodingImpactDashboard()),
    geocodingExecutiveReport: adminProcedure.query(
      () => getGeocodingExecutiveReport()
    ),
    operationExecutionReport: adminProcedure.query(
      () => getOperationExecutionReport()
    ),
    workers: adminProcedure.query(() => getOptimizationWorkersDashboard()),
    queueIntegrity: adminProcedure.query(() => getQueueIntegrityDashboard()),
    disasterReadiness: adminProcedure.query(() => getDisasterReadinessDashboard()),
    performanceBenchmarks: adminProcedure.query(
      () => getPerformanceBenchmarkDashboard()
    ),
    goLive500: adminProcedure.query(() => getGoLive500Dashboard()),
    multiVehicleReadiness: adminProcedure.query(
      () => getMultiVehicleReadinessDashboard()
    ),
    events: adminProcedure.input(z2.object({
      page: z2.number().min(1).default(1),
      limit: z2.number().min(1).max(100).default(30)
    })).query(({ input }) => getAdminDashboardEvents(input.page, input.limit)),
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
      await assertRouteStopLimit(
        ctx.user.id,
        stops2.length,
        "routes.createAndOptimize"
      );
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
      await requireUserRoute(input.id, ctx.user.id);
      const currentStops = await getRouteStops(input.id);
      await assertRouteStopLimit(
        ctx.user.id,
        currentStops.length,
        "routes.optimize",
        input.id
      );
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
      await requireUserRoute(input.id, ctx.user.id);
      const currentStops = await getRouteStops(input.id);
      await assertRouteStopLimit(
        ctx.user.id,
        currentStops.length,
        "routes.optimizeRemaining",
        input.id
      );
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
      const currentStops = await getRouteStops(input.routeId);
      await assertRouteStopLimit(
        ctx.user.id,
        currentStops.length + input.stops.length,
        "stops.create",
        input.routeId
      );
      const createdStops = await createStops(input.routeId, input.stops);
      await updateRoute(input.routeId, ctx.user.id, { status: "draft" });
      return createdStops;
    }),
    update: protectedProcedure.input(stopUpdateSchema).mutation(async ({ ctx, input }) => {
      await requireUserRoute(input.routeId, ctx.user.id);
      const currentStops = await getRouteStops(input.routeId);
      const currentStopRaw = currentStops.find(
        (stop) => Number(stop.id) === Number(input.stopId)
      );
      const currentStop = currentStopRaw ? { ...currentStopRaw } : null;
      const updatedStop = await updateStop(input.routeId, input.stopId, {
        address: input.address.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        sequence: input.sequence,
        notes: input.notes?.trim() || null,
        sourceProvider: input.sourceProvider,
        originalStop: input.originalStop,
        isUnsequencedStop: input.isUnsequencedStop,
        metadata: normalizeStopMetadata(input.metadata),
        geocodingConfidenceScore: input.geocodingConfidenceScore,
        geocodingMethod: input.geocodingMethod,
        geocodingSuspect: input.geocodingSuspect
      });
      if (!updatedStop) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Parada n\xE3o encontrada."
        });
      }
      await updateRoute(input.routeId, ctx.user.id, { status: "draft" });
      if (currentStop) {
        const previousAddress = String(currentStop.address || "").trim();
        const nextAddress = String(updatedStop.address || "").trim();
        const previousLatitude = Number(currentStop.latitude);
        const previousLongitude = Number(currentStop.longitude);
        const nextLatitude = Number(updatedStop.latitude);
        const nextLongitude = Number(updatedStop.longitude);
        const addressChanged = previousAddress !== nextAddress;
        const coordinatesChanged = Number.isFinite(previousLatitude) && Number.isFinite(previousLongitude) && Number.isFinite(nextLatitude) && Number.isFinite(nextLongitude) && (Math.abs(previousLatitude - nextLatitude) > 1e-6 || Math.abs(previousLongitude - nextLongitude) > 1e-6);
        if (addressChanged || coordinatesChanged) {
          await createAddressCorrection({
            userId: ctx.user.id,
            routeId: input.routeId,
            stopId: input.stopId,
            originalAddress: previousAddress || nextAddress,
            correctedAddress: nextAddress || previousAddress,
            latitude: Number.isFinite(nextLatitude) ? nextLatitude : null,
            longitude: Number.isFinite(nextLongitude) ? nextLongitude : null
          });
          await createOperationalEvent({
            userId: ctx.user.id,
            routeId: input.routeId,
            stopId: input.stopId,
            type: "geocoding_manual_correction",
            severity: "info",
            source: "stops.update",
            title: "Correcao manual de endereco",
            message: "Parada editada manualmente pelo usuario.",
            metadata: {
              provider_used: "manual",
              addressChanged,
              coordinatesChanged,
              geocodingConfidenceScore: updatedStop.geocodingConfidenceScore ?? null,
              geocodingMethod: updatedStop.geocodingMethod ?? null
            }
          });
        }
      }
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
  const osrmState = input.osrm?.enabled ? input.osrm.reachable ? "osrm_connected" : "osrm_unreachable" : "osrm_disabled";
  const osrmError = input.osrm?.error || "";
  return [
    input.systemAvailable ?? input.storageAvailable ? "ok" : "down",
    databaseState,
    dbError,
    fallbackError,
    osrmState,
    osrmError
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
    },
    osrm: input.osrm ? {
      enabled: Boolean(input.osrm.enabled),
      required: Boolean(input.osrm.required),
      configured: Boolean(input.osrm.configured),
      reachable: Boolean(input.osrm.reachable),
      baseUrl: input.osrm.baseUrl ?? null,
      timeoutMs: input.osrm.timeoutMs ?? null,
      error: input.osrm.error ?? null
    } : null
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
  const systemAvailable = input.systemAvailable ?? input.storageAvailable;
  if (systemAvailable) {
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
      title: "Sistema recuperado",
      message: `O sistema voltou a responder. Falha anterior: ${outage.message}`,
      metadata: {
        ...metadata,
        previousOutage: outage,
        recoveredAt: observedAt
      }
    });
    return;
  }
  const message = input.database?.error || input.database?.schema?.error || input.fallbackStore?.error || input.osrm?.error || "Sistema indisponivel.";
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
  console.warn("[Monitor] System unavailable:", {
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
    severity: input.storageAvailable ? "error" : input.database?.reachable ? "error" : "fatal",
    title: input.storageAvailable ? "OSRM indisponivel" : "Armazenamento indisponivel",
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
  const osrm = await getOsrmHealth();
  const queue2 = await getOptimizationQueueHealth();
  if (!database.connected) {
    try {
      await ensurePersistentFallbackDbLoaded();
    } catch {
    }
  }
  const fallbackStore = getPersistentFallbackDbHealth();
  const canUseLocalFallback = !ENV.isProduction || ENV.allowEphemeralDb && !ENV.hasInvalidProductionDatabaseUrl;
  const storageAvailable = ENV.requireManagedDatabase ? database.connected : database.connected || fallbackStore.loaded || canUseLocalFallback;
  const osrmAvailable = !osrm.required || osrm.enabled && osrm.reachable;
  const systemAvailable = storageAvailable && osrmAvailable;
  const mode = database.connected ? "persistent" : fallbackStore.configured ? "redis-fallback" : "local-fallback";
  await recordHealthObservation({
    database,
    fallbackStore,
    storageAvailable,
    systemAvailable,
    mode,
    source,
    osrm
  });
  return {
    database,
    fallbackStore,
    storageAvailable,
    systemAvailable,
    osrm,
    queue: queue2,
    mode
  };
}
async function requireAdminApiRequest(req, res) {
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
    const { database, fallbackStore, storageAvailable, systemAvailable, osrm, queue: queue2, mode } = await getStorageHealthSnapshot("api.health");
    res.status(systemAvailable ? 200 : 500).json({
      ok: systemAvailable,
      app: "EconoRota",
      environment: ENV.isProduction ? "production" : "development",
      mode,
      database,
      fallbackStore,
      osrm,
      queue: queue2,
      requiredManagedDatabase: ENV.requireManagedDatabase,
      warning: ENV.hasInvalidProductionDatabaseUrl ? "DATABASE_URL aponta para host local/Docker e n\xE3o funciona em Vercel. Configure MySQL gerenciado ou remova DATABASE_URL e use Upstash Redis." : void 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/monitor/ping", async (_req, res) => {
    const { database, fallbackStore, storageAvailable, systemAvailable, osrm, queue: queue2, mode } = await getStorageHealthSnapshot("api.monitor.ping");
    let adminDashboardRefresh = { ok: false };
    if (systemAvailable) {
      try {
        await refreshAdminDashboardMetrics();
        adminDashboardRefresh = { ok: true };
      } catch (error) {
        adminDashboardRefresh = {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
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
      queue: queue2,
      adminDashboardRefresh,
      requiredManagedDatabase: ENV.requireManagedDatabase,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/admin/dashboard", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    const dashboard = await getAdminOperationalDashboard();
    const optimizationQueue = await getOptimizationQueueHealth();
    const optimizationWorkers = await getOptimizationWorkersDashboard();
    const queueIntegrity = await getQueueIntegrityDashboard();
    const disasterReadiness = await getDisasterReadinessDashboard();
    const performanceBenchmarks2 = await getPerformanceBenchmarkDashboard();
    const multiVehicleReadiness = await getMultiVehicleReadinessDashboard();
    const goLive500 = await getGoLive500Dashboard();
    res.json({
      ...dashboard,
      optimizationQueue,
      optimizationWorkers,
      queueIntegrity,
      disasterReadiness,
      performanceBenchmarks: performanceBenchmarks2,
      multiVehicleReadiness,
      goLive500
    });
  });
  app2.get("/api/admin/events", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 30);
    res.json(await getAdminDashboardEvents(page, limit));
  });
  app2.get("/api/admin/geocoding-impact", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getGeocodingImpactDashboard());
  });
  app2.get("/api/admin/geocoding-executive-report", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getGeocodingExecutiveReport());
  });
  app2.get("/api/admin/operation-execution-report", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getOperationExecutionReport());
  });
  app2.get("/api/admin/workers", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getOptimizationWorkersDashboard());
  });
  app2.get("/api/admin/queue-integrity", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getQueueIntegrityDashboard());
  });
  app2.get("/api/admin/disaster-readiness", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getDisasterReadinessDashboard());
  });
  app2.get("/api/admin/performance-benchmarks", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getPerformanceBenchmarkDashboard());
  });
  app2.get("/api/admin/go-live-500", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getGoLive500Dashboard());
  });
  app2.get("/api/admin/multi-vehicle-readiness", async (req, res) => {
    const user = await requireAdminApiRequest(req, res);
    if (!user) return;
    res.json(await getMultiVehicleReadinessDashboard());
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
