-- Tenant-owned UTM campaign link configuration. Visit and lead attribution is
-- deliberately not synthesized until the public landing/consent pipeline exists.
CREATE TABLE IF NOT EXISTS `cp_acquisition_marketing_link` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `name` varchar(50) NOT NULL,
  `destination_url` varchar(2048) NOT NULL,
  `channel_id` bigint NOT NULL,
  `utm_source` varchar(100) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_acq_link_tenant_status` (`tenant_id`,`status`,`create_time`),
  KEY `idx_cp_acq_link_tenant_channel` (`tenant_id`,`channel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 获客链接配置';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_acquisition_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='acquisition' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '获客链接','',2,6,@callphone_acquisition_id,'marketing-links','ep:link','callphone/acquisition/links/index','CallPhoneMarketingLinks',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='marketing-links' AND `deleted`=b'0');

SET @callphone_marketing_links_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='marketing-links' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT p.`name`,p.`permission`,3,p.`sort`,@callphone_marketing_links_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '获客链接查询' AS `name`,'callphone:acquisition:link:list' AS `permission`,1 AS `sort`
  UNION ALL SELECT '获客链接管理','callphone:acquisition:link:manage',2
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.`permission` AND m.`deleted`=b'0');
