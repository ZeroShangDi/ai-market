-- Upgrade for existing installations. Fresh databases get this table from callphone-outbound-v1.sql.
CREATE TABLE IF NOT EXISTS `cp_lead_conversion` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `lead_id` bigint NOT NULL,
  `customer_id` bigint NOT NULL,
  `lead_name_ciphertext` varchar(512) NOT NULL,
  `customer_name_ciphertext` varchar(512) NOT NULL,
  `phone_display` varchar(32) NOT NULL,
  `source_code` varchar(64) DEFAULT NULL,
  `converted_by` bigint NOT NULL,
  `note_ciphertext` varchar(2048) DEFAULT NULL,
  `idempotency_key` varchar(80) NOT NULL,
  `converted_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_conversion_tenant_lead` (`tenant_id`,`lead_id`),
  UNIQUE KEY `uk_cp_lead_conversion_tenant_idempotency` (`tenant_id`,`idempotency_key`),
  KEY `idx_cp_lead_conversion_tenant_time` (`tenant_id`,`converted_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索转化记录';
