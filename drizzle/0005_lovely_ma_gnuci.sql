CREATE TABLE `userIntegrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`label` varchar(255),
	`baseUrl` varchar(500),
	`fallbackBaseUrls` text,
	`deliveriesPath` varchar(500),
	`authHeader` varchar(128),
	`authTokenEncrypted` text NOT NULL,
	`country` varchar(16),
	`lang` varchar(32),
	`resourceCode` varchar(64),
	`timezone` varchar(64),
	`hubCode` varchar(128),
	`appVersion` varchar(32),
	`sourceName` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`lastValidatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userIntegrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `userIntegrations` ADD CONSTRAINT `userIntegrations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX `userIntegrations_user_provider_unique` ON `userIntegrations` (`userId`, `provider`);
