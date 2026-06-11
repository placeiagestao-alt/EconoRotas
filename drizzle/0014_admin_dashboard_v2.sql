CREATE TABLE `admin_dashboard_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`usersTotal` int NOT NULL DEFAULT 0,
	`activeUsers7d` int NOT NULL DEFAULT 0,
	`routesTotal` int NOT NULL DEFAULT 0,
	`routesToday` int NOT NULL DEFAULT 0,
	`jobsWaiting` int NOT NULL DEFAULT 0,
	`jobsRunning` int NOT NULL DEFAULT 0,
	`jobsFailed` int NOT NULL DEFAULT 0,
	`avgOptimizationRuntime` int NOT NULL DEFAULT 0,
	`avgGeocodingConfidence` int NOT NULL DEFAULT 0,
	`events24h` int NOT NULL DEFAULT 0,
	`errors24h` int NOT NULL DEFAULT 0,
	`warnings24h` int NOT NULL DEFAULT 0,
	`payload` json,
	CONSTRAINT `admin_dashboard_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `admin_dashboard_metrics_generatedAt_idx` ON `admin_dashboard_metrics` (`generatedAt`);--> statement-breakpoint
CREATE INDEX `operationalEvents_createdAt_userId_idx` ON `operationalEvents` (`createdAt`,`userId`);--> statement-breakpoint
CREATE INDEX `operationalEvents_severity_createdAt_idx` ON `operationalEvents` (`severity`,`createdAt`);--> statement-breakpoint
CREATE INDEX `operationalEvents_type_createdAt_idx` ON `operationalEvents` (`type`,`createdAt`);--> statement-breakpoint
CREATE INDEX `routes_createdAt_idx` ON `routes` (`createdAt`);--> statement-breakpoint
CREATE INDEX `stops_createdAt_idx` ON `stops` (`createdAt`);--> statement-breakpoint
CREATE INDEX `users_createdAt_idx` ON `users` (`createdAt`);