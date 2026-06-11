ALTER TABLE `optimization_jobs` ADD `worker_id` varchar(191);--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `worker_hostname` varchar(191);--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `worker_started_at` timestamp;--> statement-breakpoint
ALTER TABLE `optimization_jobs` ADD `worker_finished_at` timestamp;--> statement-breakpoint
CREATE INDEX `optimization_jobs_worker_id_idx` ON `optimization_jobs` (`worker_id`);
