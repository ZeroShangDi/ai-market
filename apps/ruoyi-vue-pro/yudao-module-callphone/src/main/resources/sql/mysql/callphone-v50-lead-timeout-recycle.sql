-- Tenant-configured claim timeout. The scheduler is global and processes each
-- tenant through Yudao's tenant job hook; the feature is disabled by default.
SET @callphone_recycle_enabled_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_lead_assignment_auto_config'
    AND COLUMN_NAME = 'recycle_enabled');
SET @callphone_recycle_enabled_sql := IF(@callphone_recycle_enabled_exists > 0,
  'SELECT 1',
  'ALTER TABLE `cp_lead_assignment_auto_config` ADD COLUMN `recycle_enabled` bit(1) NOT NULL DEFAULT b''0'' AFTER `version`');
PREPARE callphone_recycle_enabled_stmt FROM @callphone_recycle_enabled_sql;
EXECUTE callphone_recycle_enabled_stmt;
DEALLOCATE PREPARE callphone_recycle_enabled_stmt;

SET @callphone_recycle_days_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_lead_assignment_auto_config'
    AND COLUMN_NAME = 'recycle_after_days');
SET @callphone_recycle_days_sql := IF(@callphone_recycle_days_exists > 0,
  'SELECT 1',
  'ALTER TABLE `cp_lead_assignment_auto_config` ADD COLUMN `recycle_after_days` smallint unsigned NOT NULL DEFAULT 7 AFTER `recycle_enabled`');
PREPARE callphone_recycle_days_stmt FROM @callphone_recycle_days_sql;
EXECUTE callphone_recycle_days_stmt;
DEALLOCATE PREPARE callphone_recycle_days_stmt;

SET @callphone_recycle_index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_lead' AND INDEX_NAME = 'idx_cp_lead_timeout_recycle');
SET @callphone_recycle_index_sql := IF(@callphone_recycle_index_exists > 0,
  'SELECT 1',
  'ALTER TABLE `cp_lead` ADD KEY `idx_cp_lead_timeout_recycle` (`tenant_id`,`status`,`update_time`,`owner_user_id`)');
PREPARE callphone_recycle_index_stmt FROM @callphone_recycle_index_sql;
EXECUTE callphone_recycle_index_stmt;
DEALLOCATE PREPARE callphone_recycle_index_stmt;

-- Backfill old follow-ups because earlier activity writes did not touch cp_lead.update_time.
UPDATE `cp_lead` l
JOIN (
  SELECT `tenant_id`, `lead_id`, MAX(`create_time`) AS `last_activity_at`
  FROM `cp_lead_activity`
  WHERE `deleted` = b'0'
  GROUP BY `tenant_id`, `lead_id`
) a ON a.`tenant_id` = l.`tenant_id` AND a.`lead_id` = l.`id`
SET l.`update_time` = a.`last_activity_at`
WHERE l.`status` = 'claimed' AND a.`last_activity_at` > l.`update_time`;

-- Use Yudao's scheduler instead of starting an unmanaged background thread.
SET @callphone_lead_timeout_job_id := (SELECT COALESCE(MAX(`id`), 0) + 1 FROM `infra_job`);
INSERT INTO `infra_job`
  (`id`,`name`,`status`,`handler_name`,`handler_param`,`cron_expression`,`retry_count`,`retry_interval`,`monitor_timeout`,
   `creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT @callphone_lead_timeout_job_id, 'Call Phone 线索超时回收', 1, 'callPhoneLeadTimeoutRecycleJob', '',
       '0 */15 * * * ?', 3, 60000, 300000, 'callphone', CURRENT_TIMESTAMP, 'callphone', CURRENT_TIMESTAMP, b'0'
WHERE NOT EXISTS (SELECT 1 FROM `infra_job`
  WHERE `handler_name` = 'callPhoneLeadTimeoutRecycleJob' AND `deleted` = b'0');

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 50;
