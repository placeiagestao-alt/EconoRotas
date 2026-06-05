ALTER TABLE `optimization_jobs` ADD `queue_wait_ms` int;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `attempt_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `max_attempts` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `provider_job_id` varchar(191);--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `stack_trace` text;