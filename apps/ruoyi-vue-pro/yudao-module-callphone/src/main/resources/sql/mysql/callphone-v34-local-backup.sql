CREATE TABLE IF NOT EXISTS `cp_local_backup_job` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `status` varchar(24) NOT NULL DEFAULT 'completed',
  `schema_version` int NOT NULL DEFAULT 34,
  `artifact_sha256` char(64) NOT NULL,
  `artifact_size` bigint NOT NULL DEFAULT 0,
  `table_count` int NOT NULL DEFAULT 0,
  `row_count` bigint NOT NULL DEFAULT 0,
  `completed_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_local_backup_tenant_created` (`tenant_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 租户本地加密备份元数据';

CREATE TABLE IF NOT EXISTS `cp_local_backup_audit` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `backup_id` bigint NOT NULL,
  `action` varchar(24) NOT NULL,
  `actor_id` bigint NOT NULL,
  `summary_ciphertext` varchar(4096) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_local_backup_audit` (`tenant_id`,`backup_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地备份与恢复操作审计';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_settings_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='settings' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '本地备份与恢复','',2,17,@callphone_settings_id,'local-backups','ep:folder-opened','callphone/system/local-backups/index','CallPhoneLocalBackups',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_settings_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='local-backups' AND `deleted`=b'0');
SET @callphone_local_backup_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='local-backups' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_local_backup_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '读取本地备份' AS permission_name,'callphone:backup:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '创建本地备份','callphone:backup:create',2
  UNION ALL SELECT '下载本地备份','callphone:backup:download',3
  UNION ALL SELECT '恢复本地备份','callphone:backup:restore',4
) permissions
WHERE @callphone_local_backup_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
