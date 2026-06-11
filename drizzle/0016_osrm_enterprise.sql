CREATE TABLE `osrm_matrix_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matrixHash` varchar(128) NOT NULL,
	`clusterHash` varchar(128) NOT NULL,
	`stopCount` int NOT NULL,
	`durationMatrix` json NOT NULL,
	`distanceMatrix` json NOT NULL,
	`profile` varchar(32) NOT NULL DEFAULT 'driving',
	`provider` varchar(64) NOT NULL DEFAULT 'osrm',
	`osrmBaseUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`hitCount` int NOT NULL DEFAULT 0,
	CONSTRAINT `osrm_matrix_cache_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `osrm_matrix_cache_matrixHash_idx` ON `osrm_matrix_cache` (`matrixHash`);--> statement-breakpoint
CREATE INDEX `osrm_matrix_cache_clusterHash_idx` ON `osrm_matrix_cache` (`clusterHash`);--> statement-breakpoint
CREATE INDEX `osrm_matrix_cache_stopCount_idx` ON `osrm_matrix_cache` (`stopCount`);--> statement-breakpoint
CREATE INDEX `osrm_matrix_cache_lastUsedAt_idx` ON `osrm_matrix_cache` (`lastUsedAt`);--> statement-breakpoint
CREATE INDEX `osrm_matrix_cache_expiresAt_idx` ON `osrm_matrix_cache` (`expiresAt`);--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmProvider` varchar(64);--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmAvailability` enum('unknown','available','degraded','unavailable') NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmLatencyMs` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmMatrixCount` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmMatrixSize` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmFailureReason` varchar(255);--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `matrixCacheHit` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `matrixCacheMiss` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `matrixGenerationMs` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `macroClusterCount` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `microClusterCount` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `largestClusterSize` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `execution_ms` int;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `worker_memory_mb` int;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `peak_memory_mb` int;
