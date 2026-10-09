-- Safe to rerun: creates the tenant-owned stage configuration table if absent.
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
