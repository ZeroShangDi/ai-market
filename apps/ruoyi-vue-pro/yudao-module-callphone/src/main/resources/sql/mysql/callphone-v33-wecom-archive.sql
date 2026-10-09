CREATE TABLE IF NOT EXISTS `cp_wecom_archive_message` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `message_id_hash` char(64) NOT NULL,
  `conversation_id_hash` char(64) NOT NULL,
  `conversation_id_ciphertext` varchar(1024) NOT NULL,
  `conversation_type` varchar(24) NOT NULL,
  `message_type` varchar(32) NOT NULL,
  `message_time` datetime(3) NOT NULL,
  `participant_count` int NOT NULL DEFAULT 0,
  `participant_hashes_ciphertext` mediumtext NOT NULL,
  `customer_id_hash` char(64) DEFAULT NULL,
  `customer_id_ciphertext` varchar(1024) DEFAULT NULL,
  `content_ciphertext` mediumtext NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_archive_msg` (`tenant_id`,`message_id_hash`),
  KEY `idx_cp_wecom_archive_time` (`tenant_id`,`message_time`),
  KEY `idx_cp_wecom_archive_conversation` (`tenant_id`,`conversation_id_hash`,`message_time`),
  KEY `idx_cp_wecom_archive_type` (`tenant_id`,`conversation_type`,`message_type`,`message_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 加密企微会话存档消息';

CREATE TABLE IF NOT EXISTS `cp_wecom_archive_sync_cursor` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `cursor_key_hash` char(64) NOT NULL,
  `cursor_ciphertext` mediumtext DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'disabled',
  `last_sync_at` datetime(3) DEFAULT NULL,
  `error_code` varchar(64) DEFAULT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_archive_cursor` (`tenant_id`,`cursor_key_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 企微会话存档加密同步游标';

CREATE TABLE IF NOT EXISTS `cp_wecom_archive_access_audit` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `message_id` bigint NOT NULL,
  `actor_id` bigint NOT NULL,
  `actor_type` varchar(16) NOT NULL DEFAULT 'user',
  `purpose_ciphertext` varchar(4096) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_wecom_archive_access` (`tenant_id`,`message_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 会话存档内容读取审计';

CREATE TABLE IF NOT EXISTS `cp_wecom_archive_retention` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `retention_days` int NOT NULL DEFAULT 180,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_wecom_archive_retention_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 会话存档保留期限';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '会话存档','',2,7,@callphone_customers_id,'wecom-archive','ep:chat-dot-round','callphone/customers/wecom-archive/index','CallPhoneWeComArchive',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customers_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-archive' AND `deleted`=b'0');
SET @callphone_wecom_archive_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-archive' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_wecom_archive_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '读取企微会话存档' AS permission_name,'callphone:wecom:archive:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '查看企微会话内容','callphone:wecom:archive:view-content',2
  UNION ALL SELECT '管理会话存档保留期限','callphone:wecom:archive:manage-retention',3
) permissions
WHERE @callphone_wecom_archive_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
