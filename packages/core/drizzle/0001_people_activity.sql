CREATE TABLE `libraries` (
	`section_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`item_count` integer,
	`active` integer DEFAULT true NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`plex_user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`thumb` text,
	`status` text NOT NULL,
	`invited_at` integer,
	`accepted_at` integer,
	`plex_last_seen_at` integer,
	`last_played_at` integer,
	`tautulli_notify` integer,
	`exempt` integer DEFAULT false NOT NULL,
	`note` text,
	`first_seen_at` integer NOT NULL,
	`removed_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_status_idx` ON `people` (`status`);--> statement-breakpoint
CREATE INDEX `people_last_played_idx` ON `people` (`last_played_at`);--> statement-breakpoint
CREATE TABLE `plex_shares` (
	`plex_user_id` text PRIMARY KEY NOT NULL,
	`share_id` text,
	`all_libraries` integer NOT NULL,
	`section_ids` text NOT NULL,
	`allow_sync` integer NOT NULL,
	`filters` text,
	`pending` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`plex_user_id`) REFERENCES `people`(`plex_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`name` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL,
	`last_run_at` integer,
	`last_ok_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `watch_history` (
	`id` integer PRIMARY KEY NOT NULL,
	`plex_user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`stopped_at` integer,
	`play_seconds` integer NOT NULL,
	`percent_complete` integer,
	`watched` real,
	`media_type` text NOT NULL,
	`section_id` text,
	`rating_key` text,
	`parent_rating_key` text,
	`grandparent_rating_key` text,
	`title` text NOT NULL,
	`parent_title` text,
	`grandparent_title` text,
	`full_title` text,
	`year` integer,
	`season_number` integer,
	`episode_number` integer,
	`guid` text,
	`thumb` text,
	`platform` text,
	`player` text,
	`product` text,
	`ip_address` text,
	`transcode_decision` text,
	`location` text,
	`relayed` integer,
	`live` integer
);
--> statement-breakpoint
CREATE INDEX `wh_user_started_idx` ON `watch_history` (`plex_user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `wh_started_idx` ON `watch_history` (`started_at`);--> statement-breakpoint
CREATE INDEX `wh_grandparent_idx` ON `watch_history` (`grandparent_rating_key`);--> statement-breakpoint
CREATE INDEX `wh_section_idx` ON `watch_history` (`section_id`);