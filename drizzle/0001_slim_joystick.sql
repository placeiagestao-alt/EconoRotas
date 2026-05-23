CREATE TABLE `chatHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`routeId` int,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routeHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`userId` int NOT NULL,
	`executedDate` timestamp NOT NULL DEFAULT (now()),
	`actualDistance` decimal(10,2),
	`actualTime` int,
	`status` enum('in_progress','completed','cancelled') NOT NULL DEFAULT 'in_progress',
	`notes` text,
	`exportedAt` timestamp,
	`exportFormat` enum('pdf','csv'),
	`storageKey` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routeHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routeSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`userId` int NOT NULL,
	`recurrenceType` enum('once','daily','weekly') NOT NULL DEFAULT 'once',
	`scheduledDate` timestamp NOT NULL,
	`scheduledTime` varchar(8),
	`daysOfWeek` varchar(50),
	`isActive` boolean NOT NULL DEFAULT true,
	`lastExecuted` timestamp,
	`nextExecution` timestamp,
	`heartbeatJobId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routeSchedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`mode` enum('shortest_distance','shortest_time','balanced') NOT NULL DEFAULT 'balanced',
	`totalDistance` decimal(10,2),
	`totalTime` int,
	`status` enum('draft','optimized','completed','cancelled') NOT NULL DEFAULT 'draft',
	`startLocation` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`address` varchar(500) NOT NULL,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`sequence` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stops_id` PRIMARY KEY(`id`)
);
