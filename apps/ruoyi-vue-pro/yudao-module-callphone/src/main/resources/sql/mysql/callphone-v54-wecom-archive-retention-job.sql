-- Distinguish user-initiated and scheduled archive cleanup in the encrypted-content audit.
SET @callphone_archive_actor_type_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_wecom_archive_access_audit'
    AND COLUMN_NAME = 'actor_type');
SET @callphone_archive_actor_type_sql := IF(@callphone_archive_actor_type_exists > 0,
  'SELECT 1',
  'ALTER TABLE `cp_wecom_archive_access_audit` ADD COLUMN `actor_type` varchar(16) NOT NULL DEFAULT ''user'' AFTER `actor_id`');
PREPARE callphone_archive_actor_type_stmt FROM @callphone_archive_actor_type_sql;
EXECUTE callphone_archive_actor_type_stmt;
DEALLOCATE PREPARE callphone_archive_actor_type_stmt;

SET @callphone_archive_expiry_index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_wecom_archive_message'
    AND INDEX_NAME = 'idx_cp_wecom_archive_expiry');
SET @callphone_archive_expiry_index_sql := IF(@callphone_archive_expiry_index_exists > 0,
  'SELECT 1',
  'ALTER TABLE `cp_wecom_archive_message` ADD KEY `idx_cp_wecom_archive_expiry` (`tenant_id`,`expires_at`)');
PREPARE callphone_archive_expiry_index_stmt FROM @callphone_archive_expiry_index_sql;
EXECUTE callphone_archive_expiry_index_stmt;
DEALLOCATE PREPARE callphone_archive_expiry_index_stmt;

-- The tenant-aware job processes one locked batch of at most 500 messages per tenant and run.
SET @callphone_archive_cleanup_job_id := (SELECT COALESCE(MAX(`id`), 0) + 1 FROM `infra_job`);
INSERT INTO `infra_job`
  (`id`,`name`,`status`,`handler_name`,`handler_param`,`cron_expression`,`retry_count`,`retry_interval`,`monitor_timeout`,
   `creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT @callphone_archive_cleanup_job_id, 'Call Phone 会话存档保留期清理', 1,
       'callPhoneWeComArchiveRetentionCleanupJob', '', '0 */15 * * * ?', 3, 60000, 300000,
       'callphone', CURRENT_TIMESTAMP, 'callphone', CURRENT_TIMESTAMP, b'0'
WHERE NOT EXISTS (SELECT 1 FROM `infra_job`
  WHERE `handler_name` = 'callPhoneWeComArchiveRetentionCleanupJob' AND `deleted` = b'0');

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 54;
