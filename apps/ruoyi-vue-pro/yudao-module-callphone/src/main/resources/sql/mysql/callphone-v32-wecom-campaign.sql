CREATE TABLE IF NOT EXISTS `cp_wecom_campaign` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `campaign_name_ciphertext` varchar(2048) NOT NULL,
  `message_content_ciphertext` mediumtext NOT NULL,
  `criteria_ciphertext` mediumtext NOT NULL,
  `estimated_recipient_count` int DEFAULT NULL,
  `estimated_at` datetime(3) DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'draft',
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_wecom_campaign_tenant_status` (`tenant_id`,`status`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地加密企微运营草稿';

CREATE TABLE IF NOT EXISTS `cp_wecom_campaign_audit` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `campaign_id` bigint NOT NULL,
  `action` varchar(24) NOT NULL,
  `actor_id` bigint NOT NULL,
  `note_ciphertext` varchar(4096) DEFAULT NULL,
  `campaign_version` int NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_wecom_campaign_audit` (`tenant_id`,`campaign_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 企微运营审批流转审计';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户运营','',2,6,@callphone_customers_id,'wecom-campaigns','ep:promotion','callphone/customers/wecom-campaigns/index','CallPhoneWeComCampaigns',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customers_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-campaigns' AND `deleted`=b'0');
SET @callphone_wecom_campaign_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='wecom-campaigns' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_wecom_campaign_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '读取企微运营草稿' AS permission_name,'callphone:wecom:campaign:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '编辑企微运营草稿','callphone:wecom:campaign:save',2
  UNION ALL SELECT '估算企微运营人群','callphone:wecom:campaign:estimate',3
  UNION ALL SELECT '提交企微运营审批','callphone:wecom:campaign:submit',4
  UNION ALL SELECT '撤回企微运营审批','callphone:wecom:campaign:withdraw',5
) permissions
WHERE @callphone_wecom_campaign_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
