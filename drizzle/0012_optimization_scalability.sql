CREATE TABLE `optimization_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`route_id` int NOT NULL,
	`user_id` int,
	`status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`finished_at` timestamp,
	`runtime_ms` int,
	`error_message` text,
	`metadata` json,
	CONSTRAINT `optimization_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `dbFetchMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `clusteringMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `optimizerMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `auditMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `correctionMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `dbSaveMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `totalRuntimeMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmCallCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmFailureCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmTotalMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `osrmAverageMs` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD CONSTRAINT `optimization_jobs_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD CONSTRAINT `optimization_jobs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `optimization_jobs_route_id_idx` ON `optimization_jobs` (`route_id`);--> statement-breakpoint
CREATE INDEX `optimization_jobs_status_idx` ON `optimization_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `optimization_jobs_created_at_idx` ON `optimization_jobs` (`created_at`);