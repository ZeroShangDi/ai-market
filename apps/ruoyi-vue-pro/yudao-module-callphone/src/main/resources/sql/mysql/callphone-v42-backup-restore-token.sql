-- Persist and atomically consume restore previews. Backups themselves exclude
-- cp_local_backup_* tables, so restoring business data cannot replace tokens.
CREATE TABLE IF NOT EXISTS `cp_local_backup_restore_token` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `backup_id` bigint NOT NULL,
  `actor_user_id` bigint NOT NULL,
  `token_hash` char(64) NOT NULL,
  `artifact_sha256` char(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `consumed_at` datetime(3) DEFAULT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_backup_restore_token` (`tenant_id`,`token_hash`),
  KEY `idx_cp_backup_restore_expiry` (`tenant_id`,`backup_id`,`expires_at`,`consumed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 单次恢复预览令牌';

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 40;
