-- One-time upgrade for databases created before Call Phone device pairing.
ALTER TABLE `cp_device` ADD COLUMN `device_key_hash` char(64) DEFAULT NULL;
CREATE TABLE IF NOT EXISTS `cp_desktop_pairing_code` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `owner_user_id` bigint NOT NULL,
  `code_hash` char(64) NOT NULL, `status` varchar(16) NOT NULL DEFAULT 'pending',
  `device_id` bigint DEFAULT NULL, `expires_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_pairing_tenant_hash_status_expiry` (`tenant_id`,`code_hash`,`status`,`expires_at`),
  KEY `idx_cp_pairing_tenant_owner_status_expiry` (`tenant_id`,`owner_user_id`,`status`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 电脑手机一次性配对码';
