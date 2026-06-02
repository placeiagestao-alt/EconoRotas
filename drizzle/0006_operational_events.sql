CREATE TABLE `operationalEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`routeId` int,
	`stopId` int,
	`type` varchar(96) NOT NULL,
	`severity` enum('info','warning','error','fatal') NOT NULL DEFAULT 'info',
	`source` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`runtime` varchar(64),
	`url` varchar(700),
	`userAgent` varchar(700),
	`appVersion` varchar(64),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operationalEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `operationalEvents` ADD CONSTRAINT `operationalEvents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `operationalEvents` ADD CONSTRAINT `operationalEvents_routeId_routes_id_fk` FOREIGN KEY (`routeId`) REFERENCES `routes`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `operationalEvents_createdAt_idx` ON `operationalEvents` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `operationalEvents_severity_idx` ON `operationalEvents` (`severity`);
--> statement-breakpoint
CREATE INDEX `operationalEvents_type_idx` ON `operationalEvents` (`type`);
