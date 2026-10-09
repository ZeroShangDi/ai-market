-- Upgrade for existing Call Phone installations. Safe to rerun.
CREATE TABLE IF NOT EXISTS `cp_customer_field` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `field_key` varchar(64) NOT NULL,
  `label` varchar(64) NOT NULL,
  `value_type` varchar(20) NOT NULL,
  `required` bit(1) NOT NULL DEFAULT b'0',
  `options_json` varchar(4000) DEFAULT NULL,
  `enabled` bit(1) NOT NULL DEFAULT b'1',
  `list_visible` bit(1) NOT NULL DEFAULT b'0',
  `sort` int NOT NULL DEFAULT 100,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_customer_field_tenant_key` (`tenant_id`,`field_key`),
  KEY `idx_cp_customer_field_tenant_enabled_sort` (`tenant_id`,`enabled`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户自定义字段定义';
