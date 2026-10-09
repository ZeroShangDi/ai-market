-- Recording metadata only. Audio bytes stay in the customer deployment's private encrypted volume.
CREATE TABLE IF NOT EXISTS `cp_call_recording_asset` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `call_record_id` bigint NOT NULL,
  `device_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `upload_id` varchar(100) NOT NULL,
  `object_key` varchar(80) NOT NULL,
  `content_type` varchar(40) NOT NULL,
  `size_bytes` bigint NOT NULL,
  `sha256` char(64) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_call_recording_call` (`tenant_id`,`call_record_id`,`deleted`),
  UNIQUE KEY `uk_cp_call_recording_upload` (`tenant_id`,`device_id`,`upload_id`,`deleted`),
  KEY `idx_cp_call_recording_owner` (`tenant_id`,`owner_user_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 私有录音元数据';

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 47;
