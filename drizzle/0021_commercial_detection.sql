ALTER TABLE `stops`
  ADD COLUMN `commercialDetectionStatus` enum('unknown','suspected','confirmed') NOT NULL DEFAULT 'unknown',
  ADD COLUMN `commercialConfidence` int NOT NULL DEFAULT 0,
  ADD COLUMN `commercialPlaceName` varchar(255),
  ADD COLUMN `commercialCategory` varchar(128),
  ADD COLUMN `commercialOpeningHours` varchar(255),
  ADD COLUMN `commercialSource` varchar(64),
  ADD COLUMN `commercialLastCheckedAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `stops_commercialDetectionStatus_idx` ON `stops` (`commercialDetectionStatus`);
--> statement-breakpoint
CREATE TABLE `location_commercial_cache` (
  `id` int AUTO_INCREMENT NOT NULL,
  `lat` decimal(10,8) NOT NULL,
  `lng` decimal(11,8) NOT NULL,
  `radius` int NOT NULL,
  `response` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `location_commercial_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `location_commercial_cache_lookup_idx` ON `location_commercial_cache` (`lat`, `lng`, `radius`);
--> statement-breakpoint
CREATE INDEX `location_commercial_cache_createdAt_idx` ON `location_commercial_cache` (`createdAt`);
