CREATE TABLE `arrivals` (
	`rating_key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`group_key` text NOT NULL,
	`title` text NOT NULL,
	`group_title` text NOT NULL,
	`season` integer,
	`episode` integer,
	`year` integer,
	`image` text,
	`library` text,
	`added_at` integer NOT NULL,
	`seen_at` integer NOT NULL,
	`requested_by` text,
	`alert_run_id` text
);
--> statement-breakpoint
CREATE INDEX `arrivals_pending_idx` ON `arrivals` (`alert_run_id`);--> statement-breakpoint
CREATE INDEX `arrivals_group_idx` ON `arrivals` (`group_key`);--> statement-breakpoint
ALTER TABLE `deliveries` ADD `items` text;