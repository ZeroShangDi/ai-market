-- Safe to rerun: creates the initial lead pool table if absent.
CREATE TABLE IF NOT EXISTS `cp_lead` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `name_ciphertext` varchar(512) NOT NULL,
  `phone_ciphertext` varchar(512) NOT NULL,
  `phone_display` varchar(32) NOT NULL,
  `source_code` varchar(64) DEFAULT NULL,
  `score` tinyint unsigned NOT NULL DEFAULT 0,
  `owner_user_id` bigint DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'new',
  `idempotency_key` varchar(80) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_tenant_idempotency` (`tenant_id`,`idempotency_key`),
  KEY `idx_cp_lead_tenant_owner_status` (`tenant_id`,`owner_user_id`,`status`,`create_time`),
  KEY `idx_cp_lead_tenant_source` (`tenant_id`,`source_code`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索';
