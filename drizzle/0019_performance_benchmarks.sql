CREATE TABLE IF NOT EXISTS `performance_benchmarks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scenario` varchar(64) NOT NULL,
  `stop_count` int NOT NULL,
  `runtime_ms` int NOT NULL DEFAULT 0,
  `peak_memory_mb` int NOT NULL DEFAULT 0,
  `queue_wait_ms` int NOT NULL DEFAULT 0,
  `osrm_latency_ms` int NOT NULL DEFAULT 0,
  `audit_cycles` int NOT NULL DEFAULT 0,
  `micro_cluster_count` int NOT NULL DEFAULT 0,
  `osrm_calls` int NOT NULL DEFAULT 0,
  `osrm_failures` int NOT NULL DEFAULT 0,
  `matrix_cache_hit` int NOT NULL DEFAULT 0,
  `matrix_cache_miss` int NOT NULL DEFAULT 0,
  `success` boolean NOT NULL DEFAULT false,
  `criteria_met` boolean NOT NULL DEFAULT false,
  `metadata` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `performance_benchmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `performance_benchmarks_created_at_idx` ON `performance_benchmarks` (`created_at`);
--> statement-breakpoint
CREATE INDEX `performance_benchmarks_stop_count_idx` ON `performance_benchmarks` (`stop_count`);
--> statement-breakpoint
CREATE INDEX `performance_benchmarks_scenario_idx` ON `performance_benchmarks` (`scenario`);
