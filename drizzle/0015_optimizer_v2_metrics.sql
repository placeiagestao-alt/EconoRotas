ALTER TABLE `route_metrics` ADD `auditCycles` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `issuesRemainingCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `batchCorrectionCount` int DEFAULT 0 NOT NULL;