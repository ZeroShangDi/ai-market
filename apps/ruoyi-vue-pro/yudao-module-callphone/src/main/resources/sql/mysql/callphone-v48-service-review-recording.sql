-- Recording playback is separately permissioned and access is audited without
-- copying audio bytes or customer PII into the database.
CREATE TABLE IF NOT EXISTS `cp_call_recording_access_audit` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `call_record_id` bigint NOT NULL,
  `actor_id` bigint NOT NULL,
  `access_purpose` varchar(32) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_recording_access_call` (`tenant_id`,`call_record_id`,`create_time`),
  KEY `idx_cp_recording_access_actor` (`tenant_id`,`actor_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 通话录音读取审计';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_service_review_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='service-review' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '播放质检录音','callphone:service:review:recording',3,3,@callphone_service_review_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_service_review_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:service:review:recording' AND `deleted`=b'0');

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 48;
