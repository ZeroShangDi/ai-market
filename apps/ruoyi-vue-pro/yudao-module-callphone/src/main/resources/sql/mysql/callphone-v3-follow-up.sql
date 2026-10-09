-- One-time upgrade for existing Call Phone databases. New databases get this table from v1 schema.
CREATE TABLE IF NOT EXISTS `cp_follow_up_task` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `customer_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `title_ciphertext` varchar(1024) NOT NULL,
  `content_ciphertext` varchar(4096) DEFAULT NULL,
  `due_at` datetime(3) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `source_call_record_id` bigint DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_followup_tenant_owner_status_due` (`tenant_id`,`owner_user_id`,`status`,`due_at`),
  KEY `idx_cp_followup_tenant_customer_due` (`tenant_id`,`customer_id`,`due_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户跟进事项';
