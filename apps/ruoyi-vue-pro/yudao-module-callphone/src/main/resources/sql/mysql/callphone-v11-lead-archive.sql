-- Call Phone lead invalid/duplicate archive audit; safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS `cp_lead_archive_event` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL,
  `lead_name_ciphertext` varchar(512) NOT NULL, `phone_display` varchar(32) NOT NULL,
  `archive_type` varchar(24) NOT NULL, `reason_ciphertext` varchar(2048) NOT NULL,
  `target_lead_id` bigint DEFAULT NULL, `previous_owner_user_id` bigint DEFAULT NULL,
  `previous_status` varchar(16) NOT NULL, `archived_by` bigint NOT NULL,
  `archived_at` datetime(3) NOT NULL, `restored_at` datetime(3) DEFAULT NULL,
  `idempotency_key` varchar(80) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_archive_tenant_idempotency` (`tenant_id`,`idempotency_key`),
  KEY `idx_cp_lead_archive_tenant_actor_time` (`tenant_id`,`archived_by`,`archived_at`,`id`),
  KEY `idx_cp_lead_archive_tenant_lead` (`tenant_id`,`lead_id`,`archived_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索无效与重复归档审计';
