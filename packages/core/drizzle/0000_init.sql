CREATE TABLE `admins` (
	`plex_user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`thumb` text,
	`role` text NOT NULL,
	`added_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `heartbeats` (
	`process` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`version` text NOT NULL,
	`started_at` integer NOT NULL,
	`beat_at` integer NOT NULL,
	`info` text
);
--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_key` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_source_key_idx` ON `inbox` (`source`,`external_key`);--> statement-breakpoint
CREATE INDEX `inbox_unprocessed_idx` ON `inbox` (`processed_at`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`secret` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_check_at` integer,
	`last_check_ok` integer,
	`last_check_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `integrations_kind_idx` ON `integrations` (`kind`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`dedupe_key` text,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`lease_until` integer,
	`lease_owner` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_run_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_active_dedupe_idx` ON `jobs` (`dedupe_key`) WHERE "jobs"."status" in ('queued', 'running') and "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE TABLE `schedules` (
	`name` text PRIMARY KEY NOT NULL,
	`last_occurrence` integer,
	`last_run_at` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`plex_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`plex_user_id`) REFERENCES `admins`(`plex_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`plex_user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
