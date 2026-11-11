ALTER TABLE `audit_log` ADD `level` text DEFAULT 'info' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `category` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
CREATE INDEX `audit_level_at_idx` ON `audit_log` (`level`,`at`);--> statement-breakpoint
CREATE INDEX `audit_category_at_idx` ON `audit_log` (`category`,`at`);--> statement-breakpoint
-- Backfill existing rows; must match classify() in src/activity.ts (a test checks the two agree).
UPDATE `audit_log` SET `category` = CASE
  WHEN `action` LIKE 'digest.%' OR `action` LIKE 'arrivals.%' OR `action` LIKE 'recap.%' OR `action` LIKE 'campaign.%' OR `action` LIKE 'preferences.%' THEN 'email'
  WHEN `action` LIKE 'person.%' OR `action` LIKE 'plex.%' OR `action` LIKE 'lifecycle.%' THEN 'people'
  WHEN `action` LIKE 'library.%' THEN 'library'
  WHEN `action` LIKE 'settings.%' OR `action` LIKE 'setup.%' THEN 'settings'
  ELSE 'system' END,
`level` = CASE
  WHEN `action` = 'job.failed' THEN 'error'
  WHEN `action` = 'campaign.sent' AND coalesce(json_extract(`after`, '$.failed'), 0) > 0 AND coalesce(json_extract(`after`, '$.sent'), 0) = 0 THEN 'error'
  WHEN `action` = 'campaign.sent' AND coalesce(json_extract(`after`, '$.failed'), 0) > 0 THEN 'warning'
  WHEN `action` IN ('campaign.deferred', 'plex.remove', 'lifecycle.removal.approve', 'lifecycle.removal.proposed', 'lifecycle.warning.queued') THEN 'warning'
  ELSE 'info' END;
