-- Anonymous aggregate-only tracking-code visits. No visitor identifier, IP,
-- user-agent, name, phone, or raw request event is persisted.
SET @callphone_db := DATABASE();
SET @callphone_landing_url_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@callphone_db
    AND table_name='cp_acquisition_tracking_code'
    AND column_name='landing_url'
);
SET @callphone_landing_url_ddl := IF(
  @callphone_landing_url_exists=0,
  'ALTER TABLE `cp_acquisition_tracking_code` ADD COLUMN `landing_url` varchar(2048) DEFAULT NULL AFTER `welcome_text`',
  'SELECT 1'
);
PREPARE callphone_landing_url_stmt FROM @callphone_landing_url_ddl;
EXECUTE callphone_landing_url_stmt;
DEALLOCATE PREPARE callphone_landing_url_stmt;

SET @callphone_public_code_length := (
  SELECT character_maximum_length FROM information_schema.columns
  WHERE table_schema=@callphone_db
    AND table_name='cp_acquisition_tracking_code'
    AND column_name='public_code'
);
SET @callphone_public_code_ddl := IF(
  @callphone_public_code_length < 32,
  'ALTER TABLE `cp_acquisition_tracking_code` MODIFY COLUMN `public_code` varchar(32) NOT NULL',
  'SELECT 1'
);
PREPARE callphone_public_code_stmt FROM @callphone_public_code_ddl;
EXECUTE callphone_public_code_stmt;
DEALLOCATE PREPARE callphone_public_code_stmt;

CREATE TABLE IF NOT EXISTS `cp_acquisition_tracking_scan_daily` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `tracking_code_id` bigint NOT NULL,
  `channel_id` bigint NOT NULL,
  `event_day` date NOT NULL,
  `counter_bucket` tinyint unsigned NOT NULL DEFAULT 0,
  `scan_count` bigint NOT NULL DEFAULT 0,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_tracking_scan_tenant_code_day_bucket` (`tenant_id`,`tracking_code_id`,`event_day`,`counter_bucket`),
  KEY `idx_cp_tracking_scan_tenant_channel_day` (`tenant_id`,`channel_id`,`event_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 活码匿名扫码日聚合';

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 43;
