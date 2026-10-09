-- v30 may have been applied before the sync job was shared by contact/group sync.
SET @callphone_sync_resource_type_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cp_wecom_sync_job' AND COLUMN_NAME='resource_type');
SET @callphone_sync_resource_type_sql := IF(@callphone_sync_resource_type_exists=0,
  'ALTER TABLE `cp_wecom_sync_job` ADD COLUMN `resource_type` varchar(16) NOT NULL DEFAULT ''contact'' AFTER `requested_by`',
  'SELECT 1');
PREPARE callphone_sync_resource_type_stmt FROM @callphone_sync_resource_type_sql;
EXECUTE callphone_sync_resource_type_stmt;
DEALLOCATE PREPARE callphone_sync_resource_type_stmt;

CREATE TABLE IF NOT EXISTS `cp_wecom_group` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `chat_id_hash` char(64) NOT NULL,
  `chat_id_ciphertext` varchar(1024) NOT NULL,
  `name_search_hash` char(64) DEFAULT NULL,
  `profile_ciphertext` mediumtext NOT NULL,
  `owner_user_id_hash` char(64) DEFAULT NULL,
  `owner_user_id_ciphertext` varchar(1024) DEFAULT NULL,
  `owner_name_ciphertext` varchar(1024) DEFAULT NULL,
  `group_status` varchar(16) NOT NULL DEFAULT 'active',
  `member_count` int NOT NULL DEFAULT 0,
  `created_at` datetime(3) DEFAULT NULL,
  `last_synced_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_group_tenant_chat` (`tenant_id`,`chat_id_hash`),
  KEY `idx_cp_wecom_group_owner_sync` (`tenant_id`,`owner_user_id_hash`,`last_synced_at`),
  KEY `idx_cp_wecom_group_name` (`tenant_id`,`name_search_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地加密企微客户群投影';

CREATE TABLE IF NOT EXISTS `cp_wecom_group_member` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `group_id` bigint NOT NULL,
  `member_id_hash` char(64) NOT NULL,
  `member_id_ciphertext` varchar(1024) NOT NULL,
  `member_type` varchar(16) NOT NULL DEFAULT 'external',
  `member_name_ciphertext` varchar(2048) DEFAULT NULL,
  `member_info_ciphertext` mediumtext DEFAULT NULL,
  `join_time` datetime(3) DEFAULT NULL,
  `join_scene` varchar(32) DEFAULT NULL,
  `is_group_admin` bit(1) NOT NULL DEFAULT b'0',
  `is_active` bit(1) NOT NULL DEFAULT b'1',
  `last_synced_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_group_member` (`tenant_id`,`group_id`,`member_id_hash`),
  KEY `idx_cp_wecom_group_member_group` (`tenant_id`,`group_id`,`last_synced_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地加密企微群成员投影';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户群','',2,5,@callphone_customers_id,'wecom-groups','ep:chat-line-round','callphone/customers/wecom-groups/index','CallPhoneWeComGroups',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customers_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-groups' AND `deleted`=b'0');
SET @callphone_wecom_group_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-groups' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_wecom_group_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '读取企微客户群' AS permission_name,'callphone:wecom:group:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '同步企微客户群','callphone:wecom:group:sync',2
) permissions
WHERE @callphone_wecom_group_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
