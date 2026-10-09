-- Call Phone outbound v1. Tenant/audit/deleted columns follow Yudao TenantBaseDO.
CREATE TABLE IF NOT EXISTS `cp_customer` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `name_ciphertext` varchar(512) NOT NULL,
  `phone_ciphertext` varchar(512) NOT NULL,
  `phone_display` varchar(32) NOT NULL,
  `stage` varchar(32) NOT NULL DEFAULT 'new',
  `source` varchar(64) DEFAULT NULL,
  `tags` varchar(512) DEFAULT NULL,
  `owner_user_id` bigint NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_customer_tenant_owner` (`tenant_id`,`owner_user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 自有客户';

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

CREATE TABLE IF NOT EXISTS `cp_customer_stage` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `stage_code` varchar(32) NOT NULL,
  `name` varchar(32) NOT NULL,
  `color` char(7) NOT NULL DEFAULT '#3B82F6',
  `sort` int NOT NULL DEFAULT 100,
  `enabled` bit(1) NOT NULL DEFAULT b'1',
  `system_default` bit(1) NOT NULL DEFAULT b'0',
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_customer_stage_tenant_code` (`tenant_id`,`stage_code`),
  KEY `idx_cp_customer_stage_tenant_enabled_sort` (`tenant_id`,`enabled`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户阶段配置';

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

CREATE TABLE IF NOT EXISTS `cp_lead_assignment` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL,
  `from_user_id` bigint DEFAULT NULL, `to_user_id` bigint DEFAULT NULL, `actor_user_id` bigint NOT NULL,
  `action` varchar(16) NOT NULL, `reason` varchar(200) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_lead_assignment_lead` (`tenant_id`,`lead_id`,`create_time`),
  KEY `idx_cp_lead_assignment_actor` (`tenant_id`,`actor_user_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索分配流转记录';

CREATE TABLE IF NOT EXISTS `cp_lead_conversion` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL, `customer_id` bigint NOT NULL,
  `lead_name_ciphertext` varchar(512) NOT NULL, `customer_name_ciphertext` varchar(512) NOT NULL,
  `phone_display` varchar(32) NOT NULL, `source_code` varchar(64) DEFAULT NULL, `converted_by` bigint NOT NULL, `note_ciphertext` varchar(2048) DEFAULT NULL,
  `idempotency_key` varchar(80) NOT NULL, `converted_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_conversion_tenant_lead` (`tenant_id`,`lead_id`),
  UNIQUE KEY `uk_cp_lead_conversion_tenant_idempotency` (`tenant_id`,`idempotency_key`),
  KEY `idx_cp_lead_conversion_tenant_time` (`tenant_id`,`converted_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索转化记录';

CREATE TABLE IF NOT EXISTS `cp_lead_activity` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL, `actor_user_id` bigint NOT NULL, `activity_type` varchar(24) NOT NULL,
  `outcome_code` varchar(32) DEFAULT NULL, `note_ciphertext` varchar(4096) NOT NULL,
  `next_follow_up_at` datetime(3) DEFAULT NULL, `call_record_id` bigint DEFAULT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_lead_activity_tenant_owner_time` (`tenant_id`,`owner_user_id`,`create_time`,`id`),
  KEY `idx_cp_lead_activity_tenant_lead_time` (`tenant_id`,`lead_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索跟进记录';

CREATE TABLE IF NOT EXISTS `cp_lead_archive_event` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL,
  `lead_name_ciphertext` varchar(512) NOT NULL, `phone_display` varchar(32) NOT NULL,
  `archive_type` varchar(24) NOT NULL, `reason_ciphertext` varchar(2048) NOT NULL,
  `target_lead_id` bigint DEFAULT NULL, `previous_owner_user_id` bigint DEFAULT NULL,
  `previous_status` varchar(16) NOT NULL, `archived_by` bigint NOT NULL,
  `archived_at` datetime(3) NOT NULL, `restored_at` datetime(3) DEFAULT NULL, `idempotency_key` varchar(80) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_archive_tenant_idempotency` (`tenant_id`,`idempotency_key`),
  KEY `idx_cp_lead_archive_tenant_actor_time` (`tenant_id`,`archived_by`,`archived_at`,`id`),
  KEY `idx_cp_lead_archive_tenant_lead` (`tenant_id`,`lead_id`,`archived_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索无效与重复归档审计';

CREATE TABLE IF NOT EXISTS `cp_device` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `owner_user_id` bigint NOT NULL,
  `display_name` varchar(128) NOT NULL, `platform` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'paired', `last_seen_at` datetime(3) DEFAULT NULL, `device_key_hash` char(64) DEFAULT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_device_tenant_owner_status` (`tenant_id`,`owner_user_id`,`status`,`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 配对设备';

CREATE TABLE IF NOT EXISTS `cp_call_record` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `customer_id` bigint NOT NULL,
  `call_dispatch_id` bigint DEFAULT NULL,
  `customer_name_ciphertext` varchar(512) NOT NULL,
  `phone_ciphertext` varchar(512) NOT NULL,
  `phone_display` varchar(32) NOT NULL,
  `direction` varchar(16) NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `device_id` bigint DEFAULT NULL,
  `status` varchar(24) NOT NULL,
  `result_code` varchar(24) DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `ended_at` datetime(3) DEFAULT NULL,
  `duration_seconds` int NOT NULL DEFAULT 0,
  `recording_state` varchar(16) NOT NULL DEFAULT 'none',
  `summary_state` varchar(16) NOT NULL DEFAULT 'unavailable',
  `next_step_ciphertext` varchar(2048) DEFAULT NULL,
  `note_ciphertext` text DEFAULT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_call_record_tenant_started` (`tenant_id`,`started_at`,`id`),
  KEY `idx_cp_call_record_tenant_owner_started` (`tenant_id`,`owner_user_id`,`started_at`),
  KEY `idx_cp_call_record_tenant_customer_started` (`tenant_id`,`customer_id`,`started_at`),
  KEY `idx_cp_call_record_tenant_result_started` (`tenant_id`,`result_code`,`started_at`),
  KEY `idx_cp_call_record_tenant_dispatch` (`tenant_id`,`call_dispatch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 通话记录';

CREATE TABLE IF NOT EXISTS `cp_call_dispatch` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `customer_id` bigint NOT NULL,
  `device_id` bigint NOT NULL, `requested_by` bigint NOT NULL, `phone_ciphertext` varchar(512) NOT NULL,
  `phone_display` varchar(32) NOT NULL, `status` varchar(24) NOT NULL,
  `source` varchar(32) NOT NULL, `script_code` varchar(64) DEFAULT NULL, `follow_up_status` varchar(32) DEFAULT NULL,
  `request_note` varchar(200) DEFAULT NULL,
  `idempotency_key` varchar(80) NOT NULL, `expires_at` datetime(3) NOT NULL,
  `call_record_id` bigint DEFAULT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_dispatch_tenant_request_idempotency` (`tenant_id`,`requested_by`,`idempotency_key`),
  KEY `idx_cp_dispatch_tenant_device_status_expiry` (`tenant_id`,`device_id`,`status`,`expires_at`),
  KEY `idx_cp_dispatch_tenant_customer_time` (`tenant_id`,`customer_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 外呼派发';

CREATE TABLE IF NOT EXISTS `cp_mobile_call_event` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `device_id` bigint NOT NULL,
  `device_event_id` varchar(100) NOT NULL, `event_type` varchar(24) NOT NULL,
  `dispatch_id` bigint DEFAULT NULL, `call_record_id` bigint DEFAULT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_mobile_event_device_key` (`tenant_id`,`device_id`,`device_event_id`),
  KEY `idx_cp_mobile_event_dispatch` (`tenant_id`,`dispatch_id`,`create_time`),
  KEY `idx_cp_mobile_event_call` (`tenant_id`,`call_record_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 移动端幂等事件';

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
