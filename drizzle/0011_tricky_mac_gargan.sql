CREATE TABLE `address_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`address_hash` varchar(64) NOT NULL,
	`original_address` varchar(500) NOT NULL,
	`corrected_address` varchar(500) NOT NULL,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`user_id` int,
	`route_id` int,
	`stop_id` int,
	`city` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `address_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `address_corrections` ADD CONSTRAINT `address_corrections_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `address_corrections` ADD CONSTRAINT `address_corrections_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `address_corrections` ADD CONSTRAINT `address_corrections_stop_id_stops_id_fk` FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `address_corrections_address_hash_idx` ON `address_corrections` (`address_hash`);--> statement-breakpoint
CREATE INDEX `address_corrections_created_at_idx` ON `address_corrections` (`created_at`);--> statement-breakpoint
CREATE INDEX `address_corrections_user_id_idx` ON `address_corrections` (`user_id`);