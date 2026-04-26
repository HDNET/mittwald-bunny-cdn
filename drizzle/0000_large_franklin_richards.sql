CREATE TABLE `extension_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`context_id` text NOT NULL,
	`encrypted_api_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pull_zones` (
	`id` integer PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`cdn_domain` text NOT NULL,
	`origin_url` text NOT NULL,
	`cdn_mode` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `extension_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pull_zones_instance_id_unique` ON `pull_zones` (`instance_id`);