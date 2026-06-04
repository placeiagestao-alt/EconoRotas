CREATE TABLE `geocode_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(191) NOT NULL,
	`query` varchar(700) NOT NULL,
	`provider` varchar(64) NOT NULL DEFAULT 'nominatim',
	`resultCount` int NOT NULL DEFAULT 0,
	`results` json NOT NULL,
	`hitCount` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `geocode_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `geocode_cache_cacheKey_unique` UNIQUE(`cacheKey`)
);
--> statement-breakpoint
CREATE INDEX `geocode_cache_expiresAt_idx` ON `geocode_cache` (`expiresAt`);