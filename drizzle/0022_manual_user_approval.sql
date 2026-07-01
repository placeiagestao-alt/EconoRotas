ALTER TABLE `users`
  ADD COLUMN `userType` varchar(64),
  ADD COLUMN `marketplace` varchar(64),
  ADD COLUMN `averageStopsPerDay` int,
  ADD COLUMN `accountStatus` enum('pending_review','approved','waitlist','blocked','suspended') NOT NULL DEFAULT 'approved',
  ADD COLUMN `registrationIp` varchar(64),
  ADD COLUMN `registrationUserAgent` varchar(700),
  ADD COLUMN `approvedAt` timestamp NULL,
  ADD COLUMN `approvedBy` int,
  ADD COLUMN `waitlistedAt` timestamp NULL,
  ADD COLUMN `reviewedBy` int,
  ADD COLUMN `blockedAt` timestamp NULL,
  ADD COLUMN `suspendedAt` timestamp NULL,
  ADD COLUMN `internalNotes` text;
--> statement-breakpoint
CREATE INDEX `users_accountStatus_idx` ON `users` (`accountStatus`);
--> statement-breakpoint
CREATE INDEX `users_registrationIp_createdAt_idx` ON `users` (`registrationIp`, `createdAt`);
--> statement-breakpoint
CREATE TABLE `admin_user_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `admin_user_id` int,
  `previous_status` enum('pending_review','approved','waitlist','blocked','suspended') NOT NULL,
  `new_status` enum('pending_review','approved','waitlist','blocked','suspended') NOT NULL,
  `action` enum('approved','waitlist','blocked','suspended') NOT NULL,
  `note` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `admin_user_reviews_id` PRIMARY KEY(`id`),
  CONSTRAINT `admin_user_reviews_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CONSTRAINT `admin_user_reviews_admin_user_id_users_id_fk` FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_user_reviews_user_created_at_idx` ON `admin_user_reviews` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `admin_user_reviews_admin_created_at_idx` ON `admin_user_reviews` (`admin_user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `email_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int,
  `email` varchar(320) NOT NULL,
  `template_name` varchar(128) NOT NULL,
  `status` enum('sent','skipped','failed') NOT NULL DEFAULT 'skipped',
  `error` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `email_logs_id` PRIMARY KEY(`id`),
  CONSTRAINT `email_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `email_logs_user_created_at_idx` ON `email_logs` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `email_logs_template_created_at_idx` ON `email_logs` (`template_name`, `created_at`);
--> statement-breakpoint
CREATE TABLE `beta_access_settings` (
  `id` int NOT NULL,
  `max_approved_users` int NOT NULL DEFAULT 50,
  `allow_new_registrations` boolean NOT NULL DEFAULT true,
  `automatic_approval` boolean NOT NULL DEFAULT false,
  `send_new_users_to_waitlist` boolean NOT NULL DEFAULT false,
  `maintenance_mode` boolean NOT NULL DEFAULT false,
  `routes_per_user_per_day` int NOT NULL DEFAULT 10,
  `stops_per_route_limit` int NOT NULL DEFAULT 200,
  `imports_per_hour_limit` int NOT NULL DEFAULT 5,
  `max_file_size_mb` int NOT NULL DEFAULT 5,
  `updated_by` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `beta_access_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `beta_access_settings_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `beta_access_settings` (
  `id`,
  `max_approved_users`,
  `allow_new_registrations`,
  `automatic_approval`,
  `send_new_users_to_waitlist`,
  `maintenance_mode`,
  `routes_per_user_per_day`,
  `stops_per_route_limit`,
  `imports_per_hour_limit`,
  `max_file_size_mb`
) VALUES (1, 50, true, false, false, false, 10, 200, 5, 5);
