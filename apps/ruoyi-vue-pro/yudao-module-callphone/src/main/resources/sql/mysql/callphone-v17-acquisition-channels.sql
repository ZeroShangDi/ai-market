-- Tenant-owned platform/channel dictionary shared by tracking codes and marketing links.
CREATE TABLE IF NOT EXISTS `cp_acquisition_channel` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `name` varchar(48) NOT NULL,
  `platform` varchar(20) NOT NULL,
  `channel_code` varchar(32) NOT NULL,
  `owner_user_id` bigint DEFAULT NULL,
  `attribution_window_days` smallint unsigned NOT NULL DEFAULT 30,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_acq_channel_tenant_code` (`tenant_id`,`channel_code`),
  KEY `idx_cp_acq_channel_tenant_status_platform` (`tenant_id`,`status`,`platform`),
  KEY `idx_cp_acq_channel_tenant_owner` (`tenant_id`,`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 获客平台与渠道字典';
