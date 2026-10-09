-- Persistent, tenant-scoped reusable round-robin assignment rules.
CREATE TABLE IF NOT EXISTS `cp_lead_assignment_rule` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `rule_name` varchar(100) NOT NULL,
  `enabled` bit(1) NOT NULL DEFAULT b'1',
  `cursor_index` int NOT NULL DEFAULT 0,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_assignment_rule_tenant_name` (`tenant_id`,`rule_name`,`deleted`),
  KEY `idx_cp_lead_assignment_rule_tenant_enabled` (`tenant_id`,`enabled`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索分配规则';

CREATE TABLE IF NOT EXISTS `cp_lead_assignment_rule_member` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `rule_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `sort_no` int NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_lead_assignment_rule_member_user` (`tenant_id`,`rule_id`,`user_id`,`deleted`),
  UNIQUE KEY `uk_cp_lead_assignment_rule_member_order` (`tenant_id`,`rule_id`,`sort_no`,`deleted`),
  KEY `idx_cp_lead_assignment_rule_member_user` (`tenant_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索分配规则成员顺序';

SET @callphone_db := DATABASE();
SET @callphone_rule_id_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@callphone_db AND table_name='cp_lead_assignment' AND column_name='rule_id'
);
SET @callphone_rule_id_ddl := IF(
  @callphone_rule_id_exists=0,
  'ALTER TABLE `cp_lead_assignment` ADD COLUMN `rule_id` bigint DEFAULT NULL AFTER `actor_user_id`',
  'SELECT 1'
);
PREPARE callphone_rule_id_stmt FROM @callphone_rule_id_ddl;
EXECUTE callphone_rule_id_stmt;
DEALLOCATE PREPARE callphone_rule_id_stmt;

SET @callphone_rule_audit_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@callphone_db AND table_name='cp_lead_assignment' AND index_name='idx_cp_lead_assignment_rule'
);
SET @callphone_rule_audit_index_ddl := IF(
  @callphone_rule_audit_index_exists=0,
  'ALTER TABLE `cp_lead_assignment` ADD KEY `idx_cp_lead_assignment_rule` (`tenant_id`,`rule_id`,`create_time`)',
  'SELECT 1'
);
PREPARE callphone_rule_audit_index_stmt FROM @callphone_rule_audit_index_ddl;
EXECUTE callphone_rule_audit_index_stmt;
DEALLOCATE PREPARE callphone_rule_audit_index_stmt;

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 46;
