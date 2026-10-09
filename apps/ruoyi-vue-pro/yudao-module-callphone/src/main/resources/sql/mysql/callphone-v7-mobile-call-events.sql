-- Add-on migration for mobile accept/decline/complete APIs.
ALTER TABLE `cp_call_dispatch` ADD COLUMN `call_record_id` bigint DEFAULT NULL;
ALTER TABLE `cp_call_record` ADD COLUMN `call_dispatch_id` bigint DEFAULT NULL;
CREATE INDEX `idx_cp_call_record_tenant_dispatch` ON `cp_call_record` (`tenant_id`,`call_dispatch_id`);
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
