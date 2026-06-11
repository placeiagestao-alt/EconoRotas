ALTER TABLE `route_metrics` ADD `startedAt` timestamp;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `completedAt` timestamp;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `executionDurationMs` int;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `executionStatus` enum('pending','started','completed','abandoned') NOT NULL DEFAULT 'pending';--> statement-breakpoint
CREATE INDEX `route_metrics_executionStatus_idx` ON `route_metrics` (`executionStatus`);
