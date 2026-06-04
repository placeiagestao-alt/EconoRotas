ALTER TABLE `route_metrics` ADD `averageGeocodingConfidence` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `minGeocodingConfidence` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `suspiciousGeocodingCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stops` ADD `geocodingConfidenceScore` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stops` ADD `geocodingMethod` enum('exact_address','street_match','neighborhood_match','city_match','approximate_route_cluster','manual_coordinate') DEFAULT 'city_match' NOT NULL;--> statement-breakpoint
ALTER TABLE `stops` ADD `geocodingSuspect` boolean DEFAULT true NOT NULL;