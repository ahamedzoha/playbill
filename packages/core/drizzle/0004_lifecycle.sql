CREATE TABLE `lifecycle_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`plex_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`deadline` integer,
	`last_played_at` integer,
	`run_id` text,
	`snapshot` text,
	`decided_by` text,
	`decided_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lifecycle_person_idx` ON `lifecycle_actions` (`plex_user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `lifecycle_status_idx` ON `lifecycle_actions` (`status`);