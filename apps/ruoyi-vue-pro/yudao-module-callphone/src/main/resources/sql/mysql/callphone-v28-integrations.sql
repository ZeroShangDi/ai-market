-- Credentials are encrypted with the deployment-owned CALLPHONE_PII_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS `cp_integration_connection` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `provider` varchar(32) NOT NULL,
  `display_name` varchar(80) NOT NULL,
  `endpoint_url` varchar(255) DEFAULT NULL,
  `scopes_json` varchar(2000) NOT NULL DEFAULT '[]',
  `sync_interval_minutes` int NOT NULL DEFAULT 0,
  `credential_ciphertext` mediumtext DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'not_connected',
  `last_error_code` varchar(64) DEFAULT NULL,
  `last_checked_at` datetime(3) DEFAULT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_integration_tenant_provider` (`tenant_id`,`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 扩展服务连接配置';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_settings_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='settings' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '扩展服务配置','',2,14,@callphone_settings_id,'integrations','ep:connection','callphone/system/integrations/index','CallPhoneIntegrations',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_settings_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='integrations' AND `deleted`=b'0');
SET @callphone_integrations_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='integrations' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_integrations_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '读取扩展服务配置' AS permission_name,'callphone:integration:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '管理扩展服务凭据','callphone:integration:manage',2
) permissions
WHERE @callphone_integrations_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
