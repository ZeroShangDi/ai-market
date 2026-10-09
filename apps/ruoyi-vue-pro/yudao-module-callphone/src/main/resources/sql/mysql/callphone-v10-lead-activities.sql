-- Call Phone lead follow-up activity log; safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS `cp_lead_activity` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL, `actor_user_id` bigint NOT NULL,
  `activity_type` varchar(24) NOT NULL, `outcome_code` varchar(32) DEFAULT NULL,
  `note_ciphertext` varchar(4096) NOT NULL, `next_follow_up_at` datetime(3) DEFAULT NULL,
  `call_record_id` bigint DEFAULT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_lead_activity_tenant_owner_time` (`tenant_id`,`owner_user_id`,`create_time`,`id`),
  KEY `idx_cp_lead_activity_tenant_lead_time` (`tenant_id`,`lead_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索跟进记录';
