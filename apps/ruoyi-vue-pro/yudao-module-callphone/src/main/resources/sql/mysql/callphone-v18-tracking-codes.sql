-- Call Phone configurable acquisition codes. This table stores configuration only;
-- real scan/lead attribution events are not synthesized by the admin API.
CREATE TABLE IF NOT EXISTS `cp_acquisition_tracking_code` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `public_code` varchar(24) NOT NULL,
  `name` varchar(48) NOT NULL,
  `code_type` varchar(32) NOT NULL,
  `channel_id` bigint NOT NULL,
  `employee_id` bigint DEFAULT NULL,
  `store_name` varchar(64) DEFAULT NULL,
  `match_rule` varchar(32) DEFAULT NULL,
  `welcome_text` varchar(500) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_acq_tracking_tenant_public` (`tenant_id`,`public_code`),
  KEY `idx_cp_acq_tracking_tenant_type_status` (`tenant_id`,`code_type`,`status`,`create_time`),
  KEY `idx_cp_acq_tracking_tenant_channel` (`tenant_id`,`channel_id`),
  KEY `idx_cp_acq_tracking_tenant_employee` (`tenant_id`,`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 活码配置';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_acquisition_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='acquisition' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT p.`name`,'',2,p.`sort`,@callphone_acquisition_id,p.`path`,'ep:full-screen','callphone/acquisition/tracking-codes/index',p.`component_name`,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '渠道活码' AS `name`,'channel-codes' AS `path`,'CallPhoneChannelCodes' AS `component_name`,1 AS `sort`
  UNION ALL SELECT '员工活码','employee-codes','CallPhoneEmployeeCodes',2
  UNION ALL SELECT '门店活码','store-codes','CallPhoneStoreCodes',3
  UNION ALL SELECT '识客活码','visitor-codes','CallPhoneVisitorCodes',4
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`parent_id`=@callphone_acquisition_id AND m.`path`=p.`path` AND m.`deleted`=b'0');

UPDATE `system_menu` SET `sort`=5 WHERE `parent_id`=@callphone_acquisition_id AND `path`='channels' AND `deleted`=b'0';

SET @callphone_channel_codes_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='channel-codes' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT p.`name`,p.`permission`,3,p.`sort`,@callphone_channel_codes_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '活码查询' AS `name`,'callphone:acquisition:code:list' AS `permission`,1 AS `sort`
  UNION ALL SELECT '活码管理','callphone:acquisition:code:manage',2
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.`permission` AND m.`deleted`=b'0');
