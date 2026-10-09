-- Tenant-local, encrypted projection of authorized WeCom external contacts.
CREATE TABLE IF NOT EXISTS `cp_wecom_contact` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `external_user_id_hash` char(64) NOT NULL,
  `external_user_id_ciphertext` varchar(1024) NOT NULL,
  `name_search_hash` char(64) DEFAULT NULL,
  `name_ciphertext` varchar(2048) DEFAULT NULL,
  `profile_ciphertext` mediumtext NOT NULL,
  `external_type` varchar(20) NOT NULL DEFAULT 'external',
  `gender` tinyint DEFAULT NULL,
  `first_added_at` datetime(3) DEFAULT NULL,
  `external_created_at` datetime(3) DEFAULT NULL,
  `last_interaction_at` datetime(3) DEFAULT NULL,
  `last_synced_at` datetime(3) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_contact_tenant_external` (`tenant_id`,`external_user_id_hash`),
  KEY `idx_cp_wecom_contact_tenant_sync` (`tenant_id`,`last_synced_at`),
  KEY `idx_cp_wecom_contact_name_hash` (`tenant_id`,`name_search_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地加密企微客户投影';

CREATE TABLE IF NOT EXISTS `cp_wecom_contact_owner` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `contact_id` bigint NOT NULL,
  `owner_user_id_hash` char(64) NOT NULL,
  `owner_user_id_ciphertext` varchar(1024) NOT NULL,
  `owner_name_ciphertext` varchar(1024) DEFAULT NULL,
  `follow_info_ciphertext` mediumtext DEFAULT NULL,
  `first_followed_at` datetime(3) DEFAULT NULL,
  `last_synced_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_contact_owner` (`tenant_id`,`contact_id`,`owner_user_id_hash`),
  KEY `idx_cp_wecom_owner_contact` (`tenant_id`,`owner_user_id_hash`,`contact_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 企微客户跟进成员关系';

CREATE TABLE IF NOT EXISTS `cp_wecom_sync_job` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `requested_by` bigint NOT NULL,
  `resource_type` varchar(16) NOT NULL DEFAULT 'contact',
  `owner_user_id_hash` char(64) NOT NULL,
  `owner_user_id_ciphertext` varchar(1024) NOT NULL,
  `idempotency_key` varchar(64) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'queued',
  `total` int NOT NULL DEFAULT 0,
  `processed` int NOT NULL DEFAULT 0,
  `succeeded` int NOT NULL DEFAULT 0,
  `failed` int NOT NULL DEFAULT 0,
  `error_code` varchar(48) DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_sync_idempotency` (`tenant_id`,`requested_by`,`idempotency_key`),
  KEY `idx_cp_wecom_sync_owner_status` (`tenant_id`,`owner_user_id_hash`,`status`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 企微客户异步同步任务';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '企微客户','',2,4,@callphone_customers_id,'wecom-contacts','ep:user','callphone/customers/wecom-contacts/index','CallPhoneWeComContacts',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customers_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-contacts' AND `deleted`=b'0');
SET @callphone_wecom_contact_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-contacts' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_wecom_contact_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '读取企微客户' AS permission_name,'callphone:wecom:contact:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '同步企微客户','callphone:wecom:contact:sync',2
  UNION ALL SELECT '查看企微客户敏感信息','callphone:wecom:contact:pii',3
) permissions
WHERE @callphone_wecom_contact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
