CREATE TABLE `route_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`routeId` int,
	`qualityScore` int NOT NULL,
	`optimizationRuntimeMs` int NOT NULL,
	`osrmUsed` boolean NOT NULL DEFAULT false,
	`osrmFallback` boolean NOT NULL DEFAULT false,
	`clusterCount` int NOT NULL DEFAULT 0,
	`averageClusterRadius` decimal(10,3) NOT NULL DEFAULT '0',
	`maxClusterRadius` decimal(10,3) NOT NULL DEFAULT '0',
	`regionRevisitedCount` int NOT NULL DEFAULT 0,
	`prematureRegionExitCount` int NOT NULL DEFAULT 0,
	`nearbyStopSkippedCount` int NOT NULL DEFAULT 0,
	`routeCrossingCount` int NOT NULL DEFAULT 0,
	`issuesDetectedCount` int NOT NULL DEFAULT 0,
	`issuesCorrectedCount` int NOT NULL DEFAULT 0,
	`issuesBlockedCount` int NOT NULL DEFAULT 0,
	`auditStatus` enum('approved','attention','critical') NOT NULL,
	`auditQuality` enum('excellent','good','attention','poor','blocked') NOT NULL,
	`auditSource` varchar(128),
	`routeMode` enum('shortest_distance','shortest_time','balanced'),
	`localityMode` enum('balanced','local','strict'),
	`stopCount` int NOT NULL DEFAULT 0,
	`totalDistanceKm` decimal(10,2) NOT NULL DEFAULT '0',
	`totalTimeMinutes` int NOT NULL DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `route_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `route_metrics` ADD CONSTRAINT `route_metrics_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `route_metrics` ADD CONSTRAINT `route_metrics_routeId_routes_id_fk` FOREIGN KEY (`routeId`) REFERENCES `routes`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `route_metrics_createdAt_idx` ON `route_metrics` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `route_metrics_routeId_idx` ON `route_metrics` (`routeId`);
--> statement-breakpoint
CREATE INDEX `route_metrics_auditStatus_idx` ON `route_metrics` (`auditStatus`);
--> statement-breakpoint
CREATE INDEX `route_metrics_osrmFallback_idx` ON `route_metrics` (`osrmFallback`);
