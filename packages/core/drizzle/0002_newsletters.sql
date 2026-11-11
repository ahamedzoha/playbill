CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`topic` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`mode` text DEFAULT 'test' NOT NULL,
	`cron` text NOT NULL,
	`settings` text NOT NULL,
	`last_occurrence` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`plex_user_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_run_email_idx` ON `deliveries` (`run_id`,`email`);--> statement-breakpoint
CREATE INDEX `deliveries_status_idx` ON `deliveries` (`status`);--> statement-breakpoint
CREATE INDEX `deliveries_sent_idx` ON `deliveries` (`sent_at`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`plex_user_id` text NOT NULL,
	`topic` text NOT NULL,
	`subscribed` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_person_topic_idx` ON `preferences` (`plex_user_id`,`topic`);--> statement-breakpoint
CREATE TABLE `provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`email` text,
	`provider_id` text,
	`at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`window_key` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`content` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_campaign_window_idx` ON `runs` (`campaign_id`,`window_key`);--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`status`);--> statement-breakpoint
CREATE TABLE `suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`detail` text,
	`at` integer NOT NULL
);
