-- Read-only channel analytics aggregates Call Phone records already in this tenant.
-- Visit metrics remain unavailable until the public scan flow is added.
SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_acquisition_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='acquisition' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '渠道数据','',2,8,@callphone_acquisition_id,'channel-analytics','ep:data-analysis','callphone/acquisition/analytics/index','CallPhoneAcquisitionAnalytics',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='channel-analytics' AND `deleted`=b'0');

SET @callphone_channel_analytics_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='channel-analytics' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '渠道数据查询','callphone:acquisition:analytics:list',3,1,@callphone_channel_analytics_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:acquisition:analytics:list' AND `deleted`=b'0');
