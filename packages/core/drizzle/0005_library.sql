CREATE TABLE `leaving` (
	`rating_key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`image` text,
	`remove_at` integer NOT NULL,
	`notice_days` integer NOT NULL,
	`status` text NOT NULL,
	`run_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaving_status_idx` ON `leaving` (`status`,`remove_at`);--> statement-breakpoint
CREATE TABLE `library_items` (
	`rating_key` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`thumb` text,
	`added_at` integer,
	`last_played_at` integer,
	`plays` integer DEFAULT 0 NOT NULL,
	`bytes` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `library_items_last_idx` ON `library_items` (`last_played_at`);